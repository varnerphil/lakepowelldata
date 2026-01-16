"""
USGS (U.S. Geological Survey) data collector for Lake Powell.
Fetches historical water level data from USGS Water Data API.
"""
import requests
from datetime import date, datetime
from typing import Dict, List, Optional
import logging
import time

logger = logging.getLogger(__name__)

# USGS API base URL
USGS_BASE_URL = "https://waterservices.usgs.gov/nwis/dv"

# Lake Powell USGS site number
LAKE_POWELL_SITE = "09379900"

# Parameter codes for USGS
# These may need to be verified, but common codes are:
# 00065 = Gage height (feet)
# 00062 = Reservoir storage (acre-feet) 
# 00060 = Discharge (cfs)
PARAMETER_CODES = {
    'elevation': '00065',  # Gage height / Elevation
    'storage': '00062',    # Storage
    'inflow': '00060',     # Discharge (inflow)
    'outflow': '00060',    # Discharge (outflow) - may need different site
}

# Map parameter codes to our data field names
PARAMETER_TO_FIELD = {
    '00065': 'elevation',  # Gage height
    '00062': 'content',    # Storage
    '00060': 'inflow',     # Discharge (may need refinement for inflow vs outflow)
}


def fetch_usgs_data_multi_parameter(
    parameter_codes: List[str],
    start_date: date,
    end_date: date,
    site: str = LAKE_POWELL_SITE
) -> Optional[Dict]:
    """
    Fetch data from USGS Daily Values API for multiple parameters in a single request.
    This is more efficient than making separate requests for each parameter.
    
    Args:
        parameter_codes: List of USGS parameter codes (e.g., ['00065', '00062'])
        start_date: Start date
        end_date: End date
        site: USGS site number (default: Lake Powell)
    
    Returns:
        Dictionary with:
        - 'site_info': Site metadata (name, location, etc.)
        - 'time_series': Dictionary mapping parameter codes to their data lists
        - 'errors': List of any errors encountered
    """
    try:
        url = USGS_BASE_URL
        # Join multiple parameter codes with comma
        params = {
            'format': 'json',
            'sites': site,
            'parameterCd': ','.join(parameter_codes),
            'startDT': start_date.isoformat(),
            'endDT': end_date.isoformat(),
            'siteStatus': 'all'
        }
        
        logger.info(f"Fetching USGS data: site={site}, parameters={parameter_codes}, {start_date} to {end_date}")
        response = requests.get(url, params=params, timeout=60)
        response.raise_for_status()
        
        data = response.json()
        
        result = {
            'site_info': None,
            'time_series': {},
            'errors': []
        }
        
        # Extract site information from the first timeSeries entry
        if 'value' in data and 'timeSeries' in data['value']:
            time_series_list = data['value']['timeSeries']
            
            if not time_series_list:
                logger.warning("USGS API returned empty time series")
                return result
            
            # Extract site info from first timeSeries (all should have same site info)
            first_series = time_series_list[0]
            source_info = first_series.get('sourceInfo', {})
            
            result['site_info'] = {
                'site_name': source_info.get('siteName', ''),
                'site_code': source_info.get('siteCode', [{}])[0].get('value', '') if source_info.get('siteCode') else '',
                'latitude': source_info.get('geoLocation', {}).get('geogLocation', {}).get('latitude'),
                'longitude': source_info.get('geoLocation', {}).get('geogLocation', {}).get('longitude'),
            }
            
            # Validate we got the right site
            if result['site_info']['site_code'] != site:
                logger.warning(f"Site code mismatch: expected {site}, got {result['site_info']['site_code']}")
            
            logger.info(f"Fetching from site: {result['site_info']['site_name']} ({result['site_info']['site_code']})")
            
            # Process each timeSeries entry
            for series in time_series_list:
                # Extract variable information to identify the parameter
                variable = series.get('variable', {})
                variable_code = variable.get('variableCode', [{}])[0].get('value', '') if variable.get('variableCode') else ''
                variable_name = variable.get('variableName', '')
                
                # Extract values
                values_list = series.get('values', [])
                if not values_list:
                    logger.warning(f"No values found for parameter {variable_code} ({variable_name})")
                    continue
                
                values = values_list[0].get('value', [])
                
                # Map to our field name
                field_name = PARAMETER_TO_FIELD.get(variable_code, variable_code)
                
                result['time_series'][field_name] = {
                    'parameter_code': variable_code,
                    'variable_name': variable_name,
                    'values': values,
                    'unit': variable.get('unit', {}).get('unitCode', ''),
                }
                
                logger.info(f"  Found {len(values)} records for {field_name} (parameter {variable_code}: {variable_name})")
            
            return result
        else:
            logger.warning(f"Unexpected USGS API response structure: {list(data.keys())}")
            result['errors'].append(f"Unexpected response structure: {list(data.keys())}")
            return result
            
    except Exception as e:
        logger.warning(f"Failed to fetch from USGS API: {e}")
        return {
            'site_info': None,
            'time_series': {},
            'errors': [str(e)]
        }


