#!/usr/bin/env python3
"""
Quick analysis of 2001-2005 water years to understand the dramatic drop
"""
import os
import sys
from pathlib import Path

# Add data-collection directory to path
data_collection_path = Path(__file__).parent.parent / 'data-collection'
sys.path.insert(0, str(data_collection_path))

from utils.database import get_db_connection

def main():
    conn = get_db_connection()
    cur = conn.cursor()
    
    print("=" * 80)
    print("WATER YEAR ANALYSIS: 2001-2005")
    print("=" * 80)
    print()
    
    cur.execute("""
        SELECT 
            water_year,
            peak_swe_percent_of_median,
            april_1_percent_of_median,
            runoff_inflow_af,
            runoff_outflow_af,
            runoff_net_af,
            total_inflow_af,
            total_outflow_af,
            net_flow_af,
            runoff_gain_ft,
            pre_runoff_low_elevation,
            peak_elevation,
            end_of_year_elevation
        FROM water_year_analysis
        WHERE water_year BETWEEN 2001 AND 2005
        ORDER BY water_year
    """)
    
    rows = cur.fetchall()
    
    for row in rows:
        wy, peak_swe_pct, apr1_swe_pct, runoff_in, runoff_out, runoff_net, total_in, total_out, net_flow, gain_ft, low_elev, peak_elev, end_elev = row
        
        print(f"WATER YEAR {wy}")
        print("-" * 80)
        
        if peak_swe_pct:
            print(f"  Peak SWE: {peak_swe_pct:.0f}% of median")
        if apr1_swe_pct:
            print(f"  April 1 SWE: {apr1_swe_pct:.0f}% of median")
        
        print(f"  Pre-runoff low: {low_elev:.1f} ft")
        print(f"  Peak elevation: {peak_elev:.1f} ft" if peak_elev else "  Peak elevation: N/A")
        print(f"  End of year: {end_elev:.1f} ft" if end_elev else "  End of year: N/A")
        print(f"  Runoff gain: {gain_ft:+.1f} ft" if gain_ft else "  Runoff gain: N/A")
        
        if runoff_in:
            print(f"  Runoff season (Apr-Aug) inflow: {runoff_in / 1_000_000:.2f}M acre-ft")
        if runoff_out:
            print(f"  Runoff season (Apr-Aug) outflow: {runoff_out / 1_000_000:.2f}M acre-ft")
        if runoff_net:
            print(f"  Runoff season net: {runoff_net / 1_000_000:+.2f}M acre-ft")
        
        if total_in:
            print(f"  Full year inflow: {total_in / 1_000_000:.2f}M acre-ft")
        if total_out:
            print(f"  Full year outflow: {total_out / 1_000_000:.2f}M acre-ft")
        if net_flow:
            print(f"  Full year net: {net_flow / 1_000_000:+.2f}M acre-ft")
        
        print()
    
    # Also get elevation at start and end of period
    print("=" * 80)
    print("ELEVATION TREND")
    print("=" * 80)
    
    cur.execute("""
        SELECT date, elevation
        FROM water_measurements
        WHERE date IN ('2000-10-01', '2001-10-01', '2002-10-01', '2003-10-01', '2004-10-01', '2005-10-01', '2006-10-01')
        ORDER BY date
    """)
    
    elev_rows = cur.fetchall()
    for date, elev in elev_rows:
        print(f"  {date}: {elev:.1f} ft")
    
    cur.close()
    conn.close()

if __name__ == '__main__':
    main()

