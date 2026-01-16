#!/usr/bin/env python3
"""
Test script for CSV collector.
Tests fetching data from USBR dashboard.
"""
import sys
from pathlib import Path
from datetime import date

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from collectors.usbr_csv_collector import fetch_all_water_data, fetch_csv_data, fetch_json_data
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

if __name__ == '__main__':
    print("Testing USBR CSV Collector")
    print("=" * 60)
    
    # Test individual CSV fetches
    print("\n1. Testing individual CSV fetches...")
    storage = fetch_csv_data('Storage')
    print(f"   Storage data: {len(storage) if storage else 0} records")
    
    elevation = fetch_csv_data('Pool Elevation')
    print(f"   Elevation data: {len(elevation) if elevation else 0} records")
    
    # Test JSON fetches
    print("\n2. Testing individual JSON fetches...")
    storage_json = fetch_json_data('Storage')
    print(f"   Storage JSON: {len(storage_json) if storage_json else 0} records")
    
    # Test combined fetch
    print("\n3. Testing combined data fetch...")
    all_data = fetch_all_water_data()
    
    if all_data:
        print(f"   Successfully fetched {len(all_data)} records")
        if all_data:
            dates = [d['date'] for d in all_data]
            print(f"   Date range: {min(dates)} to {max(dates)}")
            print(f"   Sample record: {all_data[0]}")
    else:
        print("   No data fetched - may need to use RISE API or check URL format")
        print("\n   Trying RISE API fallback...")
        all_data = fetch_all_water_data(
            start_date=date(2024, 1, 1),
            end_date=date(2024, 1, 31)
        )
        if all_data:
            print(f"   RISE API: Fetched {len(all_data)} records")
        else:
            print("   RISE API also failed - check API endpoints")






