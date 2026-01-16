-- Lake Powell Water Data Platform Database Schema
-- PostgreSQL database schema for Phase 1 feature parity

-- Water measurements table
CREATE TABLE IF NOT EXISTS water_measurements (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    elevation DECIMAL(10, 2) NOT NULL,
    change DECIMAL(10, 2),  -- Change in elevation from previous day (feet), NULL for first record
    content BIGINT NOT NULL,
    inflow INTEGER NOT NULL,
    outflow INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on date for faster queries
CREATE INDEX IF NOT EXISTS idx_water_measurements_date ON water_measurements(date);

-- Ramps table
CREATE TABLE IF NOT EXISTS ramps (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    min_safe_elevation DECIMAL(10, 2) NOT NULL,
    min_usable_elevation DECIMAL(10, 2) NOT NULL,
    location VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Weather data table
CREATE TABLE IF NOT EXISTS weather_data (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    high_temp DECIMAL(5, 1),
    low_temp DECIMAL(5, 1),
    water_temp DECIMAL(5, 1),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on date for faster queries
CREATE INDEX IF NOT EXISTS idx_weather_data_date ON weather_data(date);

-- Data sources metadata table
CREATE TABLE IF NOT EXISTS data_sources (
    id SERIAL PRIMARY KEY,
    source VARCHAR(100) NOT NULL UNIQUE,
    last_updated TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_water_measurements_updated_at BEFORE UPDATE ON water_measurements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ramps_updated_at BEFORE UPDATE ON ramps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_weather_data_updated_at BEFORE UPDATE ON weather_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_data_sources_updated_at BEFORE UPDATE ON data_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

