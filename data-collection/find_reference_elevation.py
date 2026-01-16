#!/usr/bin/env python3
"""
Find the normalization reference elevation where Bank Storage starts counting from.
This is the elevation where storage from dead pool equals the offset (1.8M acre-ft).
"""
import sys
import os
from datetime import date
import psycopg2
from psycopg2.extras import RealDictCursor

# Add the parent directory to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from utils.database import get_db_connection

def find_reference_elevation():
    """Find the elevation where storage from dead pool equals the offset."""
    
    target_storage = 1_796_204  # acre-ft (the offset)
    current_elevation = 3539.18
    bank_storage = 4_601_210
    total_storage = 6_397_414
    
    print('='*70)
    print('FINDING THE NORMALIZATION REFERENCE ELEVATION')
    print('='*70)
    print()
    print(f'Looking for elevation where storage from dead pool = {target_storage:,} acre-ft')
    print()
    
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Find elevations where storage is close to the target
            cur.execute("""
                WITH elevation_data AS (
                    SELECT 
                        FLOOR(elevation)::INTEGER as elevation_floor,
                        elevation,
                        content::BIGINT as content,
                        date
                    FROM water_measurements
                    WHERE elevation IS NOT NULL AND content IS NOT NULL
                        AND elevation >= 3370
                ),
                elevation_storage_max AS (
                    SELECT 
                        ed.elevation_floor,
                        MAX(ed.elevation) as elevation,
                        MAX(ed.content::BIGINT) as content
                    FROM elevation_data ed
                    GROUP BY ed.elevation_floor
                )
                SELECT 
                    elevation_floor,
                    elevation,
                    content,
                    ABS(content - %s) as difference
                FROM elevation_storage_max
                WHERE content <= %s * 1.2  -- Within 20% of target
                ORDER BY ABS(content - %s)
                LIMIT 10
            """, (target_storage, target_storage, target_storage))
            
            results = cur.fetchall()
            
            if results:
                closest = results[0]
                reference_elevation = float(closest['elevation'])
                reference_floor = int(closest['elevation_floor'])
                reference_content = int(closest['content'])
                
                print('Closest match:')
                print(f'  Elevation: {reference_floor} ft ({reference_elevation:.2f} ft)')
                print(f'  Storage: {reference_content:,} acre-ft')
                print(f'  Difference: {int(closest["difference"]):,} acre-ft')
                print()
                
                # Calculate storage from reference to current
                storage_from_ref_to_current = total_storage - reference_content
                
                print('='*70)
                print('ANSWERS TO YOUR QUESTIONS:')
                print('='*70)
                print()
                print('1. BANK STORAGE (4.6M acre-ft):')
                print(f'   - Storage from {reference_floor} ft to {current_elevation:.1f} ft')
                print(f'   - This is the "upper" portion above {reference_floor} ft')
                print(f'   - Bank Storage = Total - Offset = {total_storage:,} - {reference_content:,} = {storage_from_ref_to_current:,}')
                print()
                print('2. OFFSET (1.8M acre-ft):')
                print(f'   - Storage from DEAD POOL (3370 ft) to {reference_floor} ft')
                print(f'   - This is the "lower" portion below {reference_floor} ft')
                print(f'   - Offset = {reference_content:,} acre-ft')
                print()
                print('3. TOTAL STORAGE (6.4M acre-ft):')
                print(f'   - Storage from DEAD POOL (3370 ft) to CURRENT ELEVATION ({current_elevation:.1f} ft)')
                print(f'   - This is the COMPLETE storage: {reference_content:,} (lower) + {storage_from_ref_to_current:,} (upper) = {total_storage:,} (total)')
                print()
                
                # Verify the math
                print('Verification:')
                print(f'  Storage at {reference_floor} ft: {reference_content:,} acre-ft (from dead pool)')
                print(f'  Storage at {current_elevation:.1f} ft: {total_storage:,} acre-ft (from dead pool)')
                print(f'  Storage from {reference_floor} to {current_elevation:.1f} ft: {storage_from_ref_to_current:,} acre-ft')
                print(f'  Bank Storage (from API): {bank_storage:,} acre-ft')
                diff = abs(storage_from_ref_to_current - bank_storage)
                match = '✓ YES' if diff < 100000 else '✗ NO'
                print(f'  Match: {match} (difference: {diff:,} acre-ft)')
                print()
                
                # Show nearby elevations for context
                print('Nearby elevations for context:')
                cur.execute("""
                    SELECT 
                        FLOOR(elevation)::INTEGER as elevation_floor,
                        MAX(elevation) as elevation,
                        MAX(content::BIGINT) as content
                    FROM water_measurements
                    WHERE elevation >= 3370 AND elevation <= 3600
                        AND content IS NOT NULL
                    GROUP BY FLOOR(elevation)::INTEGER
                    HAVING MAX(content::BIGINT) BETWEEN %s * 0.5 AND %s * 2
                    ORDER BY elevation_floor
                """, (target_storage, target_storage))
                
                nearby = cur.fetchall()
                for row in nearby[:10]:
                    print(f'  {int(row["elevation_floor"])} ft: {int(row["content"]):,} acre-ft')
                
            else:
                print('No close match found.')
                
    finally:
        conn.close()

if __name__ == '__main__':
    find_reference_elevation()

