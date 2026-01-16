"""
Historical data migration script.
Imports all available historical data from source websites.
"""
import sys
from pathlib import Path
from datetime import date, timedelta
import logging
import time

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from collectors.usbr_collector import fetch_date_range, fetch_single_date
from collectors.weather_collector import fetch_weather_date_range
from utils.database import (
    insert_water_measurement, 
    insert_weather_data,
    get_existing_dates,
    get_earliest_date,
    get_latest_date
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Historical data start date (when Lake Powell was filled)
# Lake Powell began filling in 1963, but consistent daily data starts around 1980
HISTORICAL_START_DATE = date(1980, 6, 22)


def import_historical_data(
    start_date: date = None,
    end_date: date = None,
    skip_existing: bool = True,
    chunk_size_days: int = 30
):
    """
    Import historical data from start date to end date.
    
    Args:
        start_date: Start date for import (defaults to HISTORICAL_START_DATE)
        end_date: End date for import (defaults to today)
        skip_existing: If True, skip dates that already exist in database
        chunk_size_days: Number of days to process in each chunk
    """
    if start_date is None:
        start_date = HISTORICAL_START_DATE
    if end_date is None:
        end_date = date.today()
    
    logger.info(f"Starting historical data import from {start_date} to {end_date}")
    
    # Check what data already exists
    if skip_existing:
        existing_dates = get_existing_dates(start_date, end_date)
        logger.info(f"Found {len(existing_dates)} existing dates in database")
    else:
        existing_dates = set()
    
    current_start = start_date
    total_water_inserted = 0
    total_water_skipped = 0
    total_water_failed = 0
    total_weather_inserted = 0
    total_weather_skipped = 0
    
    start_time = time.time()
    total_days = (end_date - start_date).days + 1
    processed_days = 0
    
    while current_start <= end_date:
        current_end = min(current_start + timedelta(days=chunk_size_days - 1), end_date)
        
        # Calculate progress
        chunk_days = (current_end - current_start).days + 1
        processed_days += chunk_days
        progress_pct = (processed_days / total_days) * 100
        
        logger.info(f"Processing chunk: {current_start} to {current_end} ({progress_pct:.1f}% complete)")
        
        # Import water data
        chunk_water_inserted = 0
        chunk_water_failed = 0
        
        try:
            # Fetch data for this chunk
            water_data = fetch_date_range(current_start, current_end)
            
            for data in water_data:
                data_date = data['date']
                
                # Skip if already exists
                if skip_existing and data_date in existing_dates:
                    total_water_skipped += 1
                    continue
                
                try:
                    insert_water_measurement(
                        date=data_date,
                        elevation=data['elevation'],
                        content=data['content'],
                        inflow=data['inflow'],
                        outflow=data['outflow'],
                        change=data.get('change')  # Include change field if available
                    )
                    total_water_inserted += 1
                    chunk_water_inserted += 1
                    if skip_existing:
                        existing_dates.add(data_date)
                except Exception as e:
                    logger.warning(f"Failed to insert water data for {data_date}: {e}")
                    total_water_failed += 1
                    chunk_water_failed += 1
            
            logger.info(f"  Water: {chunk_water_inserted} inserted, {chunk_water_failed} failed")
            
        except Exception as e:
            logger.error(f"Failed to fetch water data for chunk {current_start} to {current_end}: {e}")
            # Try fetching dates individually as fallback
            logger.info(f"Attempting individual date fetches for chunk...")
            for single_date in [current_start + timedelta(days=i) for i in range(chunk_days)]:
                if single_date > current_end:
                    break
                if skip_existing and single_date in existing_dates:
                    continue
                try:
                    data = fetch_single_date(single_date)
                    if data:
                        insert_water_measurement(
                            date=data['date'],
                            elevation=data['elevation'],
                            content=data['content'],
                            inflow=data['inflow'],
                            outflow=data['outflow']
                        )
                        total_water_inserted += 1
                        if skip_existing:
                            existing_dates.add(data['date'])
                    time.sleep(0.5)  # Rate limiting
                except Exception as e2:
                    logger.debug(f"Failed to fetch {single_date}: {e2}")
                    total_water_failed += 1
        
        # Import weather data (optional, may not be available for historical dates)
        try:
            weather_data = fetch_weather_date_range(current_start, current_end)
            for data in weather_data:
                if data:  # Weather data may be None for historical dates
                    data_date = data['date']
                    if skip_existing:
                        # Check if weather data exists (we'd need a separate function for this)
                        # For now, just try to insert and let ON CONFLICT handle it
                        pass
                    try:
                        insert_weather_data(
                            date=data_date,
                            high_temp=data.get('high_temp'),
                            low_temp=data.get('low_temp'),
                            water_temp=data.get('water_temp')
                        )
                        total_weather_inserted += 1
                    except Exception as e:
                        logger.debug(f"Failed to insert weather data for {data_date}: {e}")
                        total_weather_skipped += 1
        except Exception as e:
            logger.debug(f"Failed to fetch weather data for chunk {current_start} to {current_end}: {e}")
        
        current_start = current_end + timedelta(days=1)
        
        # Add delay between chunks to avoid rate limiting
        time.sleep(1)
    
    elapsed_time = time.time() - start_time
    logger.info("=" * 60)
    logger.info(f"Historical import complete!")
    logger.info(f"  Water records inserted: {total_water_inserted}")
    logger.info(f"  Water records skipped (existing): {total_water_skipped}")
    logger.info(f"  Water records failed: {total_water_failed}")
    logger.info(f"  Weather records inserted: {total_weather_inserted}")
    logger.info(f"  Total time: {elapsed_time:.1f} seconds")
    logger.info("=" * 60)


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Import historical Lake Powell water data')
    parser.add_argument(
        '--start-date',
        type=str,
        help='Start date (YYYY-MM-DD). Defaults to historical start date (1980-06-22)'
    )
    parser.add_argument(
        '--end-date',
        type=str,
        help='End date (YYYY-MM-DD). Defaults to today'
    )
    parser.add_argument(
        '--no-skip-existing',
        action='store_true',
        help='Import all dates even if they already exist (will update existing records)'
    )
    parser.add_argument(
        '--chunk-size',
        type=int,
        default=30,
        help='Number of days to process in each chunk (default: 30)'
    )
    
    args = parser.parse_args()
    
    start_date = None
    if args.start_date:
        start_date = date.fromisoformat(args.start_date)
    
    end_date = None
    if args.end_date:
        end_date = date.fromisoformat(args.end_date)
    
    import_historical_data(
        start_date=start_date,
        end_date=end_date,
        skip_existing=not args.no_skip_existing,
        chunk_size_days=args.chunk_size
    )

