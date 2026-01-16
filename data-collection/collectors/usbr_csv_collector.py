"""
USBR CSV/JSON data collector for Lake Powell.
Fetches historical data from USBR dashboard CSV/JSON endpoints.
"""
import requests
import csv
import json
from datetime import date, datetime
from typing import Dict, List, Optional
import logging
from io import StringIO

logger = logging.getLogger(__name__)

# USBR dashboard base URL for site 919 (Lake Powell)
USBR_DASHBOARD_BASE = "https://www.usbr.gov/uc/water/hydrodata/reservoir_data/919"

# RISE API base URL
RISE_API_BASE = "https://data.usbr.gov/rise/api/result"
RISE_API_DOWNLOAD = "https://data.usbr.gov/rise/api/result/download"
RISE_LOCATION_ID = 1533  # Lake Powell location ID (confirmed from RISE API docs)

# Parameter IDs for RISE API (using locationId method)
# Based on RISE API documentation
PARAMETER_IDS = {
    'elevation': 3,  # Elevation (per RISE API docs)
    'storage': 4,    # Storage (content) - may need verification
    'inflow': 5,     # Inflow - may need verification
    'outflow': 6,    # Total Release (outflow) - may need verification
}


def fetch_csv_data(data_type: str) -> Optional[List[Dict]]:
    """
    Fetch CSV data from USBR dashboard.
    
    Args:
        data_type: Type of data to fetch (e.g., 'Storage', 'Pool Elevation', 'Inflow', 'Total Release')
    
    Returns:
        List of dictionaries with date and value, or None if fetch fails
    """
    # Try different URL formats
    url_formats = [
        f"{USBR_DASHBOARD_BASE}/{data_type}.csv",
        f"{USBR_DASHBOARD_BASE}/{data_type.replace(' ', '%20')}.csv",
        f"{USBR_DASHBOARD_BASE}/{data_type.replace(' ', '_')}.csv",
    ]
    
    for url in url_formats:
        try:
            logger.info(f"Attempting to fetch CSV from: {url}")
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            
            # Check if we got HTML (404 page) instead of CSV
            if response.text.strip().startswith('<!DOCTYPE') or response.text.strip().startswith('<html'):
                logger.debug(f"Got HTML response instead of CSV from {url}")
                continue
            
            # Parse CSV
            csv_reader = csv.DictReader(StringIO(response.text))
            data = []
            for row in csv_reader:
                data.append(row)
            
            logger.info(f"Successfully fetched {len(data)} records from CSV")
            return data
            
        except requests.exceptions.RequestException as e:
            logger.debug(f"Failed to fetch from {url}: {e}")
            continue
        except Exception as e:
            logger.warning(f"Error parsing CSV from {url}: {e}")
            continue
    
    return None


def fetch_json_data(data_type: str) -> Optional[List[Dict]]:
    """
    Fetch JSON data from USBR dashboard.
    
    Args:
        data_type: Type of data to fetch
    
    Returns:
        List of dictionaries with date and value, or None if fetch fails
    """
    url_formats = [
        f"{USBR_DASHBOARD_BASE}/{data_type}.json",
        f"{USBR_DASHBOARD_BASE}/{data_type.replace(' ', '%20')}.json",
        f"{USBR_DASHBOARD_BASE}/{data_type.replace(' ', '_')}.json",
    ]
    
    for url in url_formats:
        try:
            logger.info(f"Attempting to fetch JSON from: {url}")
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            
            # Check if we got HTML instead of JSON
            if response.text.strip().startswith('<!DOCTYPE') or response.text.strip().startswith('<html'):
                logger.debug(f"Got HTML response instead of JSON from {url}")
                continue
            
            data = response.json()
            logger.info(f"Successfully fetched JSON data")
            return data if isinstance(data, list) else [data]
            
        except requests.exceptions.RequestException as e:
            logger.debug(f"Failed to fetch from {url}: {e}")
            continue
        except json.JSONDecodeError as e:
            logger.debug(f"Invalid JSON from {url}: {e}")
            continue
        except Exception as e:
            logger.warning(f"Error parsing JSON from {url}: {e}")
            continue
    
    return None


# RISE API Catalog Item IDs for Lake Powell
# Based on RISE catalog: https://data.usbr.gov/catalog/2362/item/508
# itemId 508 = Elevation (ft) - "Lake/Reservoir Elevation (ft)"
# itemId 509 = Storage (acre-feet) - "Lake/Reservoir Storage" (TOTAL storage from dead pool)
# itemId 4276 = Bank Storage (acre-feet) - NOT used, gives incomplete values for historical data
LAKE_POWELL_CATALOG_ITEMS = {
    'elevation': 508,  # Lake Powell Glen Canyon Dam Daily Lake/Reservoir Elevation (API endpoint)
    'elevation_download': 508,  # Lake Powell elevation download endpoint
    'storage_download': 509,  # Lake Powell TOTAL storage download endpoint (itemId 509 - correct for all dates)
    'inflow_download': 511,  # Lake Powell inflow download endpoint (itemId 511 for inflow)
    'outflow_download': 507,  # Lake Powell outflow download endpoint (itemId 507 for release/powerplant outflow)
    'storage': None,   # Need to find catalog item ID for API endpoint
    'inflow': None,    # Need to find catalog item ID
    'outflow': None,   # Need to find catalog item ID
}

