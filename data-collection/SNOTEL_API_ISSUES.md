# SNOTEL AWDB API Integration Issues

## Current Status

The SNOTEL data collection system is **partially functional**:

✅ **Working:**
- Database schema created and migrated
- SNOTEL text report parsing (218 sites extracted)
- Sites are being stored in database with placeholder IDs
- Data collection structure is in place

⚠️ **Known Issues:**
- AWDB `getStations` SOAP API method returns 0 results even with valid parameters
- Cannot automatically map site names to AWDB station triplets
- Sites are stored with placeholder IDs: `UNKNOWN:SITE_NAME:BASIN`
- Historical data cannot be fetched without valid station triplets

## AWDB API Investigation

### Attempted Approaches

1. **`getStations` with network code filter:**
   ```python
   client.service.getStations(
       networkCds=['SNOTEL'],
       stateCds=['CO', 'UT', 'WY'],
       ...
   )
   ```
   **Result:** Returns 0 stations

2. **`getStations` with HUC code:**
   ```python
   client.service.getStations(
       networkCds=['SNOTEL'],
       hucs=['14'],  # Upper Colorado Region
       ...
   )
   ```
   **Result:** Returns 0 stations

3. **Pattern matching with `getStationMetadata`:**
   - Tried generating station ID candidates from site names
   - Tested common abbreviations and patterns
   - **Result:** No matches found (station IDs don't follow predictable patterns)

### Possible Causes

1. **API Authentication:** The AWDB API might require authentication that we're not providing
2. **Parameter Format:** The SOAP parameters might need to be formatted differently
3. **API Changes:** The API might have changed and the WSDL might be outdated
4. **Network Code:** The network code 'SNOTEL' might not be correct or might need different format
5. **Data Availability:** The stations might not be accessible via this method

## Current Workaround

Sites are stored with placeholder IDs in the format:
```
UNKNOWN:SITE_NAME:BASIN
```

Example: `UNKNOWN:ARAPAHO_RIDGE:UPPER COLO`

This allows:
- Sites to be stored and displayed
- Manual mapping to be done later
- The system to continue functioning

## Recommended Solutions

### Option 1: Manual Station ID Mapping (Short-term)
Create a CSV file mapping site names to station triplets:
```csv
site_name,station_triplet
Arapaho Ridge,CO:1234:WTEQ
Berthoud Summit,CO:5678:WTEQ
...
```

Then update the import script to use this mapping file.

### Option 2: Alternative Data Source
- Look for SNOTEL station metadata in CSV/JSON format
- Use the AWDB reference data website
- Find a REST API endpoint for station metadata

### Option 3: Contact AWDB Support
- Reach out to USDA NRCS AWDB support
- Request documentation or examples for `getStations` usage
- Ask about authentication requirements

### Option 4: Use Text File Data Only
- Continue parsing the daily SNOTEL text report
- Store current values only (no historical data from API)
- This limits functionality but keeps the system working

## Next Steps

1. **Immediate:** System stores sites with placeholder IDs - this is functional
2. **Short-term:** Create manual mapping file for common sites
3. **Long-term:** Resolve AWDB API integration or find alternative data source

## Testing

To test the current system:
```bash
cd data-collection
source venv/bin/activate
python -m migrations.import_snotel_historical_data --limit-sites 5
```

This will:
- Parse 5 sites from the SNOTEL report
- Attempt to find station IDs (will fail)
- Store sites with placeholder IDs
- Skip historical data fetching (requires valid station IDs)




