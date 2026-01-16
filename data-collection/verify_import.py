#!/usr/bin/env python3
"""
Quick verification script to check if historical data was imported.
Shows what data exists in the database.
"""
import sys
from pathlib import Path
from datetime import date

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from utils.database import (
    get_earliest_date,
    get_latest_date,
    get_existing_dates,
    get_water_measurements_by_range
)

HISTORICAL_START_DATE = date(1980, 6, 22)

def main():
    print("=" * 60)
    print("Database Data Verification")
    print("=" * 60)
    print()
    
    earliest = get_earliest_date()
    latest = get_latest_date()
    
    if not earliest or not latest:
        print("❌ NO DATA FOUND IN DATABASE")
        print()
        print("To import historical data, run:")
        print("  cd data-collection")
        print("  ./import_from_csv.sh")
        print()
        print("Or:")
        print("  python migrations/import_csv_historical_data.py")
        return False
    
    print(f"📅 Date Range in Database:")
    print(f"   Earliest: {earliest}")
    print(f"   Latest:   {latest}")
    print()
    
    # Calculate coverage
    total_days = (latest - earliest).days + 1
    existing_dates = get_existing_dates(earliest, latest)
    coverage = len(existing_dates) / total_days if total_days > 0 else 0
    
    print(f"📊 Data Statistics:")
    print(f"   Total days in range: {total_days:,}")
    print(f"   Days with data: {len(existing_dates):,}")
    print(f"   Coverage: {coverage:.1%}")
    print()
    
    # Check if we have historical data
    has_historical = earliest <= HISTORICAL_START_DATE
    if has_historical:
        print(f"✅ Historical data found! Earliest data ({earliest}) is before/at historical start ({HISTORICAL_START_DATE})")
    else:
        print(f"⚠️  Limited historical data. Earliest data ({earliest}) is after historical start ({HISTORICAL_START_DATE})")
        print(f"   You may need to import historical data.")
    print()
    
    # Check recent data
    days_ago = (date.today() - latest).days
    if days_ago <= 7:
        print(f"✅ Recent data is current (latest: {latest}, {days_ago} days ago)")
    elif days_ago <= 30:
        print(f"⚠️  Recent data is {days_ago} days old (latest: {latest})")
    else:
        print(f"❌ Data is outdated (latest: {latest}, {days_ago} days ago)")
    print()
    
    # Sample some data
    print("📈 Sample Data Points:")
    sample_ranges = [
        ("First year", earliest, min(earliest + date.resolution * 365, latest)),
        ("Last year", max(earliest, latest - date.resolution * 365), latest),
    ]
    
    for label, start, end in sample_ranges:
        measurements = get_water_measurements_by_range(start, end)
        if measurements:
            print(f"   {label}: {len(measurements)} points")
            if measurements:
                sample = measurements[0]
                print(f"      Example: {sample['date']} - Elevation: {sample['elevation']:.2f} ft")
    
    print()
    print("=" * 60)
    
    return True


if __name__ == '__main__':
    main()






