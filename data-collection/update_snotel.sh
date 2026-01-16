#!/bin/bash

# Load environment variables from .env file in the project root
if [ -f "../.env" ]; then
  export $(cat ../.env | xargs)
  echo "Loaded .env from: ../.env"
else
  echo "Error: .env file not found in project root."
  exit 1
fi

# Ensure DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is not set in .env"
  exit 1
fi

echo "DATABASE_URL found: ${DATABASE_URL:0:60}..." # Print first 60 chars for verification

# Run the Python import script
# This will:
# 1. Parse the current SNOTEL report to get site names
# 2. Fetch latest measurements from AWDB API for each site
# 3. Update the database with new measurements
echo "Running SNOTEL data update..."
python -m migrations.import_snotel_historical_data --end-date $(date +%Y-%m-%d)

if [ $? -eq 0 ]; then
  echo "SNOTEL data update completed successfully."
else
  echo "SNOTEL data update failed."
  exit 1
fi




