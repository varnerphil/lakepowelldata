"""
Import historical data from USBR CSV/JSON endpoints or RISE API.
This script fetches all available historical data and imports it into the database.
"""
import sys
from pathlib import Path
from datetime import date
import logging
import json

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from collectors.usbr_csv_collector import fetch_all_water_data
from collectors.usgs_collector import fetch_all_water_data_usgs
from utils.database import insert_water_measurement, bulk_insert_water_measurements, get_existing_dates, get_earliest_date, get_latest_date
import time

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def import_csv_historical_data(
    start_date: date = None,
    end_date: date = None,
    update_existing: bool = True,
    skip_existing: bool = False,
    chunk_size_years: int = 1
):
    """
    Import historical data from USBR CSV/JSON or RISE API.
    Processes in chunks to handle large date ranges.
    
    Args:
        start_date: Start date (optional, for RISE API fallback)
        end_date: End date (optional, for RISE API fallback)
        update_existing: If True, update existing records with new data
        skip_existing: If True, skip dates that already exist (only if update_existing is False)
        chunk_size_years: Number of years to process per chunk (default: 1)
    """
    # #region agent log
    try:
        with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"ALL","location":"import_csv_historical_data.py:25","message":"import_csv_historical_data ENTRY","data":{"start_date":str(start_date) if start_date else None,"end_date":str(end_date) if end_date else None},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion
    logger.info("=" * 60)
    logger.info("Starting CSV/JSON historical data import")
    logger.info("=" * 60)
    
    # Check existing data
    existing_earliest = get_earliest_date()
    existing_latest = get_latest_date()
    
    if existing_earliest and existing_latest:
        logger.info(f"Existing data in database: {existing_earliest} to {existing_latest}")
    else:
        logger.info("No existing data in database")
    
    # Default to historical start date if not provided
    if start_date is None:
        start_date = date(1980, 6, 22)
    if end_date is None:
        end_date = date.today()
    
    logger.info(f"Importing data from {start_date} to {end_date}")
    
    # Process in chunks to avoid API limits and handle large date ranges
    # BUT: If using download endpoint, fetch everything at once (much faster!)
    from datetime import timedelta
    
    total_inserted = 0
    total_updated = 0
    total_skipped = 0
    total_failed = 0
    
    start_time = time.time()
    total_days = (end_date - start_date).days + 1
    
    # Get existing dates if we need to check them
    existing_dates = set()
    if skip_existing and not update_existing:
        existing_dates = get_existing_dates(start_date, end_date)
        logger.info(f"Found {len(existing_dates)} existing dates to skip")
    
    # Try fetching all data at once first (download endpoint can handle full range)
    logger.info("Attempting to fetch all data in a single request (download endpoint)...")
    all_data = fetch_all_water_data(start_date=start_date, end_date=end_date)
    
    if all_data and len(all_data) > 0:
        logger.info(f"Successfully fetched {len(all_data)} records in single request - bulk importing all at once...")
        
        # Filter out existing dates if needed
        if skip_existing and not update_existing:
            data_to_insert = [d for d in all_data if d['date'] not in existing_dates]
            total_skipped = len(all_data) - len(data_to_insert)
        else:
            data_to_insert = all_data
            total_skipped = 0
        
        if data_to_insert:
            try:
                # Use bulk insert for much faster performance
                logger.info(f"Bulk inserting {len(data_to_insert)} records...")
                inserted_count, updated_count = bulk_insert_water_measurements(
                    data_to_insert,
                    update_existing=update_existing
                )
                
                total_inserted = inserted_count
                total_updated = updated_count
                total_failed = 0
                
                logger.info(f"  Bulk import complete: {total_inserted} inserted, {total_updated} updated, {total_skipped} skipped")
            except Exception as e:
                logger.error(f"Bulk insert failed: {e}")
                logger.info("Falling back to individual inserts...")
                # Fallback to individual inserts
                total_inserted = 0
                total_updated = 0
                total_failed = 0
                for i, data in enumerate(data_to_insert):
                    try:
                        insert_water_measurement(
                            date=data['date'],
                            elevation=data['elevation'],
                            content=data['content'],
                            inflow=data.get('inflow', 0),
                            outflow=data.get('outflow', 0),
                            change=data.get('change'),
                            update_existing=update_existing
                        )
                        total_inserted += 1
                        if (i + 1) % 1000 == 0:
                            logger.info(f"  Processed {i + 1}/{len(data_to_insert)} records...")
                    except Exception as e2:
                        logger.warning(f"Failed to insert water data for {data['date']}: {e2}")
                        total_failed += 1
        else:
            logger.info(f"  All {len(all_data)} records already exist, skipping...")
            total_inserted = 0
            total_updated = 0
            total_failed = 0
    else:
        # Fallback to chunked processing if single request didn't work
        logger.info("Single request didn't return data, falling back to chunked processing...")
        current_start = start_date
        processed_days = 0
        
        while current_start <= end_date:
            # Calculate chunk end date
            chunk_end = min(
                date(current_start.year + chunk_size_years, current_start.month, current_start.day) - timedelta(days=1),
                end_date
            )
            
            chunk_days = (chunk_end - current_start).days + 1
            processed_days += chunk_days
            progress_pct = (processed_days / total_days) * 100
            
            logger.info(f"Processing chunk: {current_start} to {chunk_end} ({progress_pct:.1f}% complete)")
        
        # #region agent log
        try:
            with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
                f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"A","location":"import_csv_historical_data.py:94","message":"Chunk processing START","data":{"chunk_start":str(current_start),"chunk_end":str(chunk_end),"progress_pct":progress_pct},"timestamp":int(__import__('time').time()*1000)}) + '\n')
        except: pass
        # #endregion
        
        # Fetch data for this chunk
        try:
            # #region agent log
            try:
                with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"A","location":"import_csv_historical_data.py:98","message":"Calling fetch_all_water_data","data":{"chunk_start":str(current_start),"chunk_end":str(chunk_end)},"timestamp":int(__import__('time').time()*1000)}) + '\n')
            except: pass
            # #endregion
            all_data = fetch_all_water_data(start_date=current_start, end_date=chunk_end)
            # #region agent log
            try:
                with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"A","location":"import_csv_historical_data.py:100","message":"fetch_all_water_data returned","data":{"records_count":len(all_data) if all_data else 0},"timestamp":int(__import__('time').time()*1000)}) + '\n')
            except: pass
            # #endregion
            
            if not all_data:
                logger.warning(f"No data fetched for chunk {current_start} to {chunk_end}")
                current_start = chunk_end + timedelta(days=1)
            else:
                logger.info(f"Fetched {len(all_data)} records for chunk")
                
                # Import data for this chunk
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
                        
                        if skip_existing:
                            existing_dates.add(data_date)
                        
                        if (i + 1) % 1000 == 0:
                            logger.info(f"  Processed {i + 1}/{len(all_data)} records in chunk...")
                            
                    except Exception as e:
                        logger.warning(f"Failed to import data for {data_date}: {e}")
                        total_failed += 1
                
                logger.info(f"  Chunk complete: {total_inserted + total_updated} records imported")
                
                # Move to next chunk
                current_start = chunk_end + timedelta(days=1)
                
                # Small delay between chunks to avoid rate limiting
                time.sleep(1)
            # #region agent log
            try:
                with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"A","location":"import_csv_historical_data.py:143","message":"Chunk processing COMPLETE","data":{"chunk_start":str(current_start),"chunk_end":str(chunk_end),"inserted":total_inserted,"updated":total_updated},"timestamp":int(__import__('time').time()*1000)}) + '\n')
            except: pass
            # #endregion
            
        except Exception as e:
            logger.error(f"Failed to fetch/import chunk {current_start} to {chunk_end}: {e}")
            # #region agent log
            try:
                with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
                    f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"A","location":"import_csv_historical_data.py:146","message":"Chunk processing EXCEPTION","data":{"chunk_start":str(current_start),"chunk_end":str(chunk_end),"error":str(e)},"timestamp":int(__import__('time').time()*1000)}) + '\n')
            except: pass
            # #endregion
            total_failed += chunk_days  # Estimate failures
        
            # Move to next chunk
            current_start = chunk_end + timedelta(days=1)
            
            # Small delay between chunks to avoid rate limiting
            time.sleep(1)
    
    elapsed_time = time.time() - start_time
    
    elapsed_time = time.time() - start_time
    
    logger.info("=" * 60)
    logger.info("Import complete!")
    logger.info(f"  Records inserted: {total_inserted}")
    logger.info(f"  Records updated: {total_updated}")
    logger.info(f"  Records skipped: {total_skipped}")
    logger.info(f"  Records failed: {total_failed}")
    logger.info(f"  Total time: {elapsed_time:.1f} seconds")
    logger.info("=" * 60)


