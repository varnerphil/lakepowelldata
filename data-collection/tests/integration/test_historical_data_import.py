"""
Integration tests to verify historical data import.
Tests that data exists in the database and covers the expected date range.
"""
import sys
from pathlib import Path
from datetime import date, timedelta

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from utils.database import (
    get_earliest_date,
    get_latest_date,
    get_water_measurements_by_range,
    get_existing_dates
)


def test_data_exists():
    """Test that we have data in the database."""
    earliest = get_earliest_date()
    latest = get_latest_date()
    
    assert earliest is not None, "No data found in database - earliest date is None"
    assert latest is not None, "No data found in database - latest date is None"
    
    print(f"✓ Data exists: {earliest} to {latest}")
    return earliest, latest


def test_historical_start_date():
    """Test that we have data going back to at least 1980-06-22 (when Lake Powell was filled)."""
    HISTORICAL_START_DATE = date(1980, 6, 22)
    
    earliest = get_earliest_date()
    assert earliest is not None, "No data found in database"
    
    assert earliest <= HISTORICAL_START_DATE, (
        f"Earliest data ({earliest}) is after historical start date ({HISTORICAL_START_DATE}). "
        f"Expected data from at least {HISTORICAL_START_DATE}"
    )
    
    print(f"✓ Historical start date check passed: earliest data is {earliest}")


def test_data_coverage():
    """Test that we have reasonable data coverage (not too many gaps)."""
    earliest = get_earliest_date()
    latest = get_latest_date()
    
    assert earliest is not None and latest is not None, "No data found"
    
    # Get all dates in range
    total_days = (latest - earliest).days + 1
    existing_dates = get_existing_dates(earliest, latest)
    coverage = len(existing_dates) / total_days if total_days > 0 else 0
    
    print(f"  Date range: {earliest} to {latest} ({total_days} days)")
    print(f"  Data points: {len(existing_dates)}")
    print(f"  Coverage: {coverage:.1%}")
    
    # We should have at least 50% coverage (allowing for weekends/holidays when data might not be collected)
    assert coverage >= 0.5, (
        f"Data coverage is too low: {coverage:.1%}. "
        f"Expected at least 50% coverage. Only {len(existing_dates)}/{total_days} dates have data."
    )
    
    print(f"✓ Data coverage check passed: {coverage:.1%}")


def test_recent_data():
    """Test that we have recent data (within last 30 days)."""
    latest = get_latest_date()
    assert latest is not None, "No data found"
    
    days_ago = (date.today() - latest).days
    assert days_ago <= 30, (
        f"Latest data is {days_ago} days old (date: {latest}). "
        f"Expected data within last 30 days."
    )
    
    print(f"✓ Recent data check passed: latest data is {days_ago} days old ({latest})")


def test_data_quality():
    """Test that data has reasonable values."""
    earliest = get_earliest_date()
    latest = get_latest_date()
    
    assert earliest is not None and latest is not None, "No data found"
    
    # Get a sample of data
    sample_start = max(earliest, latest - timedelta(days=365))  # Last year or all if less
    measurements = get_water_measurements_by_range(sample_start, latest)
    
    assert len(measurements) > 0, "No measurements found in sample range"
    
    # Check that elevation values are reasonable (Lake Powell elevation range)
    elevations = [m['elevation'] for m in measurements]
    min_elevation = min(elevations)
    max_elevation = max(elevations)
    
    # Lake Powell elevation should be between ~3200 (deadpool) and ~3700 (full pool)
    assert 3000 <= min_elevation <= 3800, (
        f"Minimum elevation ({min_elevation}) is outside reasonable range (3000-3800 ft)"
    )
    assert 3000 <= max_elevation <= 3800, (
        f"Maximum elevation ({max_elevation}) is outside reasonable range (3000-3800 ft)"
    )
    
    print(f"✓ Data quality check passed: elevation range {min_elevation:.1f} - {max_elevation:.1f} ft")


def test_specific_date_ranges():
    """Test that we can retrieve data for specific important date ranges."""
    test_ranges = [
        (date(1980, 6, 22), date(1980, 12, 31), "1980 (first year)"),
        (date(2000, 1, 1), date(2000, 12, 31), "2000"),
        (date(2020, 1, 1), date(2020, 12, 31), "2020"),
        (date.today() - timedelta(days=365), date.today(), "Last year"),
    ]
    
    for start, end, label in test_ranges:
        measurements = get_water_measurements_by_range(start, end)
        if measurements:
            print(f"✓ {label}: {len(measurements)} data points")
        else:
            print(f"⚠ {label}: No data found (may be expected if outside data range)")


def run_all_tests():
    """Run all tests and report results."""
    print("=" * 60)
    print("Historical Data Import Verification Tests")
    print("=" * 60)
    print()
    
    tests = [
        ("Data Exists", test_data_exists),
        ("Historical Start Date", test_historical_start_date),
        ("Data Coverage", test_data_coverage),
        ("Recent Data", test_recent_data),
        ("Data Quality", test_data_quality),
        ("Specific Date Ranges", test_specific_date_ranges),
    ]
    
    passed = 0
    failed = 0
    
    for test_name, test_func in tests:
        try:
            print(f"\nRunning: {test_name}")
            test_func()
            passed += 1
        except AssertionError as e:
            print(f"✗ FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"✗ ERROR: {e}")
            failed += 1
    
    print("\n" + "=" * 60)
    print(f"Test Results: {passed} passed, {failed} failed")
    print("=" * 60)
    
    return failed == 0


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)






