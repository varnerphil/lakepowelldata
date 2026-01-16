"""
Import historical SNOTEL data from USDA AWDB API.
"""
import sys
from pathlib import Path
from datetime import date, timedelta
import logging
import time

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from collectors.snotel_collector import (
    parse_snotel_report,
    get_awdb_client,
    find_site_id,
    fetch_all_site_historical_data
)
from utils.database import (
    bulk_upsert_snotel_sites,
    bulk_upsert_snotel_measurements
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def import_snotel_historical_data(
    start_date: date = None,
    end_date: date = None,
    update_existing: bool = True,
    limit_sites: int = None
):
    """
    Import historical SNOTEL data for all sites in the Colorado report.
    
    Args:
        start_date: Start date for historical data (defaults to 10 years ago)
        end_date: End date for historical data (defaults to today)
        update_existing: If True, update existing records
        limit_sites: Optional limit on number of sites to process (for testing)
    """
    logger.info("=" * 60)
    logger.info("Starting SNOTEL historical data import")
    logger.info("=" * 60)
    
    start_time = time.time()
    
    if start_date is None:
        start_date = date.today() - timedelta(days=365 * 10)  # 10 years
    if end_date is None:
        end_date = date.today()
    
    logger.info(f"Date range: {start_date} to {end_date}")
    
    try:
        # Parse sites from report
        logger.info("Parsing SNOTEL report...")
        sites = parse_snotel_report()
        
        if not sites:
            logger.error("No sites found in SNOTEL report")
            return
        
        logger.info(f"Found {len(sites)} sites in report")
        
        if limit_sites:
            sites = sites[:limit_sites]
            logger.info(f"Limiting to {limit_sites} sites for testing")
        
        # Get AWDB client
        logger.info("Connecting to AWDB API...")
        client = get_awdb_client()
        if not client:
            logger.error("Failed to create AWDB client")
            return
        
        # Process sites
        sites_to_insert = []
        all_measurements = []
        
        for i, site in enumerate(sites, 1):
            site_name = site['name']
            logger.info(f"[{i}/{len(sites)}] Processing site: {site_name}")
            
            # Try to find site ID (try multiple states)
            site_id = None
            for state in ['CO', 'UT', 'WY', 'NM', 'AZ']:
                try:
                    site_id = find_site_id(client, site_name, state)
                    if site_id:
                        logger.info(f"  Found site ID {site_id} for {site_name} (state: {state})")
                        break
                except Exception as e:
                    logger.debug(f"  Error searching in {state}: {e}")
                    continue
            
            if not site_id:
                logger.warning(f"  Could not find site ID for: {site_name}")
                # Store site with a placeholder ID based on name - we can map it later
                # Use a format that's clearly a placeholder: "UNKNOWN:NAME:STATE"
                site_id = f"UNKNOWN:{site_name.replace(' ', '_').upper()[:20]}:{site.get('basin', 'UNKNOWN')[:10]}"
                logger.info(f"  Using placeholder ID: {site_id}")
                
                # Store site metadata
                sites_to_insert.append({
                    'site_id': site_id,
                    'name': site_name,
                    'elevation': site['elevation'],
                    'basin': site['basin'],
                    'state': None,
                    'latitude': None,
                    'longitude': None,
                })
                
                # Store current values from text file as today's measurement
                # This gives us at least current data even without historical API access
                if 'swe_current' in site and site['swe_current'] is not None:
                    all_measurements.append({
                        'site_id': site_id,
                        'date': end_date,  # Use end_date (today) for current values
                        'snow_water_equivalent': site.get('swe_current'),
                        'snow_depth': None,  # Not in text file
                        'precipitation': site.get('precip_current'),
                        'temperature_max': None,  # Not in text file
                        'temperature_min': None,  # Not in text file
                        'temperature_avg': None,  # Not in text file
                    })
                    logger.info(f"  Stored current values from text file for {site_name}")
                
                continue
            
            # Prepare site record for database
            sites_to_insert.append({
                'site_id': site_id,
                'name': site_name,
                'elevation': site['elevation'],
                'basin': site['basin'],
                'state': None,  # Could be extracted from site_id if needed
                'latitude': None,  # Could be fetched from station metadata
                'longitude': None,  # Could be fetched from station metadata
            })
            
            # Fetch historical data
            logger.info(f"  Fetching historical data for {site_name}...")
            try:
                historical_data = fetch_all_site_historical_data(
                    site_id,
                    start_date=start_date,
                    end_date=end_date
                )
                
                if not historical_data:
                    logger.warning(f"  No historical data found for {site_name}")
                    continue
                
                # Process measurements
                # Group by date to combine all elements for each date
                measurements_by_date = {}
                
                for element_cd, data_points in historical_data.items():
                    for point in data_points:
                        date_key = point['date']
                        if date_key not in measurements_by_date:
                            measurements_by_date[date_key] = {
                                'site_id': site_id,
                                'date': date_key,
                            }
                        
                        # Map element codes to database columns
                        if element_cd == 'WTEQ':
                            measurements_by_date[date_key]['snow_water_equivalent'] = point['value']
                        elif element_cd == 'SNWD':
                            measurements_by_date[date_key]['snow_depth'] = point['value']
                        elif element_cd == 'PREC':
                            measurements_by_date[date_key]['precipitation'] = point['value']
                        elif element_cd == 'TMAX':
                            measurements_by_date[date_key]['temperature_max'] = point['value']
                        elif element_cd == 'TMIN':
                            measurements_by_date[date_key]['temperature_min'] = point['value']
                        elif element_cd == 'TAVG':
                            measurements_by_date[date_key]['temperature_avg'] = point['value']
                
                # Add measurements to bulk insert list
                all_measurements.extend(measurements_by_date.values())
                
                logger.info(f"  Fetched {len(measurements_by_date)} measurement dates for {site_name}")
                
                # Add a small delay to avoid overwhelming the API
                time.sleep(0.5)
                
            except Exception as e:
                logger.error(f"  Error fetching data for {site_name}: {e}", exc_info=True)
                continue
        
        # Insert sites into database FIRST (measurements have foreign key constraint)
        if sites_to_insert:
            logger.info(f"Inserting {len(sites_to_insert)} sites into database...")
            sites_inserted = bulk_upsert_snotel_sites(sites_to_insert, update_existing=update_existing)
            logger.info(f"Inserted/updated {sites_inserted} sites")
        
        # Insert measurements into database AFTER sites are inserted
        if all_measurements:
            logger.info(f"Inserting {len(all_measurements)} measurements into database...")
            measurements_inserted = bulk_upsert_snotel_measurements(
                all_measurements,
                update_existing=update_existing
            )
            logger.info(f"Inserted/updated {measurements_inserted} measurements")
        
        elapsed_time = time.time() - start_time
        logger.info("=" * 60)
        logger.info(f"Import completed!")
        logger.info(f"  Sites processed: {len(sites_to_insert)}")
        logger.info(f"  Measurements processed: {len(all_measurements)}")
        logger.info(f"  Time elapsed: {elapsed_time:.2f} seconds")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"Error during import: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Import historical SNOTEL data from AWDB API")
    parser.add_argument(
        "--start-date",
        type=str,
        help="Start date for historical data (YYYY-MM-DD). Defaults to 10 years ago."
    )
    parser.add_argument(
        "--end-date",
        type=str,
        help="End date for historical data (YYYY-MM-DD). Defaults to today."
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip existing records instead of updating them"
    )
    parser.add_argument(
        "--limit-sites",
        type=int,
        help="Limit number of sites to process (for testing)"
    )
    
    args = parser.parse_args()
    
    start_date = None
    if args.start_date:
        start_date = date.fromisoformat(args.start_date)
    
    end_date = None
    if args.end_date:
        end_date = date.fromisoformat(args.end_date)
    
    import_snotel_historical_data(
        start_date=start_date,
        end_date=end_date,
        update_existing=not args.skip_existing,
        limit_sites=args.limit_sites
    )