# Parameter IDs within catalog item 508
# CORRECTED: parameterId=1494 is elevation (values 3000-4000 ft)
# parameterId=1491 does NOT return elevation values
LAKE_POWELL_PARAMETER_IDS = {
    'elevation': 1494,  # Elevation in feet (value ~3000-4000) - CORRECTED
    'content': 3,      # Content/Storage in acre-feet (value ~1.3M)
    'inflow': 12,      # Inflow in cfs
    'outflow': 18,     # Outflow in cfs
}


def fetch_rise_api_download(item_id: int, start_date: date, end_date: date) -> Optional[List[Dict]]:
    """
    Fetch data from USBR RISE API download endpoint.
    This is the most efficient method - fetches all data in a single request.
    
    Args:
        item_id: Item ID for the download endpoint (e.g., 4276 for elevation)
        start_date: Start date
        end_date: End date
    
    Returns:
        List of data records or None if fetch fails
    """
    try:
        params = {
            'type': 'json',
            'itemId': item_id,
            'after': start_date.isoformat(),
            'before': end_date.isoformat(),
            'order': 'ASC'
        }
        
        logger.info(f"Fetching RISE API download: itemId={item_id}, {start_date} to {end_date}")
        response = requests.get(RISE_API_DOWNLOAD, params=params, timeout=300)  # Longer timeout for large downloads
        response.raise_for_status()
        
        # The download endpoint returns JSON with metadata and data in numeric keys
        data = response.json()
        
        if isinstance(data, list):
            # Direct array format
            logger.info(f"Successfully downloaded {len(data)} records from RISE API download endpoint")
            return data
        elif isinstance(data, dict):
            # Check for Results key (some download endpoints use this)
            if 'Results' in data:
                results = data['Results']
                if isinstance(results, list) and len(results) > 0:
                    logger.info(f"Successfully downloaded {len(results)} records from RISE API download endpoint")
                    # Store metadata for reference
                    logger.debug(f"Location: {data.get('Location')}, Parameter: {data.get('Parameter Name:')}, Units: {data.get('Units')}")
                    return results
                else:
                    # Results might be empty, check numeric keys instead
                    pass
            
            # Download endpoint format: data is in numeric string keys (e.g., '0', '1', '2', ...)
            numeric_keys = [k for k in data.keys() if k.isdigit()]
            if numeric_keys:
                # Extract all records from numeric keys
                records = []
                for key in sorted(numeric_keys, key=int):  # Sort numerically
                    record = data[key]
                    if isinstance(record, dict):
                        records.append(record)
                
                if records:
                    logger.info(f"Successfully downloaded {len(records)} records from RISE API download endpoint")
                    # Store metadata for reference
                    logger.debug(f"Location: {data.get('Location')}, Parameter: {data.get('Parameter Name:')}, Units: {data.get('Units')}")
                    return records
            
            # Check for data key (API endpoint format)
            if 'data' in data:
                logger.info(f"Successfully downloaded {len(data['data'])} records from RISE API download endpoint")
                return data['data']
            
            logger.warning(f"Unexpected RISE API download response structure: {list(data.keys())[:10]}")
            return []
        else:
            logger.warning(f"Unexpected RISE API download response type: {type(data)}")
            return []
            
    except requests.exceptions.Timeout:
        logger.warning(f"Timeout fetching RISE API download (itemId={item_id}) - data range may be too large")
        return None
    except Exception as e:
        logger.warning(f"Failed to fetch from RISE API download endpoint: {e}")
        return None


def parse_download_data_by_parameter(download_data: List[Dict], parameter_id: int = None, field_name: str = 'unknown', 
                                     value_validator=None) -> Dict[date, float]:
    """
    Parse download endpoint data and extract records for a specific parameter.
    Groups by date and prefers midnight readings.
    
    Args:
        download_data: List of records from download endpoint
        parameter_id: Optional parameter ID to filter (e.g., 1494 for elevation).
                      If None, all records are included (useful when download endpoint has single parameter type)
        field_name: Name of the field (for logging)
        value_validator: Optional function to validate values (returns True if valid)
    
    Returns:
        Dictionary mapping date to value
    """
    result = {}
    
    for record in download_data:
        if not isinstance(record, dict):
            continue
        
        # Download endpoint format: records have dateTime and result directly
        # API endpoint format: records have attributes with dateTime and result
        if 'attributes' in record:
            attrs = record['attributes']
        else:
            # Direct format (download endpoint)
            attrs = record
        
        # Check parameter ID if provided and present in record
        # Download endpoints for single parameters may not include parameterId
        if parameter_id is not None:
            record_param_id = attrs.get('parameterId')
            if record_param_id is not None and record_param_id != parameter_id:
                continue
        
        # Extract date and value
        date_str = attrs.get('dateTime') or attrs.get('datetime') or attrs.get('Date')
        value = attrs.get('result') or attrs.get('value') or attrs.get('Value')
        
        if not date_str or value is None:
            continue
        
        try:
            parsed_date = parse_date(str(date_str))
            if not parsed_date:
                continue
            
            value_float = float(value)
            
            # Validate value if validator provided
            if value_validator and not value_validator(value_float):
                logger.debug(f"Rejected {field_name} value {value_float} for {parsed_date}")
                continue
            
            # Prefer midnight readings (00:00:00) for daily values
            is_midnight = 'T00:00:00' in str(date_str) or 'T00:00:00+00:00' in str(date_str)
            
            if parsed_date not in result:
                result[parsed_date] = {'value': value_float, 'is_midnight': is_midnight}
            elif is_midnight:
                # Always prefer midnight reading
                result[parsed_date] = {'value': value_float, 'is_midnight': is_midnight}
            # If we already have a value and this isn't midnight, keep the existing one
            
        except (ValueError, TypeError) as e:
            logger.debug(f"Error parsing {field_name} record: {e}")
            continue
    
    # Extract just the values
    return {date: info['value'] for date, info in result.items()}


