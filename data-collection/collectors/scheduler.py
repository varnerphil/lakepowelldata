"""
Daily scheduler for data collection.
Orchestrates gap filling and new data collection.
"""
import logging
from datetime import date
from collectors.gap_filler import fill_gaps
from collectors.usbr_collector import fetch_single_date
from collectors.weather_collector import fetch_weather_data
from utils.database import insert_water_measurement, insert_weather_data, get_latest_date

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def run_daily_collection():
    """
    Run daily data collection process:
    1. Check for gaps and fill them
    2. Fetch today's new data
    3. Insert into database
    """
    logger.info("Starting daily data collection")
    
    try:
        # Step 1: Fill any gaps in water data
        logger.info("Checking for gaps in water data...")
        water_gaps_filled = fill_gaps('water')
        logger.info(f"Filled {water_gaps_filled} water data gaps")
        
        # Step 2: Fill any gaps in weather data
        logger.info("Checking for gaps in weather data...")
        weather_gaps_filled = fill_gaps('weather')
        logger.info(f"Filled {weather_gaps_filled} weather data gaps")
        
        # Step 3: Fetch today's data
        today = date.today()
        logger.info(f"Fetching data for {today}")
        
        # Fetch water data
        try:
            water_data = fetch_single_date(today)
            if water_data:
                insert_water_measurement(
                    date=water_data['date'],
                    elevation=water_data['elevation'],
                    content=water_data['content'],
                    inflow=water_data['inflow'],
                    outflow=water_data['outflow'],
                    change=water_data.get('change')  # Include change field if available
                )
                logger.info(f"Inserted water data for {today}")
            else:
                logger.warning(f"No water data available for {today}")
        except Exception as e:
            logger.error(f"Failed to fetch/insert water data for {today}: {e}")
        
        # Fetch weather data
        try:
            weather_data = fetch_weather_data(today)
            if weather_data:
                insert_weather_data(
                    date=weather_data['date'],
                    high_temp=weather_data.get('high_temp'),
                    low_temp=weather_data.get('low_temp'),
                    water_temp=weather_data.get('water_temp')
                )
                logger.info(f"Inserted weather data for {today}")
            else:
                logger.warning(f"No weather data available for {today}")
        except Exception as e:
            logger.error(f"Failed to fetch/insert weather data for {today}: {e}")
        
        logger.info("Daily data collection complete")
        
    except Exception as e:
        logger.error(f"Error in daily data collection: {e}", exc_info=True)
        raise


if __name__ == '__main__':
    run_daily_collection()

