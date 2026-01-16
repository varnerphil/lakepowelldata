"""
Unit tests for weather collector.
Following TDD: Write tests first, then implement to make tests pass.
"""
import pytest
from datetime import date
from unittest.mock import Mock, patch
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from collectors.weather_collector import (
    fetch_weather_data,
    fetch_weather_date_range,
)


class TestFetchWeatherData:
    """Test: fetch_weather_data returns correct data structure"""
    
    def test_fetch_weather_data_returns_valid_structure(self):
        # Given: A valid date
        test_date = date(2025, 12, 28)
        # When: fetch_weather_data is called
        # Then: Returns dict with date, high_temp, low_temp, water_temp
        pass
    
    def test_fetch_weather_data_handles_invalid_date(self):
        # Given: An invalid date (future date)
        future_date = date(2030, 1, 1)
        # When: fetch_weather_data is called
        # Then: Raises appropriate exception or returns None
        pass


class TestFetchWeatherDateRange:
    """Test: fetch_weather_date_range returns array of records"""
    
    def test_fetch_weather_date_range_returns_array(self):
        # Given: Start and end dates
        start_date = date(2025, 12, 1)
        end_date = date(2025, 12, 7)
        # When: fetch_weather_date_range is called
        # Then: Returns list of weather records for each date in range
        pass
    
    def test_fetch_weather_date_range_handles_no_data(self):
        # Given: Date range with no available data
        start_date = date(1900, 1, 1)
        end_date = date(1900, 1, 7)
        # When: fetch_weather_date_range is called
        # Then: Returns empty list or handles gracefully
        pass


class TestErrorHandling:
    """Test: handles API errors with retry"""
    
    def test_handles_api_errors(self):
        # Given: API failure
        # When: fetch_weather_data is called
        # Then: Retries up to 3 times, then raises exception
        pass