def fetch_all_parameters_from_download(start_date: date, end_date: date) -> Dict[str, Dict[date, float]]:
    """
    Fetch all parameters (elevation, storage, inflow, outflow) from download endpoint.
    Uses separate itemIds for each parameter type.
    For inflow/outflow, falls back to catalog API if download endpoints aren't available.
    
    Args:
        start_date: Start date
        end_date: End date
    
    Returns:
        Dictionary with keys: 'elevation', 'content', 'inflow', 'outflow'
        Each value is a dict mapping date to value
    """
    logger.info("Fetching all parameters from RISE API download endpoint...")
    results = {}
    
    # Elevation: itemId 508 - "Lake/Reservoir Elevation (ft)"
    elevation_download_data = fetch_rise_api_download(
        LAKE_POWELL_CATALOG_ITEMS['elevation_download'],
        start_date,
        end_date
    )
    if elevation_download_data:
        elevation_data = parse_download_data_by_parameter(
            elevation_download_data,
            parameter_id=None,  # Download endpoint doesn't have parameterId in records
            field_name='elevation',
            value_validator=lambda v: 3000 <= v <= 4000  # Elevation should be 3000-4000 ft
        )
        if elevation_data:
            results['elevation'] = elevation_data
            logger.info(f"Extracted {len(elevation_data)} elevation records")
    
    # Storage/Content: itemId 4276 - "Lake/Reservoir Bank Storage" (acre-feet)
    storage_download_data = fetch_rise_api_download(
        LAKE_POWELL_CATALOG_ITEMS['storage_download'],
        start_date,
        end_date
    )
    if storage_download_data:
        content_data = parse_download_data_by_parameter(
            storage_download_data,
            parameter_id=None,  # Download endpoint doesn't have parameterId in records
            field_name='content',
            value_validator=lambda v: v > 100000  # Storage should be > 100K acre-feet
        )
        if content_data:
            # itemId 509 provides TOTAL storage from dead pool (3370 ft) directly
            # No offset needed - values are correct as-is
            # Recent values: ~6.34M af at ~3538 ft
            # Historical max: ~25.7M af at 3708 ft (July 1983)
            results['content'] = {date: int(value) for date, value in content_data.items()}
            logger.info(f"Extracted {len(content_data)} storage/content records (total storage from dead pool)")
    
    # Inflow: itemId 511 - "Lake/Reservoir Inflow" (cfs)
    inflow_download_data = fetch_rise_api_download(
        LAKE_POWELL_CATALOG_ITEMS['inflow_download'],
        start_date,
        end_date
    )
    if inflow_download_data:
        inflow_data = parse_download_data_by_parameter(
            inflow_download_data,
            parameter_id=None,  # Download endpoint doesn't have parameterId in records
            field_name='inflow',
            value_validator=lambda v: 0 <= v <= 100000  # Inflow should be 0-100000 cfs
        )
        if inflow_data:
            results['inflow'] = inflow_data
            logger.info(f"Extracted {len(inflow_data)} inflow records from download endpoint")
    
    # Outflow: itemId 507 - "Lake/Reservoir Release - Powerplant" (cfs)
    outflow_download_data = fetch_rise_api_download(
        LAKE_POWELL_CATALOG_ITEMS['outflow_download'],
        start_date,
        end_date
    )
    if outflow_download_data:
        outflow_data = parse_download_data_by_parameter(
            outflow_download_data,
            parameter_id=None,  # Download endpoint doesn't have parameterId in records
            field_name='outflow',
            value_validator=lambda v: 0 <= v <= 100000  # Outflow should be 0-100000 cfs
        )
        if outflow_data:
            results['outflow'] = outflow_data
            logger.info(f"Extracted {len(outflow_data)} outflow records from download endpoint")
    
    return results


