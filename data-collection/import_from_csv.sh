#!/bin/bash
# Script to import all historical Lake Powell data from USBR CSV/JSON endpoints
# This will fetch all available data and import it into the database

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Run the CSV import script directly
python migrations/import_csv_historical_data.py

echo ""
echo "Import complete! Check the logs above for details."

