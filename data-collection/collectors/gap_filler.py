"""
Gap filler: Detects and fills missing data between our database and data sources.
"""
from datetime import date, timedelta
from typing import List
import logging
from utils.database import get_latest_date, insert_water_measurement, insert_weather_data
from collectors.usbr_collector import fetch_date_range as fetch_usbr_date_range
from collectors.weather_collector import fetch_weather_date_range

logger = logging.getLogger(__name__)


def detect_gaps(db_latest: date, source_latest: date) -> List[date]:
    """
    Detect missing dates between database latest and source latest.
    
    Args:
        db_latest: Latest date in our database (or None if empty)
        source_latest: Latest date available from source
    
    Returns:
        List of missing dates (inclusive range from db_latest+1 to source_latest)
    """
    if db_latest is None:
        # Database is empty, all dates up to source_latest are "missing"
        # But we'll return empty and let migration handle initial import
        return []
    
    if db_latest >= source_latest:
        # Database is up to date or ahead (shouldn't happen, but handle gracefully)
        return []
    
    # Generate list of missing dates
    missing_dates = []
    current_date = db_latest + timedelta(days=1)
    
    while current_date <= source_latest:
        missing_dates.append(current_date)
        current_date += timedelta(days=1)
    
    return missing_dates


def fill_gaps(data_type: str = 'water') -> int:
    """
    Fill gaps in database by fetching missing data from sources.
    
    Args:
        data_type: Type of data to fill ('water' or 'weather')
    
    Returns:
        Number of records inserted
    """
    # Get latest date in our database
    db_latest = get_latest_date()
    
    # For now, assume source latest is today (in production, would check source)
    source_latest = date.today()
    
    # Detect gaps
    missing_dates = detect_gaps(db_latest, source_latest)
    
    if not missing_dates:
        logger.info("No gaps detected, database is up to date")
        return 0
    
    logger.info(f"Detected {len(missing_dates)} missing dates: {missing_dates[0]} to {missing_dates[-1]}")
    
    inserted_count = 0
    
    if data_type == 'water':
        # Fetch water data for missing dates
        start_date = missing_dates[0]
        end_date = missing_dates[-1]
        
        try:
            water_data = fetch_usbr_date_range(start_date, end_date)
            
            for data in water_data:
                try:
                    insert_water_measurement(
                        date=data['date'],
                        elevation=data['elevation'],
                        content=data['content'],
                        inflow=data['inflow'],
                        outflow=data['outflow'],
                        change=data.get('change')  # Include change field if available
                    )
                    inserted_count += 1
                    logger.info(f"Inserted water data for {data['date']}")
                except Exception as e:
                    logger.warning(f"Failed to insert water data for {data['date']}: {e}")
        
        except Exception as e:
            logger.error(f"Failed to fetch water data for gap filling: {e}")
    
    elif data_type == 'weather':
        # Fetch weather data for missing dates
        start_date = missing_dates[0]
        end_date = missing_dates[-1]
        
        try:
            weather_data = fetch_weather_date_range(start_date, end_date)
            
            for data in weather_data:
                try:
                    insert_weather_data(
                        date=data['date'],
                        high_temp=data.get('high_temp'),
                        low_temp=data.get('low_temp'),
                        water_temp=data.get('water_temp')
                    )
                    inserted_count += 1
                    logger.info(f"Inserted weather data for {data['date']}")
                except Exception as e:
                    logger.warning(f"Failed to insert weather data for {data['date']}: {e}")
        
        except Exception as e:
            logger.error(f"Failed to fetch weather data for gap filling: {e}")
    
    logger.info(f"Gap filling complete: {inserted_count} records inserted")
    return inserted_count

