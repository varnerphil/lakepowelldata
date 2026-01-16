"""
USBR (Bureau of Reclamation) data collector.
Fetches water level data from USBR for Lake Powell.
"""
import requests
from bs4 import BeautifulSoup
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional
import time
import logging

logger = logging.getLogger(__name__)

USBR_BASE_URL = "https://www.usbr.gov/rsvrWater/rsv40Day.html"
SITE_ID = "919"  # Lake Powell site ID


def fetch_single_date(target_date: date) -> Optional[Dict]:
    """
    Fetch water measurement data for a single date from USBR.
    
    Note: The USBR endpoint may only provide the last 40 days of data.
    For historical data beyond that, this may return None.
    
    Args:
        target_date: Date to fetch data for
    
    Returns:
        Dictionary with elevation, content, inflow, outflow, date
        Returns None if data not available or error occurs
    """
    if target_date > date.today():
        raise ValueError(f"Cannot fetch data for future date: {target_date}")
    
    # Check if date is too far in the past (USBR typically only has last 40 days)
    days_ago = (date.today() - target_date).days
    if days_ago > 60:  # Warn if beyond typical 40-day window
        logger.debug(f"Requesting data for {days_ago} days ago - may not be available from USBR endpoint")
    
    max_retries = 3
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            params = {
                'siteid': SITE_ID,
                'as_of': target_date.strftime('%Y-%m-%d')
            }
            
            response = requests.get(USBR_BASE_URL, params=params, timeout=30)
            response.raise_for_status()
            
            # Parse HTML response
            try:
                data = parse_usbr_html(response.text, target_date)
                return data
            except ValueError as e:
                # If we can't find the date, it might be outside the 40-day window
                logger.debug(f"Could not find data for {target_date}: {e}")
                return None
            
        except requests.exceptions.RequestException as e:
            logger.warning(f"Attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                logger.debug(f"Failed to fetch data after {max_retries} attempts for {target_date}")
                return None
    
    return None


def fetch_date_range(start_date: date, end_date: date) -> List[Dict]:
    """
    Fetch water measurement data for a date range.
    
    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
    
    Returns:
        List of measurement dictionaries
    """
    if start_date > end_date:
        raise ValueError("start_date must be <= end_date")
    
    if end_date > date.today():
        raise ValueError(f"Cannot fetch data for future dates: {end_date}")
    
    results = []
    current_date = start_date
    
    while current_date <= end_date:
        try:
            data = fetch_single_date(current_date)
            if data:
                results.append(data)
            # Add small delay to avoid rate limiting
            time.sleep(0.5)
        except Exception as e:
            logger.warning(f"Failed to fetch data for {current_date}: {e}")
        
        current_date += timedelta(days=1)
    
    return results


def parse_usbr_html(html_content: str, target_date: date) -> Dict:
    """
    Parse USBR HTML response to extract water measurement data.
    
    Args:
        html_content: HTML content from USBR response
        target_date: Date for the measurement
    
    Returns:
        Dictionary with elevation, content, inflow, outflow, date
    """
    from datetime import datetime
    
    soup = BeautifulSoup(html_content, 'html.parser')
    
    data = {
        'date': target_date,
        'elevation': None,
        'content': None,
        'inflow': None,
        'outflow': None
    }
    
    # Find the data table with id "form1:datatable"
    data_table = soup.find('table', id='form1:datatable')
    if not data_table:
        # Fallback: try to find any table with data rows
        tables = soup.find_all('table')
        for table in tables:
            if table.find('tbody') and len(table.find('tbody').find_all('tr')) > 0:
                data_table = table
                break
    
    if not data_table:
        raise ValueError(f"Could not find data table in USBR HTML for {target_date}")
    
    # Parse rows from tbody
    tbody = data_table.find('tbody')
    if not tbody:
        raise ValueError(f"Could not find tbody in data table for {target_date}")
    
    rows = tbody.find_all('tr')
    
    # Target date string formats to match (USBR uses "DD-MMM-YYYY" format)
    target_date_strs = [
        target_date.strftime('%d-%b-%Y'),  # 22-Dec-2025
        target_date.strftime('%-d-%b-%Y'),  # 22-Dec-2025 (no leading zero)
        target_date.strftime('%d-%B-%Y'),   # 22-December-2025
    ]
    
    # Also try case-insensitive matching
    target_date_strs.extend([s.lower() for s in target_date_strs])
    target_date_strs.extend([s.upper() for s in target_date_strs])
    
    for row in rows:
        cells = row.find_all('td')
        if len(cells) < 5:
            continue
        
        # Parse date from first column
        date_str = cells[0].get_text(strip=True)
        
        # Try to parse the date
        try:
            # USBR format: "28-Dec-2025"
            row_date = datetime.strptime(date_str, '%d-%b-%Y').date()
        except ValueError:
            try:
                # Try without leading zero: "8-Dec-2025"
                row_date = datetime.strptime(date_str, '%-d-%b-%Y').date()
            except ValueError:
                continue
        
        # Check if this row matches our target date
        if row_date == target_date:
            try:
                # Column order: Date, Elevation, Storage, Inflow, Total Release
                data['elevation'] = float(cells[1].get_text(strip=True).replace(',', ''))
                data['content'] = int(cells[2].get_text(strip=True).replace(',', ''))
                data['inflow'] = int(cells[3].get_text(strip=True).replace(',', ''))
                data['outflow'] = int(cells[4].get_text(strip=True).replace(',', ''))
                return data
            except (ValueError, IndexError) as e:
                logger.warning(f"Error parsing row data for {target_date}: {e}")
                continue
    
    # If we didn't find the exact date, raise an error
    if data['elevation'] is None:
        raise ValueError(f"Could not find data for date {target_date} in USBR HTML. Available dates: {[datetime.strptime(row.find_all('td')[0].get_text(strip=True), '%d-%b-%Y').date() for row in rows[:5] if len(row.find_all('td')) >= 1]}")
    
    return data

