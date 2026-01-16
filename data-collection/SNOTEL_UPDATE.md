# SNOTEL Data Update Process

This document describes how to set up and run the SNOTEL data collection and update process.

## Overview

The SNOTEL data collection system:
1. Parses the daily SNOTEL text report to get current site names and basins
2. Maps site names to AWDB site IDs using the USDA AWDB API
3. Fetches historical measurements (SWE, precipitation, temperature, etc.) from the AWDB API
4. Stores sites and measurements in the PostgreSQL database

## Initial Setup

### 1. Run Database Schema Migration

```bash
psql $DATABASE_URL -f database/add_snotel_schema.sql
```

This creates the `snotel_sites` and `snotel_measurements` tables.

### 2. Install Python Dependencies

```bash
cd data-collection
pip install -r requirements.txt
```

The `zeep` library is required for SOAP API access to the AWDB service.

### 3. Initial Historical Data Import

For the initial import, you can import 10 years of historical data:

```bash
cd data-collection
python -m migrations.import_snotel_historical_data
```

Or specify a date range:

```bash
python -m migrations.import_snotel_historical_data \
  --start-date 2014-01-01 \
  --end-date 2026-01-09
```

**Note**: The initial import may take a long time (hours) as it processes many sites and fetches data from the AWDB API. You can limit the number of sites for testing:

```bash
python -m migrations.import_snotel_historical_data --limit-sites 5
```

## Daily Updates

### Manual Update

Run the update script:

```bash
cd data-collection
./update_snotel.sh
```

Or directly:

```bash
python -m migrations.import_snotel_historical_data --end-date $(date +%Y-%m-%d)
```

### Automated Daily Updates (Cron)

Add to your crontab to run daily at 2 AM:

```bash
0 2 * * * cd /path/to/lake-powell-water-data/data-collection && ./update_snotel.sh >> /var/log/snotel_update.log 2>&1
```

## How It Works

1. **Parse SNOTEL Report**: The script fetches the current SNOTEL text report from `https://www.water-data.com/colorado_snotel_rpt.txt` and extracts site names, elevations, and basins.

2. **Map to AWDB Site IDs**: For each site, the script queries the AWDB API to find the corresponding site ID (station triplet). It tries multiple states (CO, UT, WY, NM, AZ) to find matches.

3. **Fetch Historical Data**: For each site, the script fetches historical measurements from the AWDB API for:
   - Snow Water Equivalent (WTEQ)
   - Snow Depth (SNWD)
   - Precipitation (PREC)
   - Temperature Max/Min/Avg (TMAX/TMIN/TAVG)

4. **Database Storage**: Sites and measurements are stored using bulk upsert operations with `ON CONFLICT` handling to update existing records.

## API Rate Limiting

The script includes a 0.5 second delay between site API calls to avoid overwhelming the AWDB API. If you encounter rate limiting errors, you can increase this delay in `data-collection/collectors/snotel_collector.py`.

## Troubleshooting

### Site ID Not Found

If a site ID cannot be found, the script will log a warning and skip that site. Common reasons:
- Site name doesn't match exactly in AWDB
- Site is in a different state than expected
- Site has been renamed or decommissioned

### API Errors

If you encounter SOAP API errors:
- Check your internet connection
- Verify the AWDB WSDL is accessible: `https://wcc.sc.egov.usda.gov/awdbWebService/services?WSDL`
- Check the AWDB service status

### Database Connection Errors

Ensure `DATABASE_URL` is set correctly in your `.env` file.

## Data Structure

### snotel_sites Table

- `site_id`: AWDB station triplet (e.g., "CO:1234:WTEQ")
- `name`: Site name
- `elevation`: Elevation in feet
- `basin`: Basin name
- `state`: State code
- `latitude`/`longitude`: Coordinates (if available)

### snotel_measurements Table

- `site_id`: Foreign key to snotel_sites
- `date`: Measurement date
- `snow_water_equivalent`: SWE in inches
- `snow_depth`: Snow depth in inches
- `precipitation`: Precipitation in inches
- `temperature_max`/`temperature_min`/`temperature_avg`: Temperature in Fahrenheit

## Frontend Integration

The frontend API route (`frontend/app/api/snowpack/route.ts`) automatically:
1. Tries to fetch data from the database
2. Falls back to the text file if the database is empty
3. Transforms database records into the format expected by the frontend components




