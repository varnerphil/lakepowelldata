"""
SNOTEL data collector for Lake Powell.
Fetches historical SNOTEL site data from USDA AWDB API.
"""
import requests
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple
import logging
import re
from zeep import Client
from zeep.cache import SqliteCache
from zeep.transports import Transport

logger = logging.getLogger(__name__)

# AWDB Web Service WSDL
AWDB_WSDL = "https://wcc.sc.egov.usda.gov/awdbWebService/services?WSDL"

# SNOTEL text report URL
SNOTEL_REPORT_URL = "https://www.water-data.com/colorado_snotel_rpt.txt"

# Element codes for AWDB API
ELEMENT_CODES = {
    'WTEQ': 'SNOW WATER EQUIVALENT',  # Snow Water Equivalent (inches)
    'PREC': 'PRECIPITATION',  # Precipitation (inches)
    'SNWD': 'SNOW DEPTH',  # Snow Depth (inches)
    'TMAX': 'TEMPERATURE MAXIMUM',  # Maximum Temperature (Fahrenheit)
    'TMIN': 'TEMPERATURE MINIMUM',  # Minimum Temperature (Fahrenheit)
    'TAVG': 'TEMPERATURE AVERAGE',  # Average Temperature (Fahrenheit)
}

# Data source code for SNOTEL
SNOTEL_DATA_SOURCE = "SNOTEL"


def parse_snotel_report() -> List[Dict]:
    """
    Parse the SNOTEL text report to extract site names, basins, and current values.
    
    Returns:
        List of dictionaries with site information: name, elevation, basin, and current measurements
    """
    try:
        response = requests.get(SNOTEL_REPORT_URL, timeout=30)
        response.raise_for_status()
        text = response.text
        
        sites = []
        current_basin = ''
        in_data_section = False
        
        lines = text.split('\n')
        
        for i, line in enumerate(lines):
            original_line = line
            line = line.strip()
            
            # Skip header lines
            if 'BASIN' in line or 'Data Site Name' in line or '---' in line:
                in_data_section = True
                continue
            
            if not in_data_section:
                continue
            
            # Check for basin name
            is_basin_name = (
                re.match(r'^[A-Z\s\/#]+$', line) and
                len(line) > 5 and
                not re.match(r'^\d', line) and
                ('BASIN' in line or 'RIVER' in line or
                 any(b in line for b in ['UPPER COLORADO', 'DUCHESNE', 'YAMPA', 'PRICE',
                                         'ESCALANTE', 'DIRTY DEVIL', 'GUNNISON', 'ROARING FORK',
                                         'SOUTH EASTERN', 'SAN JUAN']))
            )
            
            if is_basin_name:
                current_basin = line
                continue
            
            # Skip empty lines, basin index lines, and header lines
            if not line or 'Basin Index' in line or '-----' in line:
                continue
            
            # Parse site data line
            if not original_line.startswith(' ') or not current_basin:
                continue
            
            # Split by multiple spaces (2 or more) to get fields
            parts = re.split(r'\s{2,}', line)
            
            # Need at least 8 fields: name, elevation, and 6 data values
            if len(parts) < 8:
                continue
            
            # First field should be the name
            name = parts[0].strip()
            if not name or re.match(r'^\d+$', name):
                continue
            
            # Second field should be elevation
            try:
                elevation = int(parts[1].strip())
                if elevation < 100 or elevation > 15000:
                    continue
            except (ValueError, IndexError):
                continue
            
            # Skip if name looks like a basin name
            if name.upper() == name and len(name) > 15 and not re.search(r'[a-z]', name):
                continue
            
            # Parse measurement values (fields 2-7)
            def parse_value(val: str) -> Optional[float]:
                cleaned = val.strip()
                if cleaned in ['-M', '*', '', 'M']:
                    return None
                try:
                    return float(cleaned)
                except (ValueError, TypeError):
                    return None
            
            swe_current = parse_value(parts[2]) if len(parts) > 2 else None
            swe_median = parse_value(parts[3]) if len(parts) > 3 else None
            swe_percent = parse_value(parts[4]) if len(parts) > 4 else None
            precip_current = parse_value(parts[5]) if len(parts) > 5 else None
            precip_median = parse_value(parts[6]) if len(parts) > 6 else None
            precip_percent = parse_value(parts[7]) if len(parts) > 7 else None
            
            sites.append({
                'name': name,
                'elevation': elevation,
                'basin': current_basin,
                'swe_current': swe_current,
                'swe_median': swe_median,
                'swe_percent': swe_percent,
                'precip_current': precip_current,
                'precip_median': precip_median,
                'precip_percent': precip_percent,
            })
        
        logger.info(f"Parsed {len(sites)} sites from SNOTEL report")
        return sites
        
    except Exception as e:
        logger.error(f"Error parsing SNOTEL report: {e}", exc_info=True)
        return []


