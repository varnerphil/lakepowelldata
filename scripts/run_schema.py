#!/usr/bin/env python3
"""
Run database schema setup script.
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment
load_dotenv(Path(__file__).parent.parent / 'data-collection' / '.env')

import psycopg2

def run_schema():
    """Run the complete setup SQL file."""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL not found in environment")
        print("Make sure data-collection/.env exists with DATABASE_URL")
        return False
    
    # Read the SQL file
    sql_file = Path(__file__).parent.parent / 'database' / 'complete_setup.sql'
    if not sql_file.exists():
        print(f"ERROR: SQL file not found: {sql_file}")
        return False
    
    with open(sql_file, 'r') as f:
        sql_content = f.read()
    
    print("Connecting to database...")
    try:
        # Try connecting with IPv4 preference
        conn = psycopg2.connect(
            database_url,
            connect_timeout=10
        )
        print("✓ Connected successfully!")
        
        print("\nRunning schema setup...")
        with conn.cursor() as cur:
            # Execute the SQL
            cur.execute(sql_content)
            conn.commit()
            
            # Get results from verification queries
            cur.execute("SELECT COUNT(*) FROM ramps;")
            ramp_count = cur.fetchone()[0]
            print(f"✓ Schema setup complete!")
            print(f"✓ Inserted {ramp_count} ramps")
            
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """)
            tables = [row[0] for row in cur.fetchall()]
            print(f"✓ Created {len(tables)} tables: {', '.join(tables)}")
        
        conn.close()
        print("\n✅ Database setup complete!")
        return True
        
    except psycopg2.OperationalError as e:
        print(f"ERROR: Connection failed: {e}")
        print("\nTroubleshooting:")
        print("1. Check if your Supabase project is active (not paused)")
        print("2. Verify the connection string in data-collection/.env")
        print("3. Try using the connection pooler URL from Supabase dashboard")
        return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False

if __name__ == '__main__':
    success = run_schema()
    sys.exit(0 if success else 1)






