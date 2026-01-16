-- Water Year Cycle Analysis Table
-- Tracks the full seasonal cycle for each water year with snowpack correlation

CREATE TABLE IF NOT EXISTS water_year_analysis (
  water_year INTEGER PRIMARY KEY,
  
  -- Snowpack metrics (from basin_plots_data, 1986+)
  peak_swe DECIMAL(10,4),                    -- Maximum SWE reached that year (inches)
  peak_swe_date DATE,                        -- When peak SWE occurred
  peak_swe_percent_of_median DECIMAL(5,2),   -- Peak vs median (1991-2020)
  april_1_swe DECIMAL(10,4),                 -- Traditional April 1 measurement
  april_1_percent_of_median DECIMAL(5,2),    -- April 1 vs median
  
  -- Seasonal Cycle Inflection Points
  pre_runoff_low_elevation DECIMAL(8,2),     -- Lowest elevation before runoff starts
  pre_runoff_low_date DATE,                  -- Date of pre-runoff low
  runoff_start_date DATE,                    -- When sustained rise begins
  runoff_start_elevation DECIMAL(8,2),       -- Elevation at runoff start
  peak_elevation DECIMAL(8,2),               -- Annual high elevation
  peak_date DATE,                            -- Date of annual high
  end_of_year_elevation DECIMAL(8,2),        -- Sep 30 elevation
  
  -- Calculated Changes
  runoff_gain_ft DECIMAL(6,2),               -- Peak minus pre-runoff low (can be negative)
  had_runoff_rise BOOLEAN DEFAULT FALSE,     -- Did elevation rise during runoff season?
  days_of_rise INTEGER,                      -- Duration of rising period (days)
  
  -- Flow Totals (runoff season: Apr-Aug)
  runoff_inflow_af INTEGER,                  -- Apr-Aug total inflow (acre-feet)
  runoff_outflow_af INTEGER,                 -- Apr-Aug total outflow (acre-feet)
  runoff_net_af INTEGER,                     -- Net gain/loss during runoff season
  
  -- Full Water Year Totals
  total_inflow_af INTEGER,                   -- Oct-Sep total inflow
  total_outflow_af INTEGER,                  -- Oct-Sep total outflow
  net_flow_af INTEGER,                       -- Net for full water year
  
  -- Correlation Metrics
  inflow_per_inch_swe INTEGER,               -- Acre-ft runoff inflow per inch of peak SWE
  ft_gained_per_inch_swe DECIMAL(4,2),       -- Elevation gain per inch of peak SWE
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_water_year_analysis_peak_swe_pct 
  ON water_year_analysis(peak_swe_percent_of_median);
CREATE INDEX IF NOT EXISTS idx_water_year_analysis_runoff_gain 
  ON water_year_analysis(runoff_gain_ft);
CREATE INDEX IF NOT EXISTS idx_water_year_analysis_had_rise 
  ON water_year_analysis(had_runoff_rise);

-- Trigger to auto-update updated_at
-- Set search_path to prevent search path manipulation attacks
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_water_year_analysis_updated_at') THEN
        CREATE TRIGGER update_water_year_analysis_updated_at 
            BEFORE UPDATE ON water_year_analysis
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;

-- Add comment explaining the table
COMMENT ON TABLE water_year_analysis IS 'Tracks seasonal cycle for each water year with snowpack correlation for projections';
COMMENT ON COLUMN water_year_analysis.peak_swe_percent_of_median IS 'Peak SWE as percentage of 1991-2020 median';
COMMENT ON COLUMN water_year_analysis.had_runoff_rise IS 'FALSE for drought years with no spring rise';
COMMENT ON COLUMN water_year_analysis.inflow_per_inch_swe IS 'Efficiency metric: acre-feet inflow per inch of peak SWE';

