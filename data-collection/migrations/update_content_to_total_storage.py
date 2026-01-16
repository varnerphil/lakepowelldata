#!/usr/bin/env python3
"""
Update existing content values in the database to add the Bank Storage offset.

This converts Bank Storage values (normalized from ~3480 ft) to total storage 
from dead pool (3370 ft) by adding 1,796,204 acre-feet.

Only updates records where content appears to be Bank Storage (too low for the elevation).
"""
import sys
import os
from datetime import date

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from utils.database import get_db_connection
import psycopg2
from psycopg2.extras import RealDictCursor

BANK_STORAGE_TO_TOTAL_OFFSET = 1_796_204  # Storage from dead pool to normalization reference

def update_content_values():
    """Update content values that appear to be Bank Storage to total storage."""
    
    print('='*70)
    print('UPDATING CONTENT VALUES TO TOTAL STORAGE')
    print('='*70)
    print()
    print(f'Adding offset: {BANK_STORAGE_TO_TOTAL_OFFSET:,} acre-ft')
    print('(Converts Bank Storage to total storage from dead pool)')
    print()
    
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # First, check how many records need updating
            # Bank Storage values are normalized and will be lower than total storage
            # We'll update records where content seems too low for the elevation
            # At 3539 ft, Bank Storage is ~4.6M, total should be ~6.4M
            # At lower elevations, we need to be more careful, but generally
            # if content < 5.5M and elevation >= 3520, it's likely Bank Storage
            cur.execute("""
                SELECT COUNT(*) as count
                FROM water_measurements
                WHERE content IS NOT NULL
                    AND elevation IS NOT NULL
                    AND elevation >= 3520
                    AND content < 5_500_000  -- Likely Bank Storage (too low for elevation)
            """)
            
            result = cur.fetchone()
            count_to_update = result['count'] if result else 0
            
            print(f'Records that appear to be Bank Storage (need offset): {count_to_update:,}')
            print()
            
            if count_to_update == 0:
                print('No records need updating. All content values appear to be total storage.')
                return
            
            # Show a sample of what will be updated
            cur.execute("""
                SELECT date, elevation, content as old_content,
                       content + %s as new_content
                FROM water_measurements
                WHERE content IS NOT NULL
                    AND elevation IS NOT NULL
                    AND elevation >= 3520
                    AND content < 5_500_000
                ORDER BY date DESC
                LIMIT 5
            """, (BANK_STORAGE_TO_TOTAL_OFFSET,))
            
            samples = cur.fetchall()
            print('Sample updates:')
            print('-'*70)
            for sample in samples:
                print(f"  {sample['date']}: {float(sample['elevation']):.2f} ft")
                print(f"    {int(sample['old_content']):,} → {int(sample['new_content']):,} acre-ft")
            print()
            
            # Ask for confirmation
            response = input(f'Update {count_to_update:,} records? (yes/no): ')
            if response.lower() != 'yes':
                print('Update cancelled.')
                return
            
            # Update the records
            print()
            print('Updating records...')
            cur.execute("""
                UPDATE water_measurements
                SET content = content + %s
                WHERE content IS NOT NULL
                    AND elevation IS NOT NULL
                    AND elevation >= 3520
                    AND content < 5_500_000
            """, (BANK_STORAGE_TO_TOTAL_OFFSET,))
            
            updated_count = cur.rowcount
            conn.commit()
            
            print(f'✓ Updated {updated_count:,} records')
            print()
            print('Verification:')
            cur.execute("""
                SELECT date, elevation, content
                FROM water_measurements
                WHERE elevation BETWEEN 3539 AND 3540
                    AND date >= '2026-01-01'
                ORDER BY date DESC
                LIMIT 3
            """)
            
            verification = cur.fetchall()
            for row in verification:
                content = int(row['content'])
                status = '✓' if content > 6_000_000 else '✗'
                print(f"  {row['date']}: {float(row['elevation']):.2f} ft = {content:,} acre-ft {status}")
                
    finally:
        conn.close()

if __name__ == '__main__':
    update_content_values()

