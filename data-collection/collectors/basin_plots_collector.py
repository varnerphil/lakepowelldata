"""
USDA NWCC Basin Plots data collector for Lake Powell.
Fetches historical Snow Water Equivalent (SWE) data from USDA NWCC basin plots endpoint.
"""
import requests
import csv
import json
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple
import logging
from io import StringIO

logger = logging.getLogger(__name__)

# USDA NWCC Basin Plots endpoints
BASIN_PLOTS_CSV_URL = "https://nwcc-apps.sc.egov.usda.gov/awdb/basin-plots/POR/WTEQ/assocHUC2/14_Upper_Colorado_Region.csv?hucFilter=14"
BASIN_PLOTS_JSON_URL = "https://nwcc-apps.sc.egov.usda.gov/awdb/basin-plots/POR/WTEQ/assocHUC2/14_Upper_Colorado_Region.json?hucFilter=14"


def get_water_year(date_obj: date) -> int:
    """
    Get the water year for a given date.
    Water year runs from October 1 to September 30.
    """
    if date_obj.month >= 10:
        return date_obj.year + 1
    return date_obj.year


def parse_date_to_water_year_date(date_str: str, reference_year: int) -> date:
    """
    Convert MM-DD format to a full date in the water year.
    
    Water year runs from Oct 1 to Sep 30. For a given MM-DD:
    - Oct-Dec (10-12): Use reference_year
    - Jan-Sep (1-9): Use reference_year - 1 (these are part of the water year that started the previous Oct)
    
    Args:
        date_str: Date string in MM-DD format (e.g., "11-01")
        reference_year: Reference year to use (typically current calendar year)
    
    Returns:
        Full date object in the water year
    """
    month, day = map(int, date_str.split('-'))
    
    # Water year starts Oct 1, so:
    # - Oct, Nov, Dec (months 10-12) are in the current calendar year
    # - Jan-Sep (months 1-9) are in the previous calendar year (part of water year that started previous Oct)
    if month >= 10:
        # Oct, Nov, Dec -> use reference_year
        year = reference_year
    else:
        # Jan-Sep -> use reference_year - 1 (these dates are in the water year that started the previous Oct)
        year = reference_year - 1
    
    try:
        return date(year, month, day)
    except ValueError:
        # Handle leap year edge cases (Feb 29)
        if month == 2 and day == 29:
            # Use Feb 28 instead
            return date(year, 2, 28)
        raise


def parse_numeric_value(value) -> Optional[float]:
    """
    Parse a numeric value from CSV/JSON, handling null/empty values.
    
    Args:
        value: String, float, int, or None value to parse
    
    Returns:
        Float value or None if empty/null
    """
    # Handle None
    if value is None:
        return None
    
    # Handle numeric types (from JSON)
    if isinstance(value, (int, float)):
        # Check for NaN or infinite values
        if isinstance(value, float) and (value != value or value == float('inf') or value == float('-inf')):
            return None
        return float(value)
    
    # Handle string types (from CSV)
    if isinstance(value, str):
        value = value.strip()
        if not value or value == '' or value.lower() == 'null':
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
    
    return None


