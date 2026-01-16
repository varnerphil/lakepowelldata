"""
Database utility functions for connecting to and operating on PostgreSQL database.
"""
import os
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from psycopg2 import sql
from datetime import date, datetime
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

load_dotenv()


def get_db_connection():
    """Get database connection using DATABASE_URL from environment."""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is not set")
    
    return psycopg2.connect(database_url)


def insert_water_measurement(
    date: date,
    elevation: float,
    content: int,
    inflow: int,
    outflow: int,
    change: Optional[float] = None,
    update_existing: bool = True
) -> None:
    """
    Insert or update a water measurement record.
    
    Args:
        date: Measurement date
        elevation: Water elevation in feet
        content: Water content in acre-feet
        inflow: Inflow in cubic feet per second
        outflow: Outflow in cubic feet per second
        change: Change in elevation from previous day (feet), None for first record
        update_existing: If True, update existing records; if False, skip existing
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if update_existing:
                cur.execute(
                    """
                    INSERT INTO water_measurements (date, elevation, change, content, inflow, outflow)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (date) DO UPDATE
                    SET elevation = EXCLUDED.elevation,
                        change = EXCLUDED.change,
                        content = EXCLUDED.content,
                        inflow = EXCLUDED.inflow,
                        outflow = EXCLUDED.outflow,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (date, elevation, change, content, inflow, outflow)
                )
            else:
                cur.execute(
                    """
                    INSERT INTO water_measurements (date, elevation, change, content, inflow, outflow)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (date) DO NOTHING
                    """,
                    (date, elevation, change, content, inflow, outflow)
                )
        conn.commit()
    finally:
        conn.close()


def get_latest_date() -> Optional[date]:
    """
    Get the most recent date in water_measurements table.
    
    Returns:
        Most recent date or None if table is empty
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT MAX(date) as latest_date FROM water_measurements"
            )
            result = cur.fetchone()
            return result[0] if result and result[0] else None
    finally:
        conn.close()


def get_existing_dates(start_date: date, end_date: date) -> set[date]:
    """
    Get set of dates that already exist in water_measurements table within a range.
    
    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
    
    Returns:
        Set of dates that already exist in the database
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT date FROM water_measurements
                WHERE date >= %s AND date <= %s
                """,
                (start_date, end_date)
            )
            results = cur.fetchall()
            return {row[0] for row in results}
    finally:
        conn.close()


def get_earliest_date() -> Optional[date]:
    """
    Get the earliest date in water_measurements table.
    
    Returns:
        Earliest date or None if table is empty
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT MIN(date) as earliest_date FROM water_measurements"
            )
            result = cur.fetchone()
            return result[0] if result and result[0] else None
    finally:
        conn.close()


def get_water_measurements_by_range(
    start_date: date,
    end_date: date
) -> List[Dict[str, Any]]:
    """
    Get water measurements within a date range.
    
    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
    
    Returns:
        List of measurement records as dictionaries
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT date, elevation, change, content, inflow, outflow
                FROM water_measurements
                WHERE date >= %s AND date <= %s
                ORDER BY date ASC
                """,
                (start_date, end_date)
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def insert_weather_data(
    date: date,
    high_temp: Optional[float],
    low_temp: Optional[float],
    water_temp: Optional[float]
) -> None:
    """
    Insert weather data record.
    Uses ON CONFLICT DO NOTHING to prevent duplicates.
    
    Args:
        date: Measurement date
        high_temp: High temperature in Fahrenheit
        low_temp: Low temperature in Fahrenheit
        water_temp: Water temperature in Fahrenheit (optional)
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO weather_data (date, high_temp, low_temp, water_temp)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (date) DO NOTHING
                """,
                (date, high_temp, low_temp, water_temp)
            )
        conn.commit()
    finally:
        conn.close()


