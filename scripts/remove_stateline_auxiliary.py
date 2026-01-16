#!/usr/bin/env python3
"""
Remove duplicate Stateline Auxiliary Ramp from database.
Keep Stateline Launch, remove Stateline Auxiliary Ramp.
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment from data-collection/.env
load_dotenv(Path(__file__).parent.parent / 'data-collection' / '.env')

# Add data-collection to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'data-collection'))

from utils.database import get_db_connection

def remove_stateline_auxiliary():
    """Remove Stateline Auxiliary Ramp from database."""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL not found in environment")
        print("Make sure data-collection/.env exists with DATABASE_URL")
        return False
    
    print("Connecting to database...")
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if the ramp exists
            cur.execute("SELECT id, name FROM ramps WHERE name = 'Stateline Auxiliary Ramp'")
            result = cur.fetchone()
            
            if result:
                ramp_id, ramp_name = result
                print(f"Found ramp: {ramp_name} (ID: {ramp_id})")
                
                # Delete the ramp
                cur.execute("DELETE FROM ramps WHERE name = 'Stateline Auxiliary Ramp'")
                conn.commit()
                print(f"✓ Successfully removed '{ramp_name}' from database")
            else:
                print("⚠ 'Stateline Auxiliary Ramp' not found in database (may have already been removed)")
            
            # Verify Stateline Launch still exists
            cur.execute("SELECT id, name FROM ramps WHERE name = 'Stateline Launch'")
            result = cur.fetchone()
            if result:
                print(f"✓ 'Stateline Launch' confirmed in database (ID: {result[0]})")
            else:
                print("⚠ WARNING: 'Stateline Launch' not found in database!")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"ERROR: Failed to remove ramp: {e}")
        return False

if __name__ == '__main__':
    success = remove_stateline_auxiliary()
    sys.exit(0 if success else 1)

