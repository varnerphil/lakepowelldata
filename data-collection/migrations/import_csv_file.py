"""
Import historical data from a manually downloaded CSV file.
Use this if automatic import from APIs doesn't work.
"""
import sys
from pathlib import Path
from datetime import date
import logging

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from collectors.usbr_historical_collector import parse_historical_csv
from utils.database import insert_water_measurement, get_existing_dates
import argparse

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def import_csv_file(csv_file_path: str, update_existing: bool = True, skip_existing: bool = False):
    """
    Import data from a CSV file.
    
    Args:
        csv_file_path: Path to CSV file
        update_existing: If True, update existing records
        skip_existing: If True, skip existing records (only if update_existing is False)
    """
    logger.info("=" * 60)
    logger.info("Importing data from CSV file")
    logger.info("=" * 60)
    
    # Read CSV file
    csv_path = Path(csv_file_path)
    if not csv_path.exists():
        logger.error(f"CSV file not found: {csv_file_path}")
        return
    
    logger.info(f"Reading CSV file: {csv_path}")
    with open(csv_path, 'r', encoding='utf-8') as f:
        csv_content = f.read()
    
    # Parse CSV
    logger.info("Parsing CSV content...")
    all_data = parse_historical_csv(csv_content)
    
    if not all_data:
        logger.error("No data found in CSV file")
        return
    
    logger.info(f"Parsed {len(all_data)} records from CSV")
    
    # Get existing dates if needed
    existing_dates = set()
    if skip_existing and not update_existing:
        if all_data:
            min_date = min(d['date'] for d in all_data)
            max_date = max(d['date'] for d in all_data)
            existing_dates = get_existing_dates(min_date, max_date)
            logger.info(f"Found {len(existing_dates)} existing dates to skip")
    
    # Import data
    total_inserted = 0
    total_updated = 0
    total_skipped = 0
    total_failed = 0
    
    logger.info("Importing data into database...")
    
    for i, data in enumerate(all_data):
        data_date = data['date']
        
        # Skip if already exists
        if skip_existing and not update_existing and data_date in existing_dates:
            total_skipped += 1
            continue
        
        is_update = data_date in existing_dates if existing_dates else False
        
        try:
            insert_water_measurement(
                date=data_date,
                elevation=data['elevation'],
                content=data['content'],
                inflow=data.get('inflow', 0),
                outflow=data.get('outflow', 0),
                change=data.get('change'),  # Include change field
                update_existing=update_existing
            )
            
            if is_update and update_existing:
                total_updated += 1
            else:
                total_inserted += 1
            
            if (i + 1) % 1000 == 0:
                logger.info(f"Processed {i + 1}/{len(all_data)} records...")
                
        except Exception as e:
            logger.warning(f"Failed to import data for {data_date}: {e}")
            total_failed += 1
    
    logger.info("=" * 60)
    logger.info("Import complete!")
    logger.info(f"  Records inserted: {total_inserted}")
    logger.info(f"  Records updated: {total_updated}")
    logger.info(f"  Records skipped: {total_skipped}")
    logger.info(f"  Records failed: {total_failed}")
    logger.info("=" * 60)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Import historical Lake Powell data from CSV file')
    parser.add_argument('csv_file', help='Path to CSV file')
    parser.add_argument('--no-update-existing', action='store_true', help='Do not update existing records')
    parser.add_argument('--skip-existing', action='store_true', help='Skip existing records')
    
    args = parser.parse_args()
    
    import_csv_file(
        csv_file_path=args.csv_file,
        update_existing=not args.no_update_existing,
        skip_existing=args.skip_existing
    )