def fetch_basin_plots_json() -> Optional[List[Dict]]:
    """
    Fetch basin plots data from JSON endpoint.
    
    Returns:
        List of dictionaries with date and year data, or None if fetch fails
    """
    try:
        response = requests.get(BASIN_PLOTS_JSON_URL, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        logger.info(f"Fetched {len(data)} records from JSON endpoint")
        return data
    except Exception as e:
        logger.error(f"Error fetching JSON data: {e}")
        return None


def fetch_basin_plots_csv() -> Optional[List[Dict]]:
    """
    Fetch basin plots data from CSV endpoint.
    
    Returns:
        List of dictionaries with date and year data, or None if fetch fails
    """
    try:
        response = requests.get(BASIN_PLOTS_CSV_URL, timeout=30)
        response.raise_for_status()
        
        # Parse CSV
        csv_content = response.text
        reader = csv.DictReader(StringIO(csv_content))
        
        data = []
        for row in reader:
            data.append(row)
        
        logger.info(f"Fetched {len(data)} records from CSV endpoint")
        return data
    except Exception as e:
        logger.error(f"Error fetching CSV data: {e}")
        return None


def parse_basin_plots_data(raw_data: List[Dict], current_year: int = None) -> List[Dict]:
    """
    Parse raw basin plots data into structured format for database insertion.
    
    Args:
        raw_data: Raw data from CSV/JSON endpoint
        current_year: Current calendar year (defaults to today's year)
    
    Returns:
        List of dictionaries ready for database insertion
    """
    if current_year is None:
        current_year = date.today().year
    
    parsed_data = []
    
    # Get all year columns (1986-2026) and statistical columns
    year_columns = [str(year) for year in range(1986, 2027)]  # 1986 to 2026
    stat_columns = ['10%', '30%', '70%', '90%', 'Min', "Median ('91-'20)", 'Median (POR)', 'Max', 'Median Peak SWE']
    
    for row in raw_data:
        date_str = row.get('date', '').strip()
        if not date_str:
            continue
        
        # Parse the date to get water year date
        try:
            water_year_date = parse_date_to_water_year_date(date_str, current_year)
        except (ValueError, AttributeError) as e:
            logger.warning(f"Could not parse date '{date_str}': {e}")
            continue
        
        # Extract percentile and statistical values (same for all years on this date)
        percentile_10 = parse_numeric_value(row.get('10%', ''))
        percentile_30 = parse_numeric_value(row.get('30%', ''))
        percentile_70 = parse_numeric_value(row.get('70%', ''))
        percentile_90 = parse_numeric_value(row.get('90%', ''))
        min_value = parse_numeric_value(row.get('Min', ''))
        median_91_20 = parse_numeric_value(row.get("Median ('91-'20)", ''))
        median_por = parse_numeric_value(row.get('Median (POR)', ''))
        max_value = parse_numeric_value(row.get('Max', ''))
        median_peak_swe = parse_numeric_value(row.get('Median Peak SWE', ''))
        
        # Extract SWE values for each year
        for year_str in year_columns:
            year = int(year_str)
            swe_value = parse_numeric_value(row.get(year_str, ''))
            
            # Create record for each year (even if swe_value is None, we still want the record for statistical values)
            parsed_data.append({
                'date_str': date_str,
                'water_year_date': water_year_date,
                'year': year,
                'swe_value': swe_value,
                'percentile_10': percentile_10,
                'percentile_30': percentile_30,
                'percentile_70': percentile_70,
                'percentile_90': percentile_90,
                'min_value': min_value,
                'median_91_20': median_91_20,
                'median_por': median_por,
                'max_value': max_value,
                'median_peak_swe': median_peak_swe,
            })
    
    # Deduplicate: keep only one record per (water_year_date, year) combination
    # If there are duplicates, prefer records with non-null swe_value
    seen = {}
    deduplicated_data = []
    for record in parsed_data:
        key = (record['water_year_date'], record['year'])
        if key not in seen:
            seen[key] = record
            deduplicated_data.append(record)
        else:
            # If current record has swe_value and existing doesn't, replace it
            if record['swe_value'] is not None and seen[key]['swe_value'] is None:
                # Replace the existing record
                deduplicated_data.remove(seen[key])
                seen[key] = record
                deduplicated_data.append(record)
    
    logger.info(f"Parsed {len(parsed_data)} records from raw data")
    logger.info(f"Deduplicated to {len(deduplicated_data)} records")
    return deduplicated_data


def fetch_all_basin_plots_data() -> Optional[List[Dict]]:
    """
    Fetch basin plots data, trying JSON first, then CSV.
    
    Returns:
        Parsed data ready for database insertion, or None if both fail
    """
    # Try JSON first
    json_data = fetch_basin_plots_json()
    if json_data:
        return parse_basin_plots_data(json_data)
    
    # Fallback to CSV
    csv_data = fetch_basin_plots_csv()
    if csv_data:
        return parse_basin_plots_data(csv_data)
    
    logger.error("Failed to fetch data from both JSON and CSV endpoints")
    return None