def bulk_insert_water_measurements(
    measurements: List[Dict[str, Any]],
    update_existing: bool = True
) -> tuple[int, int]:
    """
    Bulk insert water measurement records using execute_values for efficiency.
    
    Args:
        measurements: List of dictionaries with keys: date, elevation, content, inflow, outflow, change
        update_existing: If True, update existing records; if False, skip existing
    
    Returns:
        Tuple of (inserted_count, updated_count)
    """
    if not measurements:
        return (0, 0)
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Prepare data tuples
            values = [
                (
                    m['date'],
                    m['elevation'],
                    m.get('change'),
                    m['content'],
                    m.get('inflow', 0),
                    m.get('outflow', 0)
                )
                for m in measurements
            ]
            
            if update_existing:
                # Use execute_values with ON CONFLICT DO UPDATE
                execute_values(
                    cur,
                    """
                    INSERT INTO water_measurements (date, elevation, change, content, inflow, outflow)
                    VALUES %s
                    ON CONFLICT (date) DO UPDATE
                    SET elevation = EXCLUDED.elevation,
                        change = EXCLUDED.change,
                        content = EXCLUDED.content,
                        inflow = EXCLUDED.inflow,
                        outflow = EXCLUDED.outflow,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    values,
                    template=None,
                    page_size=1000
                )
                # Count updates vs inserts (approximate - all will be processed)
                inserted_count = len(measurements)
                updated_count = 0  # We can't easily distinguish in bulk operation
            else:
                # Use execute_values with ON CONFLICT DO NOTHING
                execute_values(
                    cur,
                    """
                    INSERT INTO water_measurements (date, elevation, change, content, inflow, outflow)
                    VALUES %s
                    ON CONFLICT (date) DO NOTHING
                    """,
                    values,
                    template=None,
                    page_size=1000
                )
                inserted_count = cur.rowcount
                updated_count = 0
            
        conn.commit()
        return (inserted_count, updated_count)
    finally:
        conn.close()


def clear_water_measurements() -> int:
    """
    Clear all records from the water_measurements table.
    
    Returns:
        Number of records deleted
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM water_measurements")
            count_before = cur.fetchone()[0]
            
            cur.execute("TRUNCATE TABLE water_measurements RESTART IDENTITY CASCADE")
            conn.commit()
            
            return count_before
    finally:
        conn.close()


def get_ramps() -> List[Dict[str, Any]]:
    """
    Get all ramp definitions.
    
    Returns:
        List of ramp records as dictionaries
    """
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, name, min_safe_elevation, min_usable_elevation, location
                FROM ramps
                ORDER BY name
                """
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def insert_ramp(
    name: str,
    min_safe_elevation: float,
    min_usable_elevation: float,
    location: Optional[str] = None
) -> int:
    """
    Insert a ramp definition.
    
    Args:
        name: Ramp name
        min_safe_elevation: Minimum safe elevation in feet
        min_usable_elevation: Minimum usable elevation in feet
        location: Ramp location (optional)
    
    Returns:
        ID of inserted ramp
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ramps (name, min_safe_elevation, min_usable_elevation, location)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (name) DO UPDATE
                SET min_safe_elevation = EXCLUDED.min_safe_elevation,
                    min_usable_elevation = EXCLUDED.min_usable_elevation,
                    location = EXCLUDED.location
                RETURNING id
                """,
                (name, min_safe_elevation, min_usable_elevation, location)
            )
            result = cur.fetchone()
            conn.commit()
            return result[0] if result else None
    finally:
        conn.close()


def bulk_insert_basin_plots_data(
    data: List[Dict[str, Any]],
    update_existing: bool = True
) -> int:
    """
    Bulk insert basin plots data records using execute_values for efficiency.
    
    Args:
        data: List of dictionaries with keys: date_str, water_year_date, year, swe_value,
              percentile_10, percentile_30, percentile_70, percentile_90, min_value,
              median_91_20, median_por, max_value, median_peak_swe
        update_existing: If True, update existing records; if False, skip existing
    
    Returns:
        Number of records inserted/updated
    """
    if not data:
        return 0
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Prepare data tuples
            values = [
                (
                    m['date_str'],
                    m['water_year_date'],
                    m['year'],
                    m.get('swe_value'),
                    m.get('percentile_10'),
                    m.get('percentile_30'),
                    m.get('percentile_70'),
                    m.get('percentile_90'),
                    m.get('min_value'),
                    m.get('median_91_20'),
                    m.get('median_por'),
                    m.get('max_value'),
                    m.get('median_peak_swe'),
                )
                for m in data
            ]
            
            if update_existing:
                # Use execute_values with ON CONFLICT DO UPDATE
                execute_values(
                    cur,
                    """
                    INSERT INTO basin_plots_data (
                        date_str, water_year_date, year, swe_value,
                        percentile_10, percentile_30, percentile_70, percentile_90,
                        min_value, median_91_20, median_por, max_value, median_peak_swe
                    )
                    VALUES %s
                    ON CONFLICT (water_year_date, year) DO UPDATE
                    SET date_str = EXCLUDED.date_str,
                        swe_value = EXCLUDED.swe_value,
                        percentile_10 = EXCLUDED.percentile_10,
                        percentile_30 = EXCLUDED.percentile_30,
                        percentile_70 = EXCLUDED.percentile_70,
                        percentile_90 = EXCLUDED.percentile_90,
                        min_value = EXCLUDED.min_value,
                        median_91_20 = EXCLUDED.median_91_20,
                        median_por = EXCLUDED.median_por,
                        max_value = EXCLUDED.max_value,
                        median_peak_swe = EXCLUDED.median_peak_swe,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    values,
                    template=None,
                    page_size=1000
                )
            else:
                # Use execute_values with ON CONFLICT DO NOTHING
                execute_values(
                    cur,
                    """
                    INSERT INTO basin_plots_data (
                        date_str, water_year_date, year, swe_value,
                        percentile_10, percentile_30, percentile_70, percentile_90,
                        min_value, median_91_20, median_por, max_value, median_peak_swe
                    )
                    VALUES %s
                    ON CONFLICT (water_year_date, year) DO NOTHING
                    """,
                    values,
                    template=None,
                    page_size=1000
                )
            
            inserted_count = cur.rowcount
            
        conn.commit()
        return inserted_count
    finally:
        conn.close()


