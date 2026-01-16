-- Complete Database Setup for Lake Powell Water Data
-- Run this entire file in Supabase SQL Editor

-- ============================================
-- SCHEMA SETUP
-- ============================================

-- Water measurements table
CREATE TABLE IF NOT EXISTS water_measurements (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    elevation DECIMAL(10, 2) NOT NULL,
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

-- Triggers to auto-update updated_at
DROP TRIGGER IF EXISTS update_water_measurements_updated_at ON water_measurements;
CREATE TRIGGER update_water_measurements_updated_at BEFORE UPDATE ON water_measurements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ramps_updated_at ON ramps;
CREATE TRIGGER update_ramps_updated_at BEFORE UPDATE ON ramps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_weather_data_updated_at ON weather_data;
CREATE TRIGGER update_weather_data_updated_at BEFORE UPDATE ON weather_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_data_sources_updated_at ON data_sources;
CREATE TRIGGER update_data_sources_updated_at BEFORE UPDATE ON data_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA
-- ============================================

-- Seed ramp definitions
INSERT INTO ramps (name, min_safe_elevation, min_usable_elevation, location) VALUES
('Bullfrog North Ramp', 3529.00, 3528.00, 'Bullfrog, UT'),
('Antelope Point Business Ramp', 3540.00, 3539.00, 'Antelope Point, AZ'),
('Bullfrog Spur (Boats < 25'')', 3549.00, 3548.00, 'Bullfrog, UT'),
('Wahweap (Main Launch)', 3550.00, 3549.00, 'Wahweap, AZ'),
('Halls Crossing (use at own risk)', 3556.00, 3555.00, 'Halls Crossing, UT'),
('Stateline Launch', 3520.00, 3519.00, 'Stateline, UT'),
('Bullfrog (Main Launch)', 3578.00, 3577.00, 'Bullfrog, UT'),
('Castle Rock Cut-Off', 3583.00, 3582.00, 'Castle Rock, UT'),
('Antelope Point Public Ramp', 3588.00, 3587.00, 'Antelope Point, AZ'),
('Dominguez Butte Cut-Off', 3602.00, 3601.00, 'Dominguez Butte, UT'),
('Gunsight to Padre Bay Cut-Off', 3613.00, 3612.00, 'Gunsight, UT'),
('Hite', 3650.00, 3649.00, 'Hite, UT'),
('Farley Canyon', 3653.00, 3652.00, 'Farley Canyon, UT'),
('Copper Canyon', 3663.00, 3662.00, 'Copper Canyon, UT'),
('Bullfrog to Halls Creek Cut-Off', 3670.00, 3669.00, 'Bullfrog, UT'),
('Piute Farms', 3682.00, 3681.00, 'Piute Farms, UT')
ON CONFLICT (name) DO NOTHING;

-- Verify setup
SELECT 'Schema setup complete!' as status;
SELECT COUNT(*) as ramp_count FROM ramps;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;





