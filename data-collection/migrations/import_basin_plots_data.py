"""
Import basin plots data from USDA NWCC endpoint.
This script fetches historical SWE data and imports it into the database.
"""
import sys
from pathlib import Path
from datetime import date
import logging

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from collectors.basin_plots_collector import fetch_all_basin_plots_data
from utils.database import bulk_insert_basin_plots_data
import time

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def import_basin_plots_data(update_existing: bool = True):
    """
    Import basin plots data from USDA NWCC endpoint.
    
    Args:
        update_existing: If True, update existing records with new data
    """
    logger.info("=" * 60)
    logger.info("Starting basin plots data import")
    logger.info("=" * 60)
    
    start_time = time.time()
    
    try:
        # Fetch all data
        logger.info("Fetching basin plots data from USDA NWCC endpoint...")
        parsed_data = fetch_all_basin_plots_data()
        
        if not parsed_data:
            logger.error("No data fetched from USDA NWCC endpoint")
            return
        
        logger.info(f"Fetched {len(parsed_data)} records")
        
        # Insert into database
        logger.info(f"Inserting {len(parsed_data)} records into database...")
        inserted_count = bulk_insert_basin_plots_data(parsed_data, update_existing=update_existing)
        
        elapsed_time = time.time() - start_time
        logger.info("=" * 60)
        logger.info(f"Import completed successfully!")
        logger.info(f"  Records processed: {len(parsed_data)}")
        logger.info(f"  Records inserted/updated: {inserted_count}")
        logger.info(f"  Time elapsed: {elapsed_time:.2f} seconds")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"Error during import: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Import basin plots data from USDA NWCC")
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip existing records instead of updating them"
    )
    
    args = parser.parse_args()
    
    import_basin_plots_data(update_existing=not args.skip_existing)




