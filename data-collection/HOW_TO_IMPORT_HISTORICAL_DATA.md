# How to Import Historical Lake Powell Data

## Current Status

The automatic import scripts are having issues because:
1. USBR CSV/JSON endpoints return 404 errors
2. RISE API returns empty results (parameter IDs may be incorrect)
3. USGS site 09379900 doesn't have elevation data
4. USBR 40-day endpoint only provides last 40 days

## Recommended Solution: Manual Download from USBR Historical Portal

The most reliable way to get historical data is to download it directly from the USBR Historical Data portal:

### Steps:

1. **Visit the USBR Historical Data Portal:**
   - Go to: https://www.usbr.gov/rsvrWater/HistoricalApp.html

2. **Select Options:**
   - **Reservoir**: Select "LAKE POWELL"
   - **Data Type**: Select "Daily Data" (or "Monthly Data" if you prefer)
   - **Start Date**: Enter "06/28/1963" (or "06/22/1980" for when it was filled)
   - **End Date**: Enter today's date
   - **Output Format**: Select "Download Data to Excel"

3. **Download the File:**
   - Click "Submit" or "Download Data to Excel"
   - Save the file (e.g., `lake_powell_historical.xlsx` or `.csv`)

4. **Convert to CSV (if needed):**
   - If you downloaded Excel, open it and save as CSV

5. **Import the CSV:**
   ```bash
   cd data-collection
   python migrations/import_csv_file.py path/to/your/file.csv
   ```

### Import Options:

```bash
# Import and update existing records
python migrations/import_csv_file.py lake_powell_historical.csv

# Import but skip existing records
python migrations/import_csv_file.py lake_powell_historical.csv --skip-existing --no-update-existing

# Import and don't update existing (only add new)
python migrations/import_csv_file.py lake_powell_historical.csv --no-update-existing
```

## Alternative: Try RISE API with Correct Parameters

If you can find the correct parameter IDs for Lake Powell in the RISE API, you can use:

```bash
cd data-collection
python migrations/import_csv_historical_data.py --start-date 1980-06-22 --end-date 2025-12-31
```

## Verification

After importing, verify the data:

```bash
cd data-collection
python verify_import.py
python -m pytest tests/integration/test_historical_data_import.py -v
```

## Expected Results

After successful import, you should have:
- Data from at least 1980-06-22 (when Lake Powell was filled)
- Thousands of data points (daily data = ~16,000+ records)
- Coverage of at least 50% of dates (allowing for gaps)