def get_awdb_client() -> Optional[Client]:
    """
    Create and return an AWDB SOAP client.
    
    Returns:
        zeep Client instance or None if creation fails
    """
    try:
        # Use SQLite cache to avoid re-downloading WSDL
        cache = SqliteCache(path='/tmp/awdb_cache.db', timeout=3600)
        transport = Transport(cache=cache)
        client = Client(AWDB_WSDL, transport=transport)
        return client
    except Exception as e:
        logger.error(f"Error creating AWDB client: {e}", exc_info=True)
        return None


def generate_station_id_candidates(site_name: str, state: str) -> List[str]:
    """
    Generate possible station ID candidates from a site name.
    
    SNOTEL station IDs are typically abbreviations of the site name.
    Common patterns:
    - First word or first few letters
    - Abbreviated version (remove common words, take first letters)
    - All caps, no spaces
    
    Args:
        site_name: Full site name
        state: State code (e.g., "CO", "UT", "WY")
    
    Returns:
        List of possible station ID strings to try
    """
    candidates = []
    
    # Remove common suffixes and words
    name_clean = site_name.upper()
    for suffix in [' SUMMIT', ' PASS', ' LAKE', ' CREEK', ' RIVER', ' PARK', ' BASIN', ' MOUNTAIN', ' MTN', ' PEAK']:
        name_clean = name_clean.replace(suffix, '')
    
    # Pattern 1: First word (up to 8 chars)
    first_word = name_clean.split()[0] if name_clean.split() else name_clean
    if len(first_word) <= 8:
        candidates.append(first_word)
    
    # Pattern 2: First 6-8 characters of cleaned name
    if len(name_clean.replace(' ', '')) >= 6:
        candidates.append(name_clean.replace(' ', '')[:8])
    
    # Pattern 3: Abbreviation (first letter of each word, up to 6 chars)
    words = name_clean.split()
    if len(words) > 1:
        abbrev = ''.join(w[0] for w in words if w)[:6]
        if len(abbrev) >= 3:
            candidates.append(abbrev)
    
    # Pattern 4: First 4-6 chars
    candidates.append(name_clean.replace(' ', '')[:6])
    candidates.append(name_clean.replace(' ', '')[:4])
    
    # Remove duplicates and return
    return list(dict.fromkeys(candidates))  # Preserves order while removing duplicates


def find_site_id(client: Client, site_name: str, state: str = None) -> Optional[str]:
    """
    Find AWDB site ID for a given site name.
    
    NOTE: The AWDB getStations API method doesn't appear to work reliably,
    returning 0 results even with valid parameters. As a workaround, we:
    1. Try to construct station triplets from site name patterns
    2. Validate them using getStationMetadata
    3. Return None if no match is found (sites can still be stored by name)
    
    Args:
        client: AWDB SOAP client
        site_name: Name of the SNOTEL site
        state: Optional state code (e.g., "CO", "UT", "WY")
    
    Returns:
        Site ID string (station triplet base: "STATE:STATION") or None if not found
    """
    if not state:
        # Try common states for Colorado River Basin SNOTEL sites
        states_to_try = ['CO', 'UT', 'WY', 'NM', 'AZ']
    else:
        states_to_try = [state]
    
    # Generate candidate station IDs from the site name
    candidates = generate_station_id_candidates(site_name, states_to_try[0] if states_to_try else 'CO')
    
    # Limit candidates to avoid too many API calls
    candidates = candidates[:10]  # Try up to 10 candidates
    
    # Try each candidate with each state
    for state_cd in states_to_try:
        for station_id in candidates:
            # Try with WTEQ element (most common for SNOTEL)
            triplet = f"{state_cd}:{station_id}:WTEQ"
            try:
                metadata = client.service.getStationMetadata(triplet)
                # Check if the name matches (case-insensitive, partial match OK)
                metadata_name = getattr(metadata, 'stationName', '').upper()
                site_name_upper = site_name.upper()
                
                # Check for match (either name contains the other, or they're very similar)
                if metadata_name:
                    # Exact match or one contains the other
                    if (site_name_upper == metadata_name or 
                        site_name_upper in metadata_name or 
                        metadata_name in site_name_upper or
                        # Check if key words match (first 2-3 words)
                        any(word in metadata_name for word in site_name_upper.split()[:3] if len(word) > 3)):
                        logger.info(f"Found match: {triplet} -> {metadata_name} (searching for: {site_name})")
                        # Return the base triplet (STATE:STATION) without element
                        return f"{state_cd}:{station_id}"
            except Exception as e:
                # This triplet doesn't exist, try next
                continue
    
    # If no match found, return None
    # Sites can still be stored in the database by name, and we can map them later
    logger.debug(f"Could not find station ID for '{site_name}' in states {states_to_try}")
    return None


