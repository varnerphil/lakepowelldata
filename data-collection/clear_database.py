"""
Script to clear the water_measurements table.
"""
import sys
from pathlib import Path
import logging

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from utils.database import clear_water_measurements

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Clear water_measurements table')
    parser.add_argument(
        '--confirm',
        action='store_true',
        help='Confirm that you want to delete all data'
    )
    
    args = parser.parse_args()
    
    if not args.confirm:
        logger.error("This will delete ALL water measurement data!")
        logger.error("Run with --confirm flag to proceed")
        sys.exit(1)
    
    logger.info("Clearing water_measurements table...")
    deleted_count = clear_water_measurements()
    logger.info(f"Successfully deleted {deleted_count} records from water_measurements table")




