"""
Weather data collector.
Fetches weather data from OpenWeatherMap API for Lake Powell area.
"""
import requests
from datetime import date, timedelta
from typing import Dict, List, Optional
import time
import logging
import os

logger = logging.getLogger(__name__)

# OpenWeatherMap API configuration
# Using Page, AZ as the location for Lake Powell area
OWM_API_KEY = os.getenv('WEATHER_API_KEY')
OWM_BASE_URL = "https://api.openweathermap.org/data/2.5"
LATITUDE = 36.9147  # Page, AZ latitude
LONGITUDE = -111.4558  # Page, AZ longitude


def fetch_weather_data(target_date: date) -> Optional[Dict]:
    """
    Fetch weather data for a single date.
    Uses historical weather API if available, otherwise current weather.
    
    Args:
        target_date: Date to fetch weather for
    
    Returns:
        Dictionary with date, high_temp, low_temp, water_temp (if available)
        Returns None if data not available or error occurs
    """
    if not OWM_API_KEY:
        logger.warning("WEATHER_API_KEY not set, skipping weather data collection")
        return None
    
    if target_date > date.today():
        raise ValueError(f"Cannot fetch weather for future date: {target_date}")
    
    max_retries = 3
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            # For historical data, we'd use the historical weather API
            # For now, we'll use current weather and note the limitation
            if target_date == date.today():
                # Current weather
                url = f"{OWM_BASE_URL}/weather"
                params = {
                    'lat': LATITUDE,
                    'lon': LONGITUDE,
                    'appid': OWM_API_KEY,
                    'units': 'imperial'
                }
            else:
                # Historical data - would need One Call API 3.0 subscription
                # For now, return None for historical dates
                logger.warning(f"Historical weather data not available for {target_date}")
                return None
            
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            # Extract temperature data
            result = {
                'date': target_date,
                'high_temp': None,
                'low_temp': None,
                'water_temp': None  # Not available from OpenWeatherMap
            }
            
            if 'main' in data:
                main = data['main']
                # Use temp_max and temp_min if available
                result['high_temp'] = main.get('temp_max') or main.get('temp')
                result['low_temp'] = main.get('temp_min') or main.get('temp')
            
            return result
            
        except requests.exceptions.RequestException as e:
            logger.warning(f"Attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                logger.error(f"Failed to fetch weather data after {max_retries} attempts")
                return None
    
    return None


def fetch_weather_date_range(start_date: date, end_date: date) -> List[Dict]:
    """
    Fetch weather data for a date range.
    
    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
    
    Returns:
        List of weather data dictionaries
    """
    if start_date > end_date:
        raise ValueError("start_date must be <= end_date")
    
    if end_date > date.today():
        raise ValueError(f"Cannot fetch weather for future dates: {end_date}")
    
    results = []
    current_date = start_date
    
    while current_date <= end_date:
        try:
            data = fetch_weather_data(current_date)
            if data:
                results.append(data)
            # Add small delay to avoid rate limiting
            time.sleep(0.5)
        except Exception as e:
            logger.warning(f"Failed to fetch weather data for {current_date}: {e}")
        
        current_date += timedelta(days=1)
    
    return results