def fetch_site_data(
    client: Client,
    site_id: str,
    element_cd: str,
    start_date: date,
    end_date: date
) -> Optional[List[Dict]]:
    """
    Fetch historical data for a site and element.
    
    Args:
        client: AWDB SOAP client
        site_id: AWDB site ID (station triplet, format: "STATE:STATION:ELEMENT")
        element_cd: Element code (e.g., 'WTEQ', 'PREC')
        start_date: Start date for data retrieval
        end_date: End date for data retrieval
    
    Returns:
        List of dictionaries with date and value, or None if error
    """
    try:
        # Site triplet format is "STATE:STATION:ELEMENT"
        # If site_id already includes element, use it; otherwise append element
        if ':' in site_id and site_id.count(':') == 2:
            # Already has element, replace it
            parts = site_id.split(':')
            site_triplet = f"{parts[0]}:{parts[1]}:{element_cd}"
        elif ':' in site_id:
            # Has state:station, append element
            site_triplet = f"{site_id}:{element_cd}"
        else:
            # Just station ID, need to construct full triplet
            # This is a fallback - ideally we'd have the full triplet
            site_triplet = f"{site_id}:{element_cd}"
        
        # Call getData
        result = client.service.getData(
            stationTriplets=[site_triplet],
            elementCd=element_cd,
            ordinal=1,  # Primary sensor
            heightDepth=None,
            duration='DAILY',
            getFlags=False,
            beginDate=start_date,
            endDate=end_date
        )
        
        if not result or not hasattr(result, 'values') or not result.values:
            return None
        
        # Parse the data
        data_points = []
        for value in result.values:
            if hasattr(value, 'value') and value.value is not None:
                try:
                    data_points.append({
                        'date': value.beginDate if hasattr(value, 'beginDate') else None,
                        'value': float(value.value)
                    })
                except (ValueError, TypeError) as e:
                    logger.debug(f"Error parsing value for {site_triplet}: {e}")
                    continue
        
        return data_points if data_points else None
        
    except Exception as e:
        logger.warning(f"Error fetching data for site {site_id}, element {element_cd}: {e}")
        return None


def fetch_all_site_historical_data(
    site_id: str,
    start_date: date = None,
    end_date: date = None
) -> Dict[str, List[Dict]]:
    """
    Fetch all historical data for a SNOTEL site.
    
    Args:
        site_id: AWDB site ID
        start_date: Start date (defaults to 10 years ago)
        end_date: End date (defaults to today)
    
    Returns:
        Dictionary mapping element codes to lists of data points
    """
    if start_date is None:
        start_date = date.today() - timedelta(days=365 * 10)  # 10 years of history
    if end_date is None:
        end_date = date.today()
    
    client = get_awdb_client()
    if not client:
        return {}
    
    all_data = {}
    
    # Fetch data for each element
    for element_cd in ['WTEQ', 'PREC', 'SNWD', 'TMAX', 'TMIN', 'TAVG']:
        data = fetch_site_data(client, site_id, element_cd, start_date, end_date)
        if data:
            all_data[element_cd] = data
    
    return all_data


def fetch_all_snotel_sites_historical() -> List[Dict]:
    """
    Fetch historical data for all SNOTEL sites in the Colorado report.
    
    Returns:
        List of dictionaries with site information and historical data
    """
    # Parse sites from report
    sites = parse_snotel_report()
    
    if not sites:
        logger.error("No sites found in SNOTEL report")
        return []
    
    client = get_awdb_client()
    if not client:
        logger.error("Failed to create AWDB client")
        return []
    
    results = []
    
    # Try to find site IDs and fetch data
    for site in sites:
        site_name = site['name']
        logger.info(f"Processing site: {site_name}")
        
        # Try to find site ID (try CO, UT, WY states)
        site_id = None
        for state in ['CO', 'UT', 'WY', 'NM', 'AZ']:
            site_id = find_site_id(client, site_name, state)
            if site_id:
                break
        
        if not site_id:
            logger.warning(f"Could not find site ID for: {site_name}")
            continue
        
        logger.info(f"Found site ID {site_id} for {site_name}")
        
        # Fetch historical data
        historical_data = fetch_all_site_historical_data(site_id)
        
        results.append({
            'site_id': site_id,
            'name': site_name,
            'elevation': site['elevation'],
            'basin': site['basin'],
            'historical_data': historical_data
        })
    
    return results

