#!/usr/bin/env python3
"""
Calculate and save elevation-storage capacity data from actual water measurements.

This script:
1. Queries water_measurements to find the maximum content at each elevation floor
2. Calculates the incremental storage per foot (difference between consecutive elevations)
3. Saves the results to the elevation_storage_capacity table

Can be rerun at any time to recalculate with the latest data.

Usage:
    python -m migrations.calculate_elevation_storage
"""

import os
import sys
import psycopg2
from psycopg2.extras import execute_values

# Full pool capacity (official value)
FULL_POOL_CAPACITY = 24_322_000  # acre-feet


def get_db_connection():
    """Get database connection from environment."""
    env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, val = line.strip().split('=', 1)
                    os.environ[key] = val
    
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")
    
    return psycopg2.connect(database_url)


def calculate_elevation_storage(conn):
    """
    Calculate storage per foot from actual water measurement data.
    
    Returns a list of tuples: (elevation, storage_at_elevation, storage_per_foot, percent_of_full, percent_per_foot)
    """
    cur = conn.cursor()
    
    # Dead pool elevation - below this, no water can be released
    DEAD_POOL_ELEVATION = 3370
    
    # Get the maximum content at each elevation floor from actual measurements
    cur.execute("""
        SELECT 
            FLOOR(elevation)::INTEGER as elev_floor,
            MAX(content) as max_content
        FROM water_measurements
        WHERE content > 0 AND elevation IS NOT NULL
        GROUP BY FLOOR(elevation)::INTEGER
        ORDER BY elev_floor
    """)
    
    rows = cur.fetchall()
    
    if not rows:
        print("No data found in water_measurements")
        return []
    
    # Get the lowest elevation and its storage from actual data
    first_data_elev, first_data_storage = rows[0]
    
    # Calculate storage per foot for dead pool to first data point
    # Dead pool (3370) = 0 af, first data point has known storage
    dead_pool_range = first_data_elev - DEAD_POOL_ELEVATION
    if dead_pool_range > 0:
        avg_storage_per_foot_dead_pool = int(first_data_storage / dead_pool_range)
    else:
        avg_storage_per_foot_dead_pool = None
    
    # Start results with dead pool entry
    results = []
    
    # Add dead pool at 3370 with 0 storage
    # storage_per_foot represents the average for the range from dead pool to first data point
    # percent_per_foot is the average % per foot for the dead pool range
    if avg_storage_per_foot_dead_pool:
        dead_pool_pct_per_foot = round((avg_storage_per_foot_dead_pool / FULL_POOL_CAPACITY) * 100, 3)
    else:
        dead_pool_pct_per_foot = None
    results.append((DEAD_POOL_ELEVATION, 0, avg_storage_per_foot_dead_pool, 0.0, dead_pool_pct_per_foot))
    
    # Calculate incremental storage per foot for actual data
    prev_content = 0  # Start from dead pool (0 storage)
    prev_elev = DEAD_POOL_ELEVATION
    
    for elev, content in rows:
        # Calculate storage per foot (difference from previous elevation)
        if elev == prev_elev + 1:
            # Consecutive elevations - exact per-foot value
            storage_per_foot = content - prev_content
        elif prev_elev == DEAD_POOL_ELEVATION:
            # First data point after dead pool - use average for the gap
            storage_per_foot = avg_storage_per_foot_dead_pool
        else:
            # Gap in elevations - set to None
            storage_per_foot = None
        
        # Calculate percent of full pool (cumulative)
        percent_of_full = round((content / FULL_POOL_CAPACITY) * 100, 2)
        
        # Calculate percent per foot (what % of total capacity this foot adds)
        if storage_per_foot:
            percent_per_foot = round((storage_per_foot / FULL_POOL_CAPACITY) * 100, 3)
        else:
            percent_per_foot = None
        
        results.append((elev, content, storage_per_foot, percent_of_full, percent_per_foot))
        
        prev_content = content
        prev_elev = elev
    
    # Smooth outliers - values that are < 50% or > 200% of neighbor average
    # Run multiple passes to handle cascading outliers
    print("Step 1: Removing extreme outliers...")
    current_results = list(results)
    
    for pass_num in range(3):  # Up to 3 passes
        smoothed_results = []
        changes = 0
        
        for i, row in enumerate(current_results):
            elev, storage, per_foot, pct_full, pct_per_foot = row
            
            if per_foot is None:
                smoothed_results.append(row)
                continue
            
            # Get neighbor values from current (possibly already smoothed) results
            prev_per_foot = current_results[i-1][2] if i > 0 and current_results[i-1][2] else None
            next_per_foot = current_results[i+1][2] if i < len(current_results)-1 and current_results[i+1][2] else None
            
            # Check if outlier
            if prev_per_foot and next_per_foot:
                neighbor_avg = (prev_per_foot + next_per_foot) / 2
                if per_foot < neighbor_avg * 0.5 or per_foot > neighbor_avg * 2:
                    # Smooth to neighbor average
                    smoothed_per_foot = int(neighbor_avg)
                    smoothed_pct_per_foot = round((smoothed_per_foot / FULL_POOL_CAPACITY) * 100, 3)
                    print(f"  Pass {pass_num + 1}: Smoothing {elev} ft: {per_foot:,} -> {smoothed_per_foot:,} ({per_foot/neighbor_avg*100:.0f}% of neighbors)")
                    smoothed_results.append((elev, storage, smoothed_per_foot, pct_full, smoothed_pct_per_foot))
                    changes += 1
                    continue
            
            smoothed_results.append(row)
        
        current_results = smoothed_results
        
        if changes == 0:
            print(f"  Pass {pass_num + 1}: No more outliers found")
            break
    
    # Apply 5-point moving average for smoother visualization
    print("\nStep 2: Applying 5-point moving average...")
    smoothed_results = []
    
    for i, row in enumerate(current_results):
        elev, storage, per_foot, pct_full, pct_per_foot = row
        
        if per_foot is None:
            smoothed_results.append(row)
            continue
        
        # Get window of values for moving average (2 before, current, 2 after)
        window = []
        for j in range(max(0, i-2), min(len(current_results), i+3)):
            if current_results[j][2] is not None:
                window.append(current_results[j][2])
        
        if len(window) >= 3:  # Need at least 3 points for meaningful average
            smoothed_per_foot = int(sum(window) / len(window))
            smoothed_pct_per_foot = round((smoothed_per_foot / FULL_POOL_CAPACITY) * 100, 3)
            smoothed_results.append((elev, storage, smoothed_per_foot, pct_full, smoothed_pct_per_foot))
        else:
            smoothed_results.append(row)
    
    # Step 3: Fix edge effects at top elevations
    # Storage per foot should generally increase with elevation for a V-shaped lake
    # For the top ~20 elevations, ensure values don't drop significantly
    print("\nStep 3: Fixing edge effects at top elevations...")
    final_results = list(smoothed_results)
    
    # Find the typical value for top elevations (around 3690-3700)
    top_reference_values = []
    for i in range(len(final_results) - 1, -1, -1):
        elev = final_results[i][0]
        per_foot = final_results[i][2]
        if per_foot and 3690 <= elev <= 3700:
            top_reference_values.append(per_foot)
    
    if top_reference_values:
        top_reference = int(sum(top_reference_values) / len(top_reference_values))
        print(f"  Reference value for top elevations (3690-3700 avg): {top_reference:,}")
        
        # Fix any top elevation (3700+) that is significantly below the reference
        for i in range(len(final_results)):
            elev, storage, per_foot, pct_full, pct_per_foot = final_results[i]
            if elev >= 3700 and per_foot and per_foot < top_reference * 0.95:
                # Boost to reference value
                fixed_per_foot = top_reference
                fixed_pct_per_foot = round((fixed_per_foot / FULL_POOL_CAPACITY) * 100, 3)
                print(f"  Fixing {elev} ft: {per_foot:,} -> {fixed_per_foot:,} (was {per_foot/top_reference*100:.0f}% of reference)")
                final_results[i] = (elev, storage, fixed_per_foot, pct_full, fixed_pct_per_foot)
    
    # Count how much the moving average changed values
    changes = sum(1 for i in range(len(current_results)) 
                  if current_results[i][2] and final_results[i][2] 
                  and abs(current_results[i][2] - final_results[i][2]) > 1000)
    print(f"  Applied smoothing to {len(final_results)} records ({changes} significantly changed)")
    
    return final_results


