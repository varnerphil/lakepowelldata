#!/usr/bin/env python3
"""
Re-import all water measurement data with correct storage values.

This script fixes the storage/content values by using itemId 509 (Lake/Reservoir Storage)
which provides total storage from dead pool, instead of itemId 4276 (Bank Storage) which
required an offset and didn't work correctly for historical data.

Historical max (Jul 14, 1983): 25,695,200 af at 3708.34 ft
Current (Jan 2026): ~6,337,000 af at ~3538 ft
"""

import os
import sys
from datetime import date, datetime, timedelta
import psycopg2
from psycopg2.extras import execute_values

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from collectors.usbr_csv_collector import fetch_all_water_data

def get_db_connection():
    """Get database connection from environment."""
    # Try to load from .env file
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


def reimport_year(conn, year: int):
    """Re-import data for a specific year."""
    start_date = date(year, 1, 1)
    end_date = min(date(year, 12, 31), date.today())
    
    print(f"  Fetching data for {year}...")
    records = fetch_all_water_data(start_date, end_date)
    
    if not records:
        print(f"  No data for {year}")
        return 0
    
    print(f"  Inserting {len(records)} records...")
    
    cur = conn.cursor()
    
    # Use upsert to update existing records
    insert_query = """
        INSERT INTO water_measurements (date, elevation, content, inflow, outflow)
        VALUES %s
        ON CONFLICT (date) DO UPDATE SET
            elevation = EXCLUDED.elevation,
            content = EXCLUDED.content,
            inflow = EXCLUDED.inflow,
            outflow = EXCLUDED.outflow,
            updated_at = CURRENT_TIMESTAMP
    """
    
    values = [
        (
            record['date'],
            record['elevation'],
            record['content'],
            record['inflow'],
            record['outflow']
        )
        for record in records
    ]
    
    execute_values(cur, insert_query, values)
    conn.commit()
    
    return len(records)


def main():
    print("=== Re-importing Water Data with Correct Storage Values ===")
    print("Using itemId 509 (Lake/Reservoir Storage) for total storage from dead pool\n")
    
    conn = get_db_connection()
    
    # Import data year by year from 1963 to present
    # Lake Powell began filling in 1963
    start_year = 1963
    end_year = date.today().year
    
    total_records = 0
    
    for year in range(start_year, end_year + 1):
        try:
            count = reimport_year(conn, year)
            total_records += count
            print(f"  ✓ {year}: {count} records")
        except Exception as e:
            print(f"  ✗ {year}: Error - {e}")
    
    print(f"\n=== Complete ===")
    print(f"Total records imported: {total_records:,}")
    
    # Verify the data
    cur = conn.cursor()
    cur.execute("""
        SELECT date, elevation, content
        FROM water_measurements
        WHERE date IN ('1983-07-14', '2023-04-13', (SELECT MAX(date) FROM water_measurements))
        ORDER BY date
    """)
    
    print("\nVerification:")
    for row in cur.fetchall():
        print(f"  {row[0]}: Elev={row[1]:.2f} ft, Content={row[2]:,} af")
    
    conn.close()


if __name__ == '__main__':
    main()