if __name__ == '__main__':
    # #region agent log
    try:
        with open('/Users/phil/Development/lake-powell-water-data/.cursor/debug.log', 'a') as f:
            f.write(json.dumps({"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"ALL","location":"import_csv_historical_data.py:238","message":"Script START","data":{},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion
    import argparse
    
    parser = argparse.ArgumentParser(description='Import historical Lake Powell data from USBR CSV/JSON or RISE API')
    parser.add_argument(
        '--start-date',
        type=str,
        help='Start date for RISE API fallback (YYYY-MM-DD)'
    )
    parser.add_argument(
        '--end-date',
        type=str,
        help='End date for RISE API fallback (YYYY-MM-DD)'
    )
    parser.add_argument(
        '--no-update-existing',
        action='store_true',
        help='Do not update existing records (skip them instead)'
    )
    parser.add_argument(
        '--skip-existing',
        action='store_true',
        help='Skip dates that already exist (only if --no-update-existing is set)'
    )
    parser.add_argument(
        '--chunk-size-years',
        type=int,
        default=1,
        help='Number of years to process per chunk (default: 1)'
    )
    
    args = parser.parse_args()
    
    start_date = None
    if args.start_date:
        start_date = date.fromisoformat(args.start_date)
    
    end_date = None
    if args.end_date:
        end_date = date.fromisoformat(args.end_date)
    
    import_csv_historical_data(
        start_date=start_date,
        end_date=end_date,
        update_existing=not args.no_update_existing,
        skip_existing=args.skip_existing,
        chunk_size_years=args.chunk_size_years
    )

