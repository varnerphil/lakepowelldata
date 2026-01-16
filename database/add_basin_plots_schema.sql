-- Basin plots data table for USDA NWCC historical SWE data
-- Stores daily SWE values by water year date and year

CREATE TABLE IF NOT EXISTS basin_plots_data (
    id SERIAL PRIMARY KEY,
    date_str VARCHAR(10) NOT NULL,  -- MM-DD format (e.g., "11-01")
    water_year_date DATE NOT NULL,  -- Full date in water year (Oct 1 - Sep 30)
    year INTEGER NOT NULL,  -- Water year (e.g., 1986, 1987, ..., 2026)
    swe_value DECIMAL(10, 4),  -- Snow Water Equivalent in inches (NULL if no data)
    percentile_10 DECIMAL(10, 4),  -- 10th percentile value for this date
    percentile_30 DECIMAL(10, 4),  -- 30th percentile value for this date
    percentile_70 DECIMAL(10, 4),  -- 70th percentile value for this date
    percentile_90 DECIMAL(10, 4),  -- 90th percentile value for this date
    min_value DECIMAL(10, 4),  -- Minimum value for this date
    median_91_20 DECIMAL(10, 4),  -- Median (1991-2020) for this date
    median_por DECIMAL(10, 4),  -- Median (Period of Record) for this date
    max_value DECIMAL(10, 4),  -- Maximum value for this date
    median_peak_swe DECIMAL(10, 4),  -- Median Peak SWE for this date
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(water_year_date, year)  -- One record per date/year combination
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_basin_plots_data_date ON basin_plots_data(water_year_date);
CREATE INDEX IF NOT EXISTS idx_basin_plots_data_year ON basin_plots_data(year);
CREATE INDEX IF NOT EXISTS idx_basin_plots_data_date_year ON basin_plots_data(water_year_date, year);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_basin_plots_data_updated_at BEFORE UPDATE ON basin_plots_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();