def save_to_database(conn, data):
    """Save the calculated data to the elevation_storage_capacity table."""
    cur = conn.cursor()
    
    # Drop and recreate table
    cur.execute("DROP TABLE IF EXISTS elevation_storage_capacity CASCADE")
    
    cur.execute("""
        CREATE TABLE elevation_storage_capacity (
            elevation INTEGER PRIMARY KEY,
            storage_at_elevation BIGINT NOT NULL,
            storage_per_foot INTEGER,
            percent_of_full NUMERIC(5,2),
            percent_per_foot NUMERIC(5,3),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Insert data
    execute_values(
        cur,
        """
        INSERT INTO elevation_storage_capacity 
            (elevation, storage_at_elevation, storage_per_foot, percent_of_full, percent_per_foot)
        VALUES %s
        """,
        data
    )
    
    # Create index for fast lookups
    cur.execute("CREATE INDEX idx_elevation_storage_elevation ON elevation_storage_capacity(elevation)")
    
    # Add table comment
    cur.execute("""
        COMMENT ON TABLE elevation_storage_capacity IS 
        'Lake Powell elevation-storage capacity lookup table calculated from actual water measurements. '
        'storage_at_elevation is the total storage at that elevation. '
        'storage_per_foot is the incremental storage for that 1-foot band.'
    """)
    
    conn.commit()
    
    return len(data)


def main():
    print("=== Calculating Elevation-Storage Capacity ===\n")
    
    conn = get_db_connection()
    
    # Calculate from actual data
    print("Querying water_measurements for elevation-storage data...")
    data = calculate_elevation_storage(conn)
    
    if not data:
        print("No data to save")
        return
    
    print(f"Calculated {len(data)} elevation-storage records")
    
    # Show sample data
    print("\nSample data:")
    print("Elevation | Storage at Elev | Per Foot | % Full | % Per Ft")
    print("-" * 65)
    
    # Show first 5, then some middle ones, then last 5
    samples = data[:5] + data[len(data)//2-2:len(data)//2+3] + data[-5:]
    for elev, storage, per_foot, pct, pct_per_ft in samples:
        pf_str = f"{per_foot:,}" if per_foot else "N/A"
        ppf_str = f"{pct_per_ft:.3f}%" if pct_per_ft else "N/A"
        print(f"{elev:>9} | {storage:>15,} | {pf_str:>8} | {pct:>5}% | {ppf_str:>8}")
    
    # Save to database
    print("\nSaving to database...")
    count = save_to_database(conn, data)
    print(f"Saved {count} records to elevation_storage_capacity table")
    
    # Verify
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            MIN(elevation) as min_elev,
            MAX(elevation) as max_elev,
            MIN(storage_at_elevation) as min_storage,
            MAX(storage_at_elevation) as max_storage,
            COUNT(*) as count
        FROM elevation_storage_capacity
    """)
    row = cur.fetchone()
    print(f"\nVerification:")
    print(f"  Elevation range: {row[0]} - {row[1]} ft")
    print(f"  Storage range: {row[2]:,} - {row[3]:,} af")
    print(f"  Total records: {row[4]}")
    
    conn.close()
    print("\nDone!")


if __name__ == '__main__':
    main()

