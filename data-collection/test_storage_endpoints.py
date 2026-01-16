#!/usr/bin/env python3
"""
Test script to compare storage/content values from different USBR API endpoints.
This helps identify which endpoint returns the correct values.
"""
import sys
import os
from datetime import date, datetime
import requests
import json

# Add parent directory to path to import collectors
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from collectors.usbr_csv_collector import (
    fetch_rise_api_download,
    fetch_rise_api_data_by_catalog,
    LAKE_POWELL_CATALOG_ITEMS,
    LAKE_POWELL_PARAMETER_IDS,
    parse_download_data_by_parameter,
    parse_date
)

def test_download_endpoint(test_date: date):
    """Test the download endpoint (itemId 4276) for storage."""
    print(f"\n{'='*60}")
    print(f"Testing DOWNLOAD ENDPOINT (itemId 4276)")
    print(f"{'='*60}")
    
    start_date = date(test_date.year, test_date.month, test_date.day)
    end_date = date(test_date.year, test_date.month, test_date.day)
    
    try:
        storage_data = fetch_rise_api_download(
            LAKE_POWELL_CATALOG_ITEMS['storage_download'],  # itemId 4276
            start_date,
            end_date
        )
        
        if storage_data:
            print(f"✓ Successfully fetched {len(storage_data)} records")
            
            # Parse the data
            content_data = parse_download_data_by_parameter(
                storage_data,
                parameter_id=None,
                field_name='content',
                value_validator=lambda v: v > 100000
            )
            
            if content_data:
                print(f"\nContent values from download endpoint:")
                for d, v in sorted(content_data.items()):
                    print(f"  {d}: {v:,.0f} acre-feet ({v/1000000:.2f}M)")
                return content_data
            else:
                print("✗ No content data parsed from download endpoint")
                print(f"  Raw data sample (first 3 records):")
                for i, record in enumerate(storage_data[:3]):
                    print(f"    {i+1}: {json.dumps(record, indent=2, default=str)}")
        else:
            print("✗ No data returned from download endpoint")
            
    except Exception as e:
        print(f"✗ Error fetching from download endpoint: {e}")
        import traceback
        traceback.print_exc()
    
    return None


def test_catalog_api(test_date: date):
    """Test the catalog API (itemId 508 with parameterId 3) for storage."""
    print(f"\n{'='*60}")
    print(f"Testing CATALOG API (itemId 508, parameterId 3)")
    print(f"{'='*60}")
    
    start_date = date(test_date.year, test_date.month, test_date.day)
    end_date = date(test_date.year, test_date.month, test_date.day)
    
    try:
        # Try with itemId 508 (elevation catalog item) and parameterId 3
        content_data_508 = fetch_rise_api_data_by_catalog(
            LAKE_POWELL_CATALOG_ITEMS['elevation'],  # itemId 508
            start_date,
            end_date,
            parameter_id=LAKE_POWELL_PARAMETER_IDS['content']  # parameterId 3
        )
        
        if content_data_508:
            print(f"✓ Successfully fetched {len(content_data_508)} records from itemId 508")
            print(f"\nContent values from catalog API (itemId 508, parameterId 3):")
            for record in content_data_508:
                attrs = record.get('attributes', {})
                result = attrs.get('result')
                date_str = attrs.get('dateTime', '')
                param_id = attrs.get('parameterId')
                if result:
                    try:
                        val = float(result)
                        parsed_date = parse_date(date_str)
                        if parsed_date:
                            print(f"  {parsed_date}: {val:,.0f} acre-feet ({val/1000000:.2f}M) [parameterId={param_id}]")
                    except:
                        pass
        else:
            print("✗ No data returned from catalog API (itemId 508, parameterId 3)")
        
        # Also try with itemId 4276 (storage catalog item) if it exists
        print(f"\n{'='*60}")
        print(f"Testing CATALOG API (itemId 4276 - storage catalog item)")
        print(f"{'='*60}")
        
        content_data_4276 = fetch_rise_api_data_by_catalog(
            LAKE_POWELL_CATALOG_ITEMS['storage_download'],  # itemId 4276
            start_date,
            end_date,
            parameter_id=None  # Try without parameterId filter
        )
        
        if content_data_4276:
            print(f"✓ Successfully fetched {len(content_data_4276)} records from itemId 4276")
            print(f"\nContent values from catalog API (itemId 4276):")
            for record in content_data_4276:
                attrs = record.get('attributes', {})
                result = attrs.get('result')
                date_str = attrs.get('dateTime', '')
                param_id = attrs.get('parameterId')
                if result:
                    try:
                        val = float(result)
                        parsed_date = parse_date(date_str)
                        if parsed_date:
                            print(f"  {parsed_date}: {val:,.0f} acre-feet ({val/1000000:.2f}M) [parameterId={param_id}]")
                    except:
                        pass
        else:
            print("✗ No data returned from catalog API (itemId 4276)")
            
    except Exception as e:
        print(f"✗ Error fetching from catalog API: {e}")
        import traceback
        traceback.print_exc()
    
    return None


