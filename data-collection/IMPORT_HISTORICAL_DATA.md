# Importing Historical Lake Powell Data

This guide explains how to import all available historical data for Lake Powell.

## Overview

The import script will fetch all available historical data from the USBR dashboard CSV/JSON endpoints or RISE API. This should include data going back to when Lake Powell was filled (1963-1980).

## Data Sources

The import uses multiple data sources in order of preference:

1. **USBR Dashboard CSV/JSON** (`https://www.usbr.gov/uc/water/hydrodata/reservoir_data/919/dashboard.html`)
   - Provides full historical datasets
   - CSV and JSON formats available
   - Includes: Storage, Pool Elevation, Inflow, Total Release

2. **USBR RISE API** (`https://data.usbr.gov/rise/api/result`)
   - Fallback if CSV/JSON endpoints don't work
   - Requires date range parameters
   - Location ID: 1533 (Lake Powell)

### Alternative Data Sources

If the USBR endpoint doesn't provide historical data, consider these sources:

1. **lakepowell.water-data.com** - Has historical data back to 1980
   - May require web scraping
   - Check their terms of service before scraping

2. **USGS Water Data** - May have historical reservoir data
   - API: https://api.waterdata.usgs.gov/
   - Site ID for Lake Powell: Check USGS database

3. **USBR Historical Reports** - Annual reports may contain historical data
   - May require manual data entry or CSV import

4. **Public Datasets** - Check data.gov or other public data repositories

## Running the Import

### Recommended: Import from CSV/JSON (All Historical Data)

This is the preferred method as it fetches all available historical data at once:

```bash
cd data-collection
./import_from_csv.sh
```

Or using Python directly:

```bash
cd data-collection
python -m migrations.import_csv_historical_data
```

### Alternative: Import from 40-Day Endpoint

For recent data only (last 40 days):

```bash
cd data-collection
./import_all_historical.sh
```

Or:

```bash
cd data-collection
python -m migrations.import_historical_data
```

### Import with Custom Date Range (RISE API Fallback)

If CSV/JSON endpoints don't work, you can specify a date range for RISE API:

```bash
cd data-collection
python -m migrations.import_csv_historical_data \
  --start-date 2020-01-01 \
  --end-date 2023-12-31
```

### Import Options

**CSV Import Options:**
- `--start-date YYYY-MM-DD`: Start date for RISE API fallback (optional)
- `--end-date YYYY-MM-DD`: End date for RISE API fallback (optional)
- `--no-update-existing`: Do not update existing records (skip them)
- `--skip-existing`: Skip dates that already exist (only if --no-update-existing is set)

**40-Day Endpoint Import Options:**
- `--start-date YYYY-MM-DD`: Start date (default: 1980-06-22)
- `--end-date YYYY-MM-DD`: End date (default: today)
- `--no-skip-existing`: Re-import dates that already exist
- `--chunk-size N`: Days per chunk (default: 30)

### Examples

Import only recent data (last year):
```bash
python -m migrations.import_historical_data \
  --start-date 2024-01-01
```

Import a specific year:
```bash
python -m migrations.import_historical_data \
  --start-date 2020-01-01 \
  --end-date 2020-12-31
```

## How It Works

1. **Checks Existing Data**: The script checks what dates already exist in your database
2. **Skips Existing**: By default, it only imports missing dates (use `--no-skip-existing` to override)
3. **Processes in Chunks**: Data is fetched in 30-day chunks to avoid memory issues
4. **Progress Tracking**: Shows progress percentage and statistics
5. **Error Handling**: Continues processing even if some dates fail

## Expected Behavior

- **CSV/JSON Import**: Should fetch all available historical data at once
  - If CSV/JSON endpoints work, you'll get the full historical dataset
  - If they don't work, the script will automatically try RISE API (requires date range)
- **40-Day Endpoint Import**: Only fetches recent data (last 40 days)
  - Use this for daily updates of recent data
  - Not suitable for historical data import

## Data Updates

The import script supports updating existing records:
- By default, existing records are **updated** with new data
- Use `--no-update-existing` to skip existing records instead
- This allows you to re-run the import to get updated/corrected data

## Monitoring Progress

The script provides detailed logging:
- Progress percentage
- Number of records inserted
- Number of records skipped (already exist)
- Number of records failed
- Total time elapsed

## Troubleshooting

### No Data for Historical Dates

If you see many "Could not find data" errors for dates older than 40 days, this is expected. The USBR endpoint likely doesn't provide historical data. You'll need to:

1. Find an alternative data source
2. Create a new collector for that source
3. Update the import script to use the new collector

### Rate Limiting

If you encounter rate limiting:
- Increase the delay between requests in the collector
- Reduce the chunk size
- Run the import during off-peak hours

### Database Connection Issues

Make sure your `DATABASE_URL` environment variable is set correctly:
```bash
export DATABASE_URL="postgresql://user:password@host:port/database"
```

## Next Steps

After importing available data:

1. Check what date range you successfully imported
2. Identify gaps in your data
3. Research alternative sources for missing historical data
4. Consider creating additional collectors for alternative sources

## See Also

- `HISTORICAL_DATA_NOTE.md` - More details about historical data challenges
- `collectors/usbr_collector.py` - USBR data collector implementation
- `migrations/import_historical_data.py` - Import script source code