def fetch_usgs_data(
    parameter_code: str,
    start_date: date,
    end_date: date,
    site: str = LAKE_POWELL_SITE
) -> Optional[List[Dict]]:
    """
    Fetch data from USGS Daily Values API (legacy function for backward compatibility).
    
    Args:
        parameter_code: USGS parameter code (e.g., '00065' for elevation)
        start_date: Start date
        end_date: End date
        site: USGS site number (default: Lake Powell)
    
    Returns:
        List of data records or None if fetch fails
    """
    result = fetch_usgs_data_multi_parameter([parameter_code], start_date, end_date, site)
    if result and result['time_series']:
        # Return the first (and only) time series values
        first_field = list(result['time_series'].keys())[0]
        return result['time_series'][first_field]['values']
    return None


def parse_usgs_date(date_str: str) -> Optional[date]:
    """Parse USGS date string (format: YYYY-MM-DD)."""
    try:
        return datetime.fromisoformat(date_str.split('T')[0]).date()
    except (ValueError, AttributeError):
        return None


def fetch_all_water_data_usgs(start_date: date, end_date: date) -> List[Dict]:
    """
    Fetch all water measurement data from USGS.
    Uses a single API call to fetch multiple parameters efficiently.
    
    Args:
        start_date: Start date
        end_date: End date
    
    Returns:
        List of dictionaries with date, elevation, content, inflow, outflow
    """
    logger.info(f"Fetching Lake Powell data from USGS (site {LAKE_POWELL_SITE})")
    
    # Fetch all parameters in a single request (more efficient)
    parameter_codes = [
        PARAMETER_CODES['elevation'],
        PARAMETER_CODES['storage'],
        # Note: Inflow/outflow may require different sites or parameter codes
        # For now, we'll focus on elevation and storage which are the most important
    ]
    
    result = fetch_usgs_data_multi_parameter(parameter_codes, start_date, end_date)
    
    if not result or not result['time_series']:
        logger.warning("No data returned from USGS API")
        return []
    
    # Log site information if available
    if result['site_info']:
        logger.info(f"Site: {result['site_info']['site_name']} ({result['site_info']['site_code']})")
    
    # Combine data by date
    data_by_date = {}
    
    # Process each time series
    for field_name, series_data in result['time_series'].items():
        values = series_data.get('values', [])
        parameter_code = series_data.get('parameter_code', '')
        variable_name = series_data.get('variable_name', '')
        
        logger.debug(f"Processing {len(values)} records for {field_name} ({variable_name})")
        
        for record in values:
            date_str = record.get('dateTime')
            value = record.get('value')
            qualifiers = record.get('qualifiers', [])
            
            # Skip if value is missing
            if value is None:
                continue
            
            # Handle qualifiers - 'P' = Provisional, 'A' = Approved
            # We'll include provisional data but log it
            if 'P' in qualifiers:
                logger.debug(f"Provisional data for {date_str}: {value}")
            
            parsed_date = parse_usgs_date(date_str) if date_str else None
            if not parsed_date:
                continue
            
            if parsed_date not in data_by_date:
                data_by_date[parsed_date] = {}
            
            try:
                # Store the value with appropriate type conversion
                if field_name == 'content':
                    data_by_date[parsed_date][field_name] = int(float(value))
                elif field_name == 'elevation':
                    data_by_date[parsed_date][field_name] = float(value)
                else:
                    # For other fields (inflow, outflow), store as float
                    data_by_date[parsed_date][field_name] = float(value)
            except (ValueError, TypeError) as e:
                logger.debug(f"Failed to convert value {value} for {field_name} on {parsed_date}: {e}")
                continue
    
    # Convert to list format
    results = []
    for data_date, values in sorted(data_by_date.items()):
        # Only include records with at least elevation
        if 'elevation' in values:
            results.append({
                'date': data_date,
                'elevation': values.get('elevation'),
                'content': values.get('content', 0),
                'inflow': values.get('inflow', 0),
                'outflow': values.get('outflow', 0),
            })
    
    logger.info(f"Combined {len(results)} complete records from USGS")
    
    # Log any errors encountered
    if result.get('errors'):
        for error in result['errors']:
            logger.warning(f"USGS API error: {error}")
    
    return results