def fetch_rise_api_data_by_catalog(catalog_item_id: int, start_date: date, end_date: date, parameter_id: int = None) -> Optional[List[Dict]]:
    """
    Fetch data from USBR RISE API using catalogItemId.
    Handles pagination to get all records.
    
    Args:
        catalog_item_id: Catalog item ID (e.g., 508 for Lake Powell elevation)
        start_date: Start date
        end_date: End date
        parameter_id: Optional parameter ID to filter (e.g., 1491 for elevation)
    
    Returns:
        List of data records or None if fetch fails
    """
    # #region agent log
    try:
        with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"A","location":"usbr_csv_collector.py:142","message":"fetch_rise_api_data_by_catalog ENTRY","data":{"catalog_item_id":catalog_item_id,"start_date":str(start_date),"end_date":str(end_date)},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion
    try:
        all_data = []
        page = 1
        url = RISE_API_BASE
        
        # RISE API expects datetime strings with 'Z' timezone (ISO 8601 UTC format)
        # Use start of day for start_date and end of day for end_date
        from datetime import datetime, time
        start_datetime = datetime.combine(start_date, time.min).isoformat() + 'Z'
        end_datetime = datetime.combine(end_date, time.max).isoformat() + 'Z'
        
        while True:
            params = {
                'catalogItemId': catalog_item_id,
                'dateTime[after]': start_datetime,
                'dateTime[before]': end_datetime,
                'page': page
            }
            
            # Filter by parameterId to reduce API response size
            # For elevation (parameterId=1494), this dramatically reduces pages
            # Without filter: 8,694 pages for 1 year; with filter: ~15 pages for 1 year
            if parameter_id:
                params['parameterId'] = parameter_id
                if page == 1:
                    logger.info(f"Filtering by parameterId={parameter_id}")
            
            if page == 1:
                logger.info(f"Fetching RISE API data: catalogItemId={catalog_item_id}, {start_date} to {end_date}")
            
            # #region agent log
            try:
                with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"A","location":"usbr_csv_collector.py:181","message":"API request START","data":{"page":page,"url":url},"timestamp":int(__import__('time').time()*1000)}) + '\n')
            except: pass
            # #endregion
            response = requests.get(url, params=params, timeout=60)
            # #region agent log
            try:
                with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"A","location":"usbr_csv_collector.py:184","message":"API request COMPLETE","data":{"page":page,"status":response.status_code},"timestamp":int(__import__('time').time()*1000)}) + '\n')
            except: pass
            # #endregion
            response.raise_for_status()
            
            result = response.json()
            
            # RISE API returns a dict with 'data' key containing the array
            if isinstance(result, dict) and 'data' in result:
                page_data = result['data']
                all_data.extend(page_data)
                
                # Check pagination
                meta = result.get('meta', {})
                total_items = meta.get('totalItems', 0)
                items_per_page = meta.get('itemsPerPage', 25)
                current_page = meta.get('currentPage', page)
                total_pages = (total_items + items_per_page - 1) // items_per_page
                
                if page == 1:
                    logger.info(f"Total items: {total_items}, Pages: {total_pages}")
                    # #region agent log
                    try:
                        with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
                            f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"A","location":"usbr_csv_collector.py:199","message":"Pagination info","data":{"total_items":total_items,"total_pages":total_pages,"items_per_page":items_per_page},"timestamp":int(__import__('time').time()*1000)}) + '\n')
                    except: pass
                    # #endregion
                
                # Check if there's a next page
                links = result.get('links', {})
                # #region agent log
                try:
                    with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
                        f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"A","location":"usbr_csv_collector.py:203","message":"Pagination check","data":{"current_page":current_page,"total_pages":total_pages,"has_next":"next" in links,"records_so_far":len(all_data)},"timestamp":int(__import__('time').time()*1000)}) + '\n')
                except: pass
                # #endregion
                if 'next' not in links or current_page >= total_pages:
                    break
                
                page += 1
                
                # Progress update every 10 pages
                if page % 10 == 0:
                    logger.info(f"Fetched page {current_page}/{total_pages} ({len(all_data)} records so far)...")
            else:
                break
        
        logger.info(f"Successfully fetched {len(all_data)} total records from RISE API")
        # #region agent log
        try:
            with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"A","location":"usbr_csv_collector.py:214","message":"fetch_rise_api_data_by_catalog EXIT","data":{"total_records":len(all_data)},"timestamp":int(__import__('time').time()*1000)}) + '\n')
        except: pass
        # #endregion
        return all_data
            
    except Exception as e:
        logger.warning(f"Failed to fetch from RISE API: {e}")
        # #region agent log
        try:
            with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"A","location":"usbr_csv_collector.py:218","message":"fetch_rise_api_data_by_catalog EXCEPTION","data":{"error":str(e)},"timestamp":int(__import__('time').time()*1000)}) + '\n')
        except: pass
        # #endregion
        return None


def fetch_rise_api_data(parameter_id: int, start_date: date, end_date: date) -> Optional[List[Dict]]:
    """
    Fetch data from USBR RISE API (legacy method using locationId/parameterId).
    
    Args:
        parameter_id: Parameter ID (4=elevation, 3=storage, 5=inflow, 6=outflow)
        start_date: Start date
        end_date: End date
    
    Returns:
        List of data records or None if fetch fails
    """
    try:
        url = RISE_API_BASE
        params = {
            'locationId': RISE_LOCATION_ID,
            'parameterId': parameter_id,
            'dateTime[after]': start_date.isoformat(),
            'dateTime[before]': end_date.isoformat(),
            'catalogItem.isModeled': 'false'
        }
        
        logger.info(f"Fetching RISE API data: parameterId={parameter_id}, {start_date} to {end_date}")
        response = requests.get(url, params=params, timeout=60)
        response.raise_for_status()
        
        result = response.json()
        # RISE API returns a dict with 'data' key containing the array
        if isinstance(result, dict) and 'data' in result:
            data = result['data']
            logger.info(f"Successfully fetched {len(data)} records from RISE API")
            return data if isinstance(data, list) else [data]
        elif isinstance(result, list):
            logger.info(f"Successfully fetched {len(result)} records from RISE API")
            return result
        else:
            logger.warning(f"Unexpected RISE API response format: {type(result)}")
            return []
            
    except Exception as e:
        logger.warning(f"Failed to fetch from RISE API: {e}")
        return None