def bulk_upsert_snotel_sites(
    sites: List[Dict[str, Any]],
    update_existing: bool = True
) -> int:
    """
    Bulk insert or update SNOTEL sites.
    
    Args:
        sites: List of dictionaries with keys: site_id, name, elevation, basin, state, latitude, longitude
        update_existing: If True, update existing records; if False, skip existing
    
    Returns:
        Number of records inserted/updated
    """
    if not sites:
        return 0
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            values = [
                (
                    s['site_id'],
                    s['name'],
                    s.get('elevation'),
                    s.get('basin'),
                    s.get('state'),
                    s.get('latitude'),
                    s.get('longitude'),
                )
                for s in sites
            ]
            
            if update_existing:
                execute_values(
                    cur,
                    """
                    INSERT INTO snotel_sites (
                        site_id, name, elevation, basin, state, latitude, longitude
                    )
                    VALUES %s
                    ON CONFLICT (site_id) DO UPDATE
                    SET name = EXCLUDED.name,
                        elevation = EXCLUDED.elevation,
                        basin = EXCLUDED.basin,
                        state = EXCLUDED.state,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    values,
                    template=None,
                    page_size=1000
                )
            else:
                execute_values(
                    cur,
                    """
                    INSERT INTO snotel_sites (
                        site_id, name, elevation, basin, state, latitude, longitude
                    )
                    VALUES %s
                    ON CONFLICT (site_id) DO NOTHING
                    """,
                    values,
                    template=None,
                    page_size=1000
                )
            
            conn.commit()
            return cur.rowcount
    finally:
        conn.close()


def bulk_upsert_snotel_measurements(
    measurements: List[Dict[str, Any]],
    update_existing: bool = True
) -> int:
    """
    Bulk insert or update SNOTEL measurements.
    
    Args:
        measurements: List of dictionaries with keys: site_id, date, snow_water_equivalent,
                     snow_depth, precipitation, temperature_max, temperature_min, temperature_avg
        update_existing: If True, update existing records; if False, skip existing
    
    Returns:
        Number of records inserted/updated
    """
    if not measurements:
        return 0
    
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            values = [
                (
                    m['site_id'],
                    m['date'],
                    m.get('snow_water_equivalent'),
                    m.get('snow_depth'),
                    m.get('precipitation'),
                    m.get('temperature_max'),
                    m.get('temperature_min'),
                    m.get('temperature_avg'),
                )
                for m in measurements
            ]
            
            if update_existing:
                execute_values(
                    cur,
                    """
                    INSERT INTO snotel_measurements (
                        site_id, date, snow_water_equivalent, snow_depth, precipitation,
                        temperature_max, temperature_min, temperature_avg
                    )
                    VALUES %s
                    ON CONFLICT (site_id, date) DO UPDATE
                    SET snow_water_equivalent = EXCLUDED.snow_water_equivalent,
                        snow_depth = EXCLUDED.snow_depth,
                        precipitation = EXCLUDED.precipitation,
                        temperature_max = EXCLUDED.temperature_max,
                        temperature_min = EXCLUDED.temperature_min,
                        temperature_avg = EXCLUDED.temperature_avg,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    values,
                    template=None,
                    page_size=1000
                )
            else:
                execute_values(
                    cur,
                    """
                    INSERT INTO snotel_measurements (
                        site_id, date, snow_water_equivalent, snow_depth, precipitation,
                        temperature_max, temperature_min, temperature_avg
                    )
                    VALUES %s
                    ON CONFLICT (site_id, date) DO NOTHING
                    """,
                    values,
                    template=None,
                    page_size=1000
                )
            
            conn.commit()
            return cur.rowcount
    finally:
        conn.close()

