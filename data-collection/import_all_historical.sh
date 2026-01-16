#!/bin/bash
# Script to import all historical Lake Powell data
# This will import data from 1980-06-22 (when Lake Powell was filled) to today

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Run the import script directly
python migrations/import_historical_data.py

echo ""
echo "Import complete! Check the logs above for details."

