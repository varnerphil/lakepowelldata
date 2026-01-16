#!/usr/bin/env python3
"""
Run SNOTEL schema migration using Python database connection.
"""
import sys
from pathlib import Path
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add data-collection to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'data-collection'))

from utils.database import get_db_connection

def run_schema_migration():
    """Run the SNOTEL schema SQL migration."""
    schema_file = Path(__file__).parent.parent / 'database' / 'add_snotel_schema.sql'
    
    if not schema_file.exists():
        print(f"Error: Schema file not found: {schema_file}")
        return False
    
    print(f"Reading schema from: {schema_file}")
    with open(schema_file, 'r') as f:
        sql = f.read()
    
    print("Connecting to database...")
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            print("Executing schema migration...")
            cur.execute(sql)
        conn.commit()
        print("✓ Schema migration complete!")
        return True
    except Exception as e:
        print(f"Error running migration: {e}")
        return False
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == '__main__':
    if not os.getenv('DATABASE_URL'):
        print("Error: DATABASE_URL environment variable is not set")
        print("Please set it in your .env file or export it")
        sys.exit(1)
    
    success = run_schema_migration()
    sys.exit(0 if success else 1)




