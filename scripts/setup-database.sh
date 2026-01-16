#!/bin/bash
# Database setup script
# This script helps set up the database schema and seed initial data

set -e

echo "=== Lake Powell Water Data - Database Setup ==="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set"
    echo "Please set it in your .env file or export it:"
    echo "  export DATABASE_URL='postgresql://user:password@host:port/database'"
    exit 1
fi

echo "✓ DATABASE_URL is set"
echo ""

# Run schema migration
echo "Running database schema migration..."
psql "$DATABASE_URL" -f database/schema.sql
echo "✓ Schema migration complete"
echo ""

# Seed ramp data
echo "Seeding ramp definitions..."
cd data-collection
source venv/bin/activate
python migrations/seed_ramps.py
cd ..
echo "✓ Ramp data seeded"
echo ""

echo "=== Database setup complete ==="
echo ""
echo "Next steps:"
echo "1. (Optional) Run historical data migration:"
echo "   cd data-collection && source venv/bin/activate && python migrations/import_historical_data.py"
echo ""
echo "2. Start the frontend:"
echo "   cd frontend && npm run dev"