def parse_date(date_str: str) -> Optional[date]:
    """
    Parse date string in various formats.
    Handles ISO datetime strings with timezone.
    
    Args:
        date_str: Date string in various formats
    
    Returns:
        Date object or None if parsing fails
    """
    if not date_str:
        return None
    
    date_str = str(date_str).strip()
    
    # Try ISO format first (handles timezone)
    try:
        # Handle ISO format with timezone: "2024-12-05T00:00:00+00:00"
        if 'T' in date_str:
            dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            return dt.date()
    except (ValueError, AttributeError):
        pass
    
    # Try datetime format without timezone: "2023-01-01 07:00:00"
    try:
        dt = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
        return dt.date()
    except (ValueError, AttributeError):
        pass
    
    # Try standard date formats
    date_formats = [
        '%Y-%m-%d',
        '%m/%d/%Y',
        '%d/%m/%Y',
        '%Y/%m/%d',
        '%m-%d-%Y',
        '%d-%m-%Y',
    ]
    
    for fmt in date_formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    
    logger.warning(f"Could not parse date: {date_str}")
    return None


def fetch_all_water_data(start_date: date = None, end_date: date = None) -> List[Dict]:
    """
    Fetch all water measurement data (elevation, storage, inflow, outflow).
    Tries multiple methods: CSV, JSON, and RISE API.
    
    Args:
        start_date: Start date (optional, for RISE API)
        end_date: End date (optional, for RISE API)
    
    Returns:
        List of dictionaries with date, elevation, content, inflow, outflow
    """
    # #region agent log
    try:
        with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"D","location":"usbr_csv_collector.py:311","message":"fetch_all_water_data ENTRY","data":{"start_date":str(start_date) if start_date else None,"end_date":str(end_date) if end_date else None},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion
    
    # Initialize data variables
    storage_data = None
    elevation_data = None
    inflow_data = None
    outflow_data = None
    
    # FIRST: Try RISE API download endpoint (most efficient - single request for all data)
    download_params = {}
    if start_date and end_date:
        logger.info("Attempting RISE API download endpoint (most efficient method - fetches all parameters)...")
        download_params = fetch_all_parameters_from_download(start_date, end_date)
        
        # Convert download parameter data to standard format
        # Note: itemId 4276 provides storage/content, not elevation
        if download_params.get('elevation'):
            elevation_data = [
                {'Date': str(d), 'Elevation': v} 
                for d, v in sorted(download_params['elevation'].items())
            ]
            logger.info(f"Converted {len(elevation_data)} elevation records from download endpoint")
        else:
            elevation_data = None  # itemId 4276 doesn't have elevation
        
        if download_params.get('content'):
            storage_data = [
                {'Date': str(d), 'Storage': int(v)} 
                for d, v in sorted(download_params['content'].items())
            ]
            logger.info(f"Converted {len(storage_data)} storage/content records from download endpoint")
            # Log a sample value to verify it's correct
            if storage_data:
                sample = storage_data[0]
                logger.info(f"Sample storage value from download endpoint: {sample['Storage']:,} acre-feet on {sample['Date']}")
        
        if download_params.get('inflow'):
            inflow_data = [
                {'Date': str(d), 'Inflow': int(v)} 
                for d, v in sorted(download_params['inflow'].items())
            ]
            logger.info(f"Converted {len(inflow_data)} inflow records from download endpoint")
        
        if download_params.get('outflow'):
            outflow_data = [
                {'Date': str(d), 'Total Release': int(v)} 
                for d, v in sorted(download_params['outflow'].items())
            ]
            logger.info(f"Converted {len(outflow_data)} outflow records from download endpoint")
    
    # SECOND: Try to fetch from CSV/JSON (full historical dataset)
    if not elevation_data:
        logger.info("Trying CSV/JSON endpoints...")
        storage_data = fetch_csv_data('Storage') or fetch_json_data('Storage')
        elevation_data = fetch_csv_data('Pool Elevation') or fetch_json_data('Pool Elevation')
        inflow_data = fetch_csv_data('Inflow') or fetch_json_data('Inflow')
        outflow_data = fetch_csv_data('Total Release') or fetch_json_data('Total Release')
    
    # #region agent log
    try:
        with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"D","location":"usbr_csv_collector.py:327","message":"CSV/JSON attempts complete","data":{"has_storage":storage_data is not None,"has_elevation":elevation_data is not None},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion
    
    # THIRD: If CSV/JSON didn't work, try RISE API using catalogItemId (pagination method)
    if not elevation_data and start_date and end_date:
        logger.info("CSV/JSON fetch failed, trying RISE API with catalogItemId...")
        # For historical data (before ~1995), parameterId=1494 may not exist
        # Try parameterId=1494 first (works for recent data), then fall back to searching all parameters
        elevation_catalog_data = fetch_rise_api_data_by_catalog(
            LAKE_POWELL_CATALOG_ITEMS['elevation'], 
            start_date, 
            end_date,
            parameter_id=LAKE_POWELL_PARAMETER_IDS['elevation']  # Filter by parameterId=1494 for elevation
        )
        
        # If no data found with parameterId=1494, try without filter to find elevation in other parameterIds
        # This handles historical data where elevation might be in parameterId=9, 12, etc.
        if not elevation_catalog_data or len(elevation_catalog_data) == 0:
            logger.info("No data with parameterId=1494, trying without filter to find elevation in other parameterIds...")
            all_elevation_data = fetch_rise_api_data_by_catalog(
                LAKE_POWELL_CATALOG_ITEMS['elevation'],
                start_date,
                end_date,
                parameter_id=None  # No filter - we'll identify elevation by value range
            )
            # Filter to only elevation values (3000-4000 ft) and prefer parameterIds with midnight readings
            if all_elevation_data:
                from collections import defaultdict
                # Group by parameterId and count midnight readings
                param_stats = defaultdict(lambda: {'total': 0, 'midnight': 0, 'records': []})
                for record in all_elevation_data:
                    attrs = record.get('attributes', {})
                    param_id = attrs.get('parameterId')
                    result = attrs.get('result')
                    date_str = attrs.get('dateTime', '')
                    if result:
                        try:
                            val = float(result)
                            if 3000 <= val <= 4000:
                                param_stats[param_id]['total'] += 1
                                param_stats[param_id]['records'].append(record)
                                if 'T00:00:00' in date_str or 'T00:00:00+00:00' in date_str:
                                    param_stats[param_id]['midnight'] += 1
                        except:
                            pass
                
                # Prefer parameterId with most midnight readings, then most total readings
                if param_stats:
                    best_param = max(param_stats.keys(), 
                                   key=lambda pid: (param_stats[pid]['midnight'], param_stats[pid]['total']))
                    elevation_catalog_data = param_stats[best_param]['records']
                    logger.info(f"Found {len(elevation_catalog_data)} elevation records in parameterId={best_param} "
                              f"({param_stats[best_param]['midnight']} midnight readings)")
        
        # Fetch storage/content using the correct catalog item (4276 for storage, not 508)
        # itemId 4276 is "Lake/Reservoir Bank Storage" - this is the correct item for storage
        content_catalog_data = fetch_rise_api_data_by_catalog(
            LAKE_POWELL_CATALOG_ITEMS['storage_download'],  # Use itemId 4276 for storage
            start_date,
            end_date,
            parameter_id=None  # Download endpoint doesn't use parameterId, but catalog API might
        ) if LAKE_POWELL_CATALOG_ITEMS['storage_download'] else None
        
        inflow_catalog_data = fetch_rise_api_data_by_catalog(
            LAKE_POWELL_CATALOG_ITEMS['elevation'],
            start_date,
            end_date,
            parameter_id=LAKE_POWELL_PARAMETER_IDS['inflow']
        ) if LAKE_POWELL_PARAMETER_IDS['inflow'] else None
        
        outflow_catalog_data = fetch_rise_api_data_by_catalog(
            LAKE_POWELL_CATALOG_ITEMS['elevation'],
            start_date,
            end_date,
            parameter_id=LAKE_POWELL_PARAMETER_IDS['outflow']
        ) if LAKE_POWELL_PARAMETER_IDS['outflow'] else None
        
        # Combine all data
        all_catalog_data = []
        if elevation_catalog_data:
            all_catalog_data.extend(elevation_catalog_data)
        if content_catalog_data:
            all_catalog_data.extend(content_catalog_data)
        if inflow_catalog_data:
            all_catalog_data.extend(inflow_catalog_data)
        if outflow_catalog_data:
            all_catalog_data.extend(outflow_catalog_data)
        
        if all_catalog_data:
            # Group all parameters by date and parameterId
            # Structure: {date: {param_id: {value, time, is_midnight}}}
            data_by_date_param = {}
            
            for record in all_catalog_data:
                if 'attributes' in record:
                    attrs = record['attributes']
                    result = attrs.get('result')
                    param_id = attrs.get('parameterId')
                    date_str = attrs.get('dateTime')
                    
                    if result is not None and date_str:
                        try:
                            result_val = float(result)
                            parsed_date = parse_date(date_str)
                            
                            if parsed_date:
                                if parsed_date not in data_by_date_param:
                                    data_by_date_param[parsed_date] = {}
                                
                                is_midnight = 'T00:00:00' in date_str or 'T00:00:00+00:00' in date_str
                                
                                # Store parameter value, preferring midnight readings (00:00:00)
                                # For daily measurements, we want one reading per day - typically at midnight
                                if param_id not in data_by_date_param[parsed_date]:
                                    # First reading for this parameter on this date
                                    data_by_date_param[parsed_date][param_id] = {
                                        'value': result_val,
                                        'time': date_str,
                                        'is_midnight': is_midnight
                                    }
                                elif is_midnight:
                                    # Always prefer midnight reading if available
                                    data_by_date_param[parsed_date][param_id] = {
                                        'value': result_val,
                                        'time': date_str,
                                        'is_midnight': is_midnight
                                    }
                                # If we already have a non-midnight reading, keep it unless we find midnight
                                # This ensures we get one reading per day
                        except (ValueError, TypeError):
                            pass
            
            # Extract elevation, content, inflow, outflow by parameterId
            # Store in format compatible with existing processing logic
            elevation_by_date = {}
            content_by_date = {}
            inflow_by_date = {}
            outflow_by_date = {}
            
            for data_date, params in data_by_date_param.items():
                # Elevation: parameterId 1494, STRICT range 3000-4000 ft (Lake Powell never below 3000 or above 4000)
                if LAKE_POWELL_PARAMETER_IDS['elevation'] in params:
                    val = params[LAKE_POWELL_PARAMETER_IDS['elevation']]['value']
                    # Strict validation: Lake Powell elevation is always 3000-4000 ft
                    if 3000 <= val <= 4000:
                        elevation_by_date[data_date] = val
                    else:
                        logger.warning(f"Rejected invalid elevation value {val} for {data_date} (outside 3000-4000 range)")
                
                # Content: parameterId 3, values > 100000 (acre-feet - Lake Powell content is millions)
                # NOTE: parameterId 3 within itemId 508 may not be the correct storage parameter
                # The download endpoint (itemId 4276) should be used instead when possible
                if LAKE_POWELL_PARAMETER_IDS['content'] in params:
                    val = params[LAKE_POWELL_PARAMETER_IDS['content']]['value']
                    # Content should be in millions of acre-feet (Lake Powell capacity ~27M)
                    # Expected range: 4M-6.5M acre-feet for current conditions
                    if val > 100000:  # At least 100K acre-feet
                        content_by_date[data_date] = int(val)
                        logger.warning(f"Using catalog API parameterId 3 for content on {data_date}: {val:,} acre-feet. "
                                     f"This may be incorrect - prefer download endpoint (itemId 4276) when possible.")
                    else:
                        logger.warning(f"Rejected invalid content value {val} for {data_date} (too small)")
                
                # Inflow: parameterId 12, reasonable range 0-100000 cfs
                if LAKE_POWELL_PARAMETER_IDS['inflow'] in params:
                    val = params[LAKE_POWELL_PARAMETER_IDS['inflow']]['value']
                    if 0 <= val <= 100000:  # Reasonable range for inflow
                        inflow_by_date[data_date] = int(val)
                
                # Outflow: parameterId 18, reasonable range 0-100000 cfs
                if LAKE_POWELL_PARAMETER_IDS['outflow'] in params:
                    val = params[LAKE_POWELL_PARAMETER_IDS['outflow']]['value']
                    if 0 <= val <= 100000:  # Reasonable range for outflow
                        outflow_by_date[data_date] = int(val)
            
            # Convert to list format compatible with existing processing
            # Format: [{'Date': date_str, 'Elevation': value}, ...]
            if elevation_by_date:
                elevation_data = [{'Date': str(d), 'Elevation': v} for d, v in elevation_by_date.items()]
                logger.info(f"Extracted {len(elevation_data)} elevation records from RISE API")
            
            if content_by_date:
                storage_data = [{'Date': str(d), 'Storage': v} for d, v in content_by_date.items()]
                logger.info(f"Extracted {len(storage_data)} content/storage records from RISE API")
            
            if inflow_by_date:
                inflow_data = [{'Date': str(d), 'Inflow': v} for d, v in inflow_by_date.items()]
                logger.info(f"Extracted {len(inflow_data)} inflow records from RISE API")
            
            if outflow_by_date:
                outflow_data = [{'Date': str(d), 'Total Release': v} for d, v in outflow_by_date.items()]
                logger.info(f"Extracted {len(outflow_data)} outflow records from RISE API")
        
        # Fallback to locationId/parameterId method if catalogItemId doesn't work
        if not elevation_data:
            logger.info("Trying RISE API with locationId/parameterId...")
            storage_data = fetch_rise_api_data(PARAMETER_IDS['storage'], start_date, end_date)
            elevation_data = fetch_rise_api_data(PARAMETER_IDS['elevation'], start_date, end_date)
            inflow_data = fetch_rise_api_data(PARAMETER_IDS['inflow'], start_date, end_date)
            outflow_data = fetch_rise_api_data(PARAMETER_IDS['outflow'], start_date, end_date)
    
    # Combine data by date
    data_by_date = {}
    
    # Process storage data
    if storage_data:
        for row in storage_data:
            # Handle different CSV/JSON structures
            if isinstance(row, dict):
                date_str = row.get('Date') or row.get('date') or row.get('datetime') or row.get('DateTime')
                value = row.get('Storage') or row.get('storage') or row.get('Value') or row.get('value')
                
                if date_str and value:
                    parsed_date = parse_date(str(date_str))
                    if parsed_date:
                        if parsed_date not in data_by_date:
                            data_by_date[parsed_date] = {}
                        try:
                            data_by_date[parsed_date]['content'] = int(float(str(value).replace(',', '')))
                        except (ValueError, TypeError):
                            pass
    
    # Process elevation data
    if elevation_data:
        # Group by date first to handle multiple readings per day
        elevation_by_date = {}
        for row in elevation_data:
            if isinstance(row, dict):
                # RISE API format: data is in 'attributes' key
                if 'attributes' in row:
                    attrs = row['attributes']
                    date_str = attrs.get('dateTime') or attrs.get('datetime')
                    value = attrs.get('result')
                else:
                    # Fallback for other formats
                    date_str = (row.get('dateTime') or row.get('datetime') or row.get('Date') or 
                               row.get('date') or row.get('DateTime'))
                    value = (row.get('value') or row.get('Value') or row.get('Elevation') or 
                            row.get('elevation') or row.get('Pool Elevation'))
                
                if date_str and value is not None:
                    parsed_date = parse_date(str(date_str))
                    if parsed_date:
                        # Prefer midnight (00:00:00) readings for daily values
                        is_midnight = 'T00:00:00' in str(date_str) or 'T00:00:00+00:00' in str(date_str)
                        
                        if parsed_date not in elevation_by_date:
                            elevation_by_date[parsed_date] = {'value': None, 'is_midnight': False, 'time': date_str}
                        
                        # If this is a midnight reading, use it; otherwise keep first non-midnight
                        if is_midnight or elevation_by_date[parsed_date]['value'] is None:
                            try:
                                elevation_by_date[parsed_date] = {
                                    'value': float(str(value).replace(',', '')),
                                    'is_midnight': is_midnight,
                                    'time': date_str
                                }
                            except (ValueError, TypeError):
                                pass
        
        # Add to data_by_date with strict validation
        for data_date, elev_info in elevation_by_date.items():
            if elev_info['value'] is not None:
                elev_value = elev_info['value']
                # Strict validation: Lake Powell elevation is always 3000-4000 ft
                # Only store valid elevation values - reject anything outside this range
                if 3000 <= elev_value <= 4000:
                    if data_date not in data_by_date:
                        data_by_date[data_date] = {}
                    data_by_date[data_date]['elevation'] = elev_value
                else:
                    logger.warning(f"Rejected invalid elevation {elev_value} for {data_date} (outside 3000-4000 range - not storing)")
    
    # Process inflow data
    if inflow_data:
        for row in inflow_data:
            if isinstance(row, dict):
                date_str = row.get('Date') or row.get('date') or row.get('datetime') or row.get('DateTime')
                value = row.get('Inflow') or row.get('inflow') or row.get('Value') or row.get('value')
                
                if date_str and value:
                    parsed_date = parse_date(str(date_str))
                    if parsed_date:
                        if parsed_date not in data_by_date:
                            data_by_date[parsed_date] = {}
                        try:
                            data_by_date[parsed_date]['inflow'] = int(float(str(value).replace(',', '')))
                        except (ValueError, TypeError):
                            pass
    
    # Process outflow data
    if outflow_data:
        for row in outflow_data:
            if isinstance(row, dict):
                date_str = row.get('Date') or row.get('date') or row.get('datetime') or row.get('DateTime')
                value = row.get('Release') or row.get('release') or row.get('Total Release') or row.get('Value') or row.get('value')
                
                if date_str and value:
                    parsed_date = parse_date(str(date_str))
                    if parsed_date:
                        if parsed_date not in data_by_date:
                            data_by_date[parsed_date] = {}
                        try:
                            data_by_date[parsed_date]['outflow'] = int(float(str(value).replace(',', '')))
                        except (ValueError, TypeError):
                            pass
    
    # Convert to list format and calculate change (elevation change from previous day)
    results = []
    previous_elevation = None
    
    for data_date, values in sorted(data_by_date.items()):
        # Include records with at least elevation (other fields are optional)
        if 'elevation' in values:
            current_elevation = values.get('elevation')
            
            # Final validation: reject any elevation outside 3000-4000 range
            # Lake Powell has never been below 3000 ft or above 4000 ft since filling
            if current_elevation < 3000 or current_elevation > 4000:
                logger.warning(f"Rejecting record for {data_date}: elevation {current_elevation} is outside valid range (3000-4000 ft)")
                continue
            
            # Calculate change from previous day (in feet)
            change = None
            if previous_elevation is not None:
                change = round(current_elevation - previous_elevation, 2)
            
            results.append({
                'date': data_date,
                'elevation': current_elevation,
                'change': change,  # Change in elevation from previous day (feet), None for first record
                'content': values.get('content', 0),
                'inflow': values.get('inflow', 0),
                'outflow': values.get('outflow', 0),
            })
            
            previous_elevation = current_elevation
    
    logger.info(f"Combined {len(results)} records from all data sources")
    if results:
        logger.info(f"Date range: {min(r['date'] for r in results)} to {max(r['date'] for r in results)}")
    # #region agent log
    try:
        with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"D","location":"usbr_csv_collector.py:485","message":"fetch_all_water_data EXIT","data":{"total_records":len(results)},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion
    return results

