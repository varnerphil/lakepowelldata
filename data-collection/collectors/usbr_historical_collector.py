"""
USBR Historical Data collector.
Fetches data from USBR Historical Data portal.
"""
import requests
from bs4 import BeautifulSoup
from datetime import date, datetime
from typing import Dict, List, Optional
import logging
import time
import re

logger = logging.getLogger(__name__)

USBR_HISTORICAL_BASE = "https://www.usbr.gov/rsvrWater/HistoricalApp.html"


def fetch_historical_data(
    start_date: date,
    end_date: date,
    reservoir: str = "LAKE POWELL",
    data_type: str = "Daily"
) -> Optional[List[Dict]]:
    """
    Fetch historical data from USBR Historical Data portal.
    
    Note: This portal may require form submission. We'll try to parse the response
    or provide instructions for manual download.
    
    Args:
        start_date: Start date
        end_date: End date
        reservoir: Reservoir name (default: LAKE POWELL)
        data_type: Data type - "Daily" or "Monthly"
    
    Returns:
        List of data records or None if fetch fails
    """
    try:
        # The USBR Historical portal uses a form-based interface
        # We'll need to submit a form or parse the page
        url = USBR_HISTORICAL_BASE
        
        # Try to get the form first
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Look for form or data download links
        # This is a complex portal, may need to use Selenium or manual download
        
        logger.warning("USBR Historical portal requires form submission. Manual download recommended.")
        logger.info(f"To download data manually:")
        logger.info(f"  1. Visit: {USBR_HISTORICAL_BASE}")
        logger.info(f"  2. Select Reservoir: {reservoir}")
        logger.info(f"  3. Select Data Type: {data_type}")
        logger.info(f"  4. Set Start Date: {start_date}")
        logger.info(f"  5. Set End Date: {end_date}")
        logger.info(f"  6. Click 'Download Data to Excel'")
        logger.info(f"  7. Save the file and use import_csv_file.py to import it")
        
        return None
        
    except Exception as e:
        logger.error(f"Failed to fetch from USBR Historical portal: {e}")
        return None


def parse_historical_csv(csv_content: str) -> List[Dict]:
    """
    Parse CSV content from USBR Historical Data download.
    
    Args:
        csv_content: CSV file content as string
    
    Returns:
        List of data records
    """
    import csv
    from io import StringIO
    
    results = []
    reader = csv.DictReader(StringIO(csv_content))
    
    for row in reader:
        # USBR CSV format may vary, try common column names
        date_str = row.get('Date') or row.get('DATE') or row.get('date')
        elevation = row.get('Elevation') or row.get('ELEVATION') or row.get('elevation')
        storage = row.get('Storage') or row.get('STORAGE') or row.get('storage') or row.get('Content')
        inflow = row.get('Inflow') or row.get('INFLOW') or row.get('inflow')
        outflow = row.get('Outflow') or row.get('OUTFLOW') or row.get('outflow') or row.get('Release')
        
        if not date_str:
            continue
        
        # Parse date
        try:
            # Try various date formats
            parsed_date = None
            for fmt in ['%Y-%m-%d', '%m/%d/%Y', '%Y/%m/%d', '%d-%b-%Y', '%d-%B-%Y']:
                try:
                    parsed_date = datetime.strptime(date_str.strip(), fmt).date()
                    break
                except ValueError:
                    continue
            
            if not parsed_date:
                continue
            
            # Parse values
            elevation_val = None
            if elevation:
                try:
                    elevation_val = float(str(elevation).replace(',', ''))
                except (ValueError, TypeError):
                    pass
            
            storage_val = 0
            if storage:
                try:
                    storage_val = int(float(str(storage).replace(',', '')))
                except (ValueError, TypeError):
                    pass
            
            inflow_val = 0
            if inflow:
                try:
                    inflow_val = int(float(str(inflow).replace(',', '')))
                except (ValueError, TypeError):
                    pass
            
            outflow_val = 0
            if outflow:
                try:
                    outflow_val = int(float(str(outflow).replace(',', '')))
                except (ValueError, TypeError):
                    pass
            
            if elevation_val is not None:
                results.append({
                    'date': parsed_date,
                    'elevation': elevation_val,
                    'content': storage_val,
                    'inflow': inflow_val,
                    'outflow': outflow_val,
                })
                
        except Exception as e:
            logger.debug(f"Error parsing row: {e}")
            continue
    
    return results