def test_direct_api_call(test_date: date):
    """Test direct API call to see raw response."""
    print(f"\n{'='*60}")
    print(f"Testing DIRECT API CALL (download endpoint)")
    print(f"{'='*60}")
    
    start_date_str = test_date.strftime('%Y-%m-%d')
    end_date_str = test_date.strftime('%Y-%m-%d')
    
    url = f"https://data.usbr.gov/rise/api/result/download?itemId=4276&locationId=1533&startDate={start_date_str}&endDate={end_date_str}"
    
    print(f"URL: {url}")
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        
        print(f"✓ Successfully fetched data")
        print(f"Response type: {type(data)}")
        
        if isinstance(data, list):
            print(f"  List with {len(data)} records")
            if len(data) > 0:
                print(f"\nFirst record:")
                print(json.dumps(data[0], indent=2, default=str))
                # Look for records matching our test date
                test_date_str = test_date.strftime('%Y-%m-%d')
                matching = [r for r in data if test_date_str in str(r)]
                if matching:
                    print(f"\nRecords matching {test_date_str}:")
                    for i, record in enumerate(matching[:3]):
                        print(f"  Record {i+1}:")
                        print(json.dumps(record, indent=2, default=str))
        elif isinstance(data, dict):
            print(f"  Dictionary with keys: {list(data.keys())}")
            if 'Results' in data:
                results = data['Results']
                print(f"  Results: {len(results) if isinstance(results, list) else 'not a list'}")
                if isinstance(results, list) and len(results) > 0:
                    print(f"\nFirst result:")
                    print(json.dumps(results[0], indent=2, default=str))
            else:
                print(f"\nSample data:")
                print(json.dumps(dict(list(data.items())[:3]), indent=2, default=str))
        
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()


def main():
    """Main test function."""
    print("="*60)
    print("USBR Storage Endpoint Comparison Test")
    print("="*60)
    
    # Test dates from user's data
    test_dates = [
        date(2026, 1, 6),
        date(2026, 1, 7),
    ]
    
    expected_values = {
        date(2026, 1, 6): 6_408_708,
        date(2026, 1, 7): 6_397_414,
    }
    
    for test_date in test_dates:
        print(f"\n\n{'#'*60}")
        print(f"TESTING DATE: {test_date}")
        print(f"Expected value: {expected_values.get(test_date, 'unknown'):,} acre-feet")
        print(f"{'#'*60}")
        
        # Test download endpoint
        download_values = test_download_endpoint(test_date)
        
        # Test catalog API
        catalog_values = test_catalog_api(test_date)
        
        # Test direct API call
        test_direct_api_call(test_date)
        
        # Compare
        if download_values and test_date in download_values:
            our_value = download_values[test_date]
            expected = expected_values.get(test_date)
            if expected:
                diff = our_value - expected
                percent_diff = (diff / expected) * 100
                print(f"\n{'='*60}")
                print(f"COMPARISON for {test_date}:")
                print(f"  Expected: {expected:,} acre-feet")
                print(f"  Our value: {our_value:,} acre-feet")
                print(f"  Difference: {diff:,} acre-feet ({percent_diff:+.2f}%)")
                if abs(percent_diff) > 1:
                    print(f"  ⚠️  SIGNIFICANT DIFFERENCE DETECTED!")
                else:
                    print(f"  ✓ Values match closely")
                print(f"{'='*60}")


if __name__ == '__main__':
    main()

