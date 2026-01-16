"""
Calculate Water Year Cycle Analysis

This script analyzes each water year to find:
1. Pre-runoff low (lowest point before spring rise)
2. Runoff start (when sustained rise begins)
3. Peak elevation and date
4. Correlation with snowpack data

Populates the water_year_analysis table.
"""
import sys
from pathlib import Path
from datetime import date, timedelta
from decimal import Decimal
import logging

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.database import get_db_connection

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Constants
CFS_DAYS_TO_ACRE_FEET = 1.983
RISE_THRESHOLD_FT = 0.5  # Minimum weekly rise to count as "runoff starting"
MIN_RUNOFF_GAIN_FT = 2.0  # Minimum gain to count as "had runoff rise"


def get_water_year_bounds(water_year: int) -> tuple:
    """
    Get the start and end dates for a water year.
    Water year 2024 runs from Oct 1, 2023 to Sep 30, 2024.
    """
    start = date(water_year - 1, 10, 1)
    end = date(water_year, 9, 30)
    return start, end


def find_runoff_cycle(conn, water_year: int) -> dict:
    """
    Analyze daily elevation data to find the seasonal cycle.
    
    Returns dict with:
    - pre_runoff_low_elevation, pre_runoff_low_date
    - runoff_start_date, runoff_start_elevation
    - peak_elevation, peak_date
    - end_of_year_elevation
    - runoff_gain_ft, had_runoff_rise, days_of_rise
    """
    start_date, end_date = get_water_year_bounds(water_year)
    
    # Get all daily measurements for this water year
    cur = conn.cursor()
    cur.execute("""
        SELECT date, elevation, content, inflow, outflow
        FROM water_measurements
        WHERE date >= %s AND date <= %s
        ORDER BY date
    """, (start_date, end_date))
    
    rows = cur.fetchall()
    cur.close()
    
    if len(rows) < 30:  # Need at least a month of data
        logger.warning(f"Water year {water_year}: insufficient data ({len(rows)} days)")
        return None
    
    # Convert to list of dicts for easier manipulation
    data = [
        {
            'date': row[0],
            'elevation': float(row[1]) if row[1] else None,
            'content': int(row[2]) if row[2] else None,
            'inflow': int(row[3]) if row[3] else None,
            'outflow': int(row[4]) if row[4] else None
        }
        for row in rows
        if row[1] is not None  # Skip days with no elevation
    ]
    
    if len(data) < 30:
        return None
    
    # Step 1: Find pre-runoff low (lowest point between Dec 1 and Apr 30)
    # This is typically the winter low before spring runoff
    winter_start = date(water_year - 1, 12, 1)
    winter_end = date(water_year, 4, 30)
    
    winter_data = [d for d in data if winter_start <= d['date'] <= winter_end]
    
    if not winter_data:
        # Fallback: use first half of water year
        winter_data = data[:len(data)//2]
    
    pre_runoff_low = min(winter_data, key=lambda x: x['elevation'])
    pre_runoff_low_idx = next(i for i, d in enumerate(data) if d['date'] == pre_runoff_low['date'])
    
    # Step 2: Find runoff start (first 7-day period with meaningful rise after the low)
    runoff_start = None
    runoff_start_idx = None
    
    for i in range(pre_runoff_low_idx, len(data) - 7):
        week_change = data[i + 7]['elevation'] - data[i]['elevation']
        if week_change >= RISE_THRESHOLD_FT:
            runoff_start = data[i]
            runoff_start_idx = i
            break
    
    # Step 3: Find peak elevation (maximum after pre-runoff low, or overall max)
    post_low_data = data[pre_runoff_low_idx:]
    peak = max(post_low_data, key=lambda x: x['elevation'])
    peak_idx = next(i for i, d in enumerate(data) if d['date'] == peak['date'])
    
    # Step 4: Get end of year elevation (closest to Sep 30)
    end_of_year = data[-1]  # Last available data point
    
    # Step 5: Calculate metrics
    runoff_gain_ft = peak['elevation'] - pre_runoff_low['elevation']
    had_runoff_rise = runoff_gain_ft >= MIN_RUNOFF_GAIN_FT
    
    # Days of rise (from runoff start to peak, or 0 if no rise detected)
    days_of_rise = 0
    if runoff_start and peak:
        days_of_rise = (peak['date'] - runoff_start['date']).days
        if days_of_rise < 0:
            days_of_rise = 0
    
    return {
        'pre_runoff_low_elevation': pre_runoff_low['elevation'],
        'pre_runoff_low_date': pre_runoff_low['date'],
        'runoff_start_date': runoff_start['date'] if runoff_start else None,
        'runoff_start_elevation': runoff_start['elevation'] if runoff_start else None,
        'peak_elevation': peak['elevation'],
        'peak_date': peak['date'],
        'end_of_year_elevation': end_of_year['elevation'],
        'runoff_gain_ft': runoff_gain_ft,
        'had_runoff_rise': had_runoff_rise,
        'days_of_rise': days_of_rise
    }


def get_flow_totals(conn, water_year: int) -> dict:
    """
    Calculate flow totals for full water year and runoff season (Apr-Aug).
    """
    start_date, end_date = get_water_year_bounds(water_year)
    runoff_start = date(water_year, 4, 1)
    runoff_end = date(water_year, 8, 31)
    
    cur = conn.cursor()
    
    # Full water year totals
    cur.execute("""
        SELECT 
            SUM(inflow) as total_inflow_cfs,
            SUM(outflow) as total_outflow_cfs
        FROM water_measurements
        WHERE date >= %s AND date <= %s
    """, (start_date, end_date))
    
    wy_row = cur.fetchone()
    total_inflow_cfs = int(wy_row[0]) if wy_row[0] else 0
    total_outflow_cfs = int(wy_row[1]) if wy_row[1] else 0
    
    # Runoff season totals (Apr-Aug)
    cur.execute("""
        SELECT 
            SUM(inflow) as runoff_inflow_cfs,
            SUM(outflow) as runoff_outflow_cfs
        FROM water_measurements
        WHERE date >= %s AND date <= %s
    """, (runoff_start, runoff_end))
    
    runoff_row = cur.fetchone()
    runoff_inflow_cfs = int(runoff_row[0]) if runoff_row[0] else 0
    runoff_outflow_cfs = int(runoff_row[1]) if runoff_row[1] else 0
    
    cur.close()
    
    # Convert cfs-days to acre-feet
    return {
        'total_inflow_af': round(total_inflow_cfs * CFS_DAYS_TO_ACRE_FEET),
        'total_outflow_af': round(total_outflow_cfs * CFS_DAYS_TO_ACRE_FEET),
        'net_flow_af': round((total_inflow_cfs - total_outflow_cfs) * CFS_DAYS_TO_ACRE_FEET),
        'runoff_inflow_af': round(runoff_inflow_cfs * CFS_DAYS_TO_ACRE_FEET),
        'runoff_outflow_af': round(runoff_outflow_cfs * CFS_DAYS_TO_ACRE_FEET),
        'runoff_net_af': round((runoff_inflow_cfs - runoff_outflow_cfs) * CFS_DAYS_TO_ACRE_FEET)
    }


def get_snowpack_metrics(conn, water_year: int) -> dict:
    """
    Get snowpack metrics from basin_plots_data for this water year.
    
    Returns peak SWE, peak date, April 1 SWE, and percent of median values.
    """
    cur = conn.cursor()
    
    # Check if basin_plots_data table exists and has data for this year
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_name = 'basin_plots_data'
    """)
    if cur.fetchone()[0] == 0:
        cur.close()
        return None
    
    # Get peak SWE for this water year
    cur.execute("""
        SELECT 
            water_year_date,
            swe_value,
            median_91_20
        FROM basin_plots_data
        WHERE year = %s AND swe_value IS NOT NULL
        ORDER BY swe_value DESC
        LIMIT 1
    """, (water_year,))
    
    peak_row = cur.fetchone()
    if not peak_row:
        cur.close()
        return None
    
    peak_swe = float(peak_row[1]) if peak_row[1] else None
    peak_swe_date = peak_row[0]
    peak_median = float(peak_row[2]) if peak_row[2] else None
    peak_swe_percent = (peak_swe / peak_median * 100) if (peak_swe and peak_median) else None
    
    # Get April 1 SWE (or closest date)
    april_1 = date(water_year, 4, 1)
    cur.execute("""
        SELECT 
            swe_value,
            median_91_20
        FROM basin_plots_data
        WHERE year = %s 
          AND water_year_date >= %s
          AND swe_value IS NOT NULL
        ORDER BY water_year_date
        LIMIT 1
    """, (water_year, april_1))
    
    apr_row = cur.fetchone()
    april_1_swe = float(apr_row[0]) if (apr_row and apr_row[0]) else None
    april_1_median = float(apr_row[1]) if (apr_row and apr_row[1]) else None
    april_1_percent = (april_1_swe / april_1_median * 100) if (april_1_swe and april_1_median) else None
    
    cur.close()
    
    return {
        'peak_swe': peak_swe,
        'peak_swe_date': peak_swe_date,
        'peak_swe_percent_of_median': peak_swe_percent,
        'april_1_swe': april_1_swe,
        'april_1_percent_of_median': april_1_percent
    }


def calculate_correlation_metrics(snowpack: dict, flows: dict, cycle: dict) -> dict:
    """
    Calculate correlation metrics between snowpack and runoff.
    """
    if not snowpack or not snowpack.get('peak_swe'):
        return {
            'inflow_per_inch_swe': None,
            'ft_gained_per_inch_swe': None
        }
    
    peak_swe = snowpack['peak_swe']
    
    # Acre-feet inflow per inch of peak SWE
    inflow_per_inch = None
    if peak_swe > 0 and flows.get('runoff_inflow_af'):
        inflow_per_inch = round(flows['runoff_inflow_af'] / peak_swe)
    
    # Feet gained per inch of peak SWE
    ft_per_inch = None
    if peak_swe > 0 and cycle and cycle.get('runoff_gain_ft') is not None:
        ft_per_inch = round(cycle['runoff_gain_ft'] / peak_swe, 2)
    
    return {
        'inflow_per_inch_swe': inflow_per_inch,
        'ft_gained_per_inch_swe': ft_per_inch
    }


def upsert_water_year_analysis(conn, water_year: int, data: dict):
    """
    Insert or update a water year analysis record.
    """
    cur = conn.cursor()
    
    cur.execute("""
        INSERT INTO water_year_analysis (
            water_year,
            peak_swe, peak_swe_date, peak_swe_percent_of_median,
            april_1_swe, april_1_percent_of_median,
            pre_runoff_low_elevation, pre_runoff_low_date,
            runoff_start_date, runoff_start_elevation,
            peak_elevation, peak_date, end_of_year_elevation,
            runoff_gain_ft, had_runoff_rise, days_of_rise,
            runoff_inflow_af, runoff_outflow_af, runoff_net_af,
            total_inflow_af, total_outflow_af, net_flow_af,
            inflow_per_inch_swe, ft_gained_per_inch_swe
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        ON CONFLICT (water_year) DO UPDATE SET
            peak_swe = EXCLUDED.peak_swe,
            peak_swe_date = EXCLUDED.peak_swe_date,
            peak_swe_percent_of_median = EXCLUDED.peak_swe_percent_of_median,
            april_1_swe = EXCLUDED.april_1_swe,
            april_1_percent_of_median = EXCLUDED.april_1_percent_of_median,
            pre_runoff_low_elevation = EXCLUDED.pre_runoff_low_elevation,
            pre_runoff_low_date = EXCLUDED.pre_runoff_low_date,
            runoff_start_date = EXCLUDED.runoff_start_date,
            runoff_start_elevation = EXCLUDED.runoff_start_elevation,
            peak_elevation = EXCLUDED.peak_elevation,
            peak_date = EXCLUDED.peak_date,
            end_of_year_elevation = EXCLUDED.end_of_year_elevation,
            runoff_gain_ft = EXCLUDED.runoff_gain_ft,
            had_runoff_rise = EXCLUDED.had_runoff_rise,
            days_of_rise = EXCLUDED.days_of_rise,
            runoff_inflow_af = EXCLUDED.runoff_inflow_af,
            runoff_outflow_af = EXCLUDED.runoff_outflow_af,
            runoff_net_af = EXCLUDED.runoff_net_af,
            total_inflow_af = EXCLUDED.total_inflow_af,
            total_outflow_af = EXCLUDED.total_outflow_af,
            net_flow_af = EXCLUDED.net_flow_af,
            inflow_per_inch_swe = EXCLUDED.inflow_per_inch_swe,
            ft_gained_per_inch_swe = EXCLUDED.ft_gained_per_inch_swe,
            updated_at = CURRENT_TIMESTAMP
    """, (
        water_year,
        data.get('peak_swe'),
        data.get('peak_swe_date'),
        data.get('peak_swe_percent_of_median'),
        data.get('april_1_swe'),
        data.get('april_1_percent_of_median'),
        data.get('pre_runoff_low_elevation'),
        data.get('pre_runoff_low_date'),
        data.get('runoff_start_date'),
        data.get('runoff_start_elevation'),
        data.get('peak_elevation'),
        data.get('peak_date'),
        data.get('end_of_year_elevation'),
        data.get('runoff_gain_ft'),
        data.get('had_runoff_rise'),
        data.get('days_of_rise'),
        data.get('runoff_inflow_af'),
        data.get('runoff_outflow_af'),
        data.get('runoff_net_af'),
        data.get('total_inflow_af'),
        data.get('total_outflow_af'),
        data.get('net_flow_af'),
        data.get('inflow_per_inch_swe'),
        data.get('ft_gained_per_inch_swe')
    ))
    
    conn.commit()
    cur.close()


def get_water_years_with_data(conn) -> list:
    """
    Get list of water years that have sufficient data for analysis.
    """
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT
            CASE 
                WHEN EXTRACT(MONTH FROM date) >= 10 THEN EXTRACT(YEAR FROM date) + 1
                ELSE EXTRACT(YEAR FROM date)
            END as water_year,
            COUNT(*) as days
        FROM water_measurements
        GROUP BY water_year
        HAVING COUNT(*) >= 180
        ORDER BY water_year
    """)
    
    years = [int(row[0]) for row in cur.fetchall()]
    cur.close()
    return years


def run_analysis(start_year: int = None, end_year: int = None):
    """
    Run the water year cycle analysis for all years with data.
    """
    logger.info("=" * 60)
    logger.info("Starting Water Year Cycle Analysis")
    logger.info("=" * 60)
    
    conn = get_db_connection()
    
    # Create the table if it doesn't exist
    logger.info("Creating water_year_analysis table if needed...")
    with open(Path(__file__).parent.parent.parent / 'database' / 'add_water_year_analysis.sql', 'r') as f:
        sql = f.read()
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    cur.close()
    
    # Get water years with data
    water_years = get_water_years_with_data(conn)
    logger.info(f"Found {len(water_years)} water years with sufficient data: {water_years[0]} to {water_years[-1]}")
    
    # Filter by start/end year if specified
    if start_year:
        water_years = [y for y in water_years if y >= start_year]
    if end_year:
        water_years = [y for y in water_years if y <= end_year]
    
    success_count = 0
    skip_count = 0
    
    for water_year in water_years:
        logger.info(f"\nProcessing water year {water_year}...")
        
        # Get cycle data
        cycle = find_runoff_cycle(conn, water_year)
        if not cycle:
            logger.warning(f"  Skipping {water_year}: insufficient elevation data")
            skip_count += 1
            continue
        
        # Get flow totals
        flows = get_flow_totals(conn, water_year)
        
        # Get snowpack metrics (may be None for years before 1986)
        snowpack = get_snowpack_metrics(conn, water_year)
        
        # Calculate correlation metrics
        correlation = calculate_correlation_metrics(snowpack, flows, cycle)
        
        # Combine all data
        analysis_data = {
            **cycle,
            **flows,
            **(snowpack or {}),
            **correlation
        }
        
        # Log summary
        swe_pct = analysis_data.get('peak_swe_percent_of_median')
        gain = analysis_data.get('runoff_gain_ft', 0)
        logger.info(f"  Peak SWE: {swe_pct:.0f}% of median" if swe_pct else "  Peak SWE: N/A")
        logger.info(f"  Runoff gain: {gain:+.1f} ft ({'rise' if gain > 0 else 'decline'})")
        logger.info(f"  Runoff inflow: {analysis_data.get('runoff_inflow_af', 0) / 1_000_000:.2f}M acre-ft")
        
        # Save to database
        upsert_water_year_analysis(conn, water_year, analysis_data)
        success_count += 1
    
    conn.close()
    
    logger.info("\n" + "=" * 60)
    logger.info(f"Analysis complete: {success_count} years processed, {skip_count} skipped")
    logger.info("=" * 60)


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Calculate Water Year Cycle Analysis')
    parser.add_argument('--start-year', type=int, help='Start water year (default: all)')
    parser.add_argument('--end-year', type=int, help='End water year (default: all)')
    
    args = parser.parse_args()
    
    run_analysis(start_year=args.start_year, end_year=args.end_year)

