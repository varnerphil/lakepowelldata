-- SNOTEL Sites Table
-- Stores metadata for each SNOTEL monitoring site
CREATE TABLE IF NOT EXISTS snotel_sites (
    id SERIAL PRIMARY KEY,
    site_id VARCHAR(50) UNIQUE NOT NULL, -- AWDB site ID
    name VARCHAR(255) NOT NULL,
    elevation INTEGER, -- Elevation in feet
    basin VARCHAR(255), -- Basin name (e.g., "UPPER GREEN RIVER BASIN")
    state VARCHAR(2), -- State code (e.g., "CO", "UT", "WY")
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_snotel_sites_site_id ON snotel_sites(site_id);
CREATE INDEX IF NOT EXISTS idx_snotel_sites_name ON snotel_sites(name);
CREATE INDEX IF NOT EXISTS idx_snotel_sites_basin ON snotel_sites(basin);

-- SNOTEL Measurements Table
-- Stores historical measurements for each SNOTEL site
CREATE TABLE IF NOT EXISTS snotel_measurements (
    id SERIAL PRIMARY KEY,
    site_id VARCHAR(50) NOT NULL REFERENCES snotel_sites(site_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    snow_water_equivalent DECIMAL(10, 2), -- SWE in inches
    snow_depth DECIMAL(10, 2), -- Snow depth in inches
    precipitation DECIMAL(10, 2), -- Precipitation in inches
    temperature_max DECIMAL(5, 2), -- Maximum temperature in Fahrenheit
    temperature_min DECIMAL(5, 2), -- Minimum temperature in Fahrenheit
    temperature_avg DECIMAL(5, 2), -- Average temperature in Fahrenheit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (site_id, date)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_snotel_measurements_site_id ON snotel_measurements(site_id);
CREATE INDEX IF NOT EXISTS idx_snotel_measurements_date ON snotel_measurements(date);
CREATE INDEX IF NOT EXISTS idx_snotel_measurements_site_date ON snotel_measurements(site_id, date);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_snotel_sites_updated_at BEFORE UPDATE ON snotel_sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_snotel_measurements_updated_at BEFORE UPDATE ON snotel_measurements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();




