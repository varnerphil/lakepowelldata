#!/usr/bin/env python3
"""
Test database connection script.
Verifies that DATABASE_URL is set and database is accessible.
"""
import os
import sys
from pathlib import Path

# Add data-collection to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'data-collection'))

from utils.database import get_db_connection

def test_connection():
    """Test database connection."""
    print("Testing database connection...")
    
    if not os.getenv('DATABASE_URL'):
        print("ERROR: DATABASE_URL environment variable is not set")
        print("Please set it in your .env file or export it:")
        print("  export DATABASE_URL='postgresql://user:password@host:port/database'")
        return False
    
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT version();")
            version = cur.fetchone()
            print(f"✓ Connected to PostgreSQL: {version[0]}")
        
        # Check if tables exist
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """)
            tables = [row[0] for row in cur.fetchall()]
            
            if tables:
                print(f"✓ Found {len(tables)} tables: {', '.join(tables)}")
            else:
                print("⚠ No tables found. Run database schema migration first.")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"ERROR: Failed to connect to database: {e}")
        return False

if __name__ == '__main__':
    success = test_connection()
    sys.exit(0 if success else 1)






