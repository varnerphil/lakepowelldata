-- Elevation-Storage Capacity Table for Lake Powell
-- Based on official USBR/USGS data:
--   Dead Pool (3370 ft): 0 af
--   Full Pool (3700 ft): 24,322,000 af
--   Historical Max (3708.34 ft, Jul 14, 1983): 25,757,086 af
--
-- The storage per foot varies by elevation range due to lake topography:
--   3370-3520 ft: ~30,067 af/ft (narrow canyon)
--   3520-3700 ft: ~110,067 af/ft (wider basin)
--   3700-3710 ft: ~179,386 af/ft (very wide surface area)

-- Drop existing table if it exists
DROP TABLE IF EXISTS elevation_storage_capacity;

-- Create the elevation-storage capacity lookup table
CREATE TABLE elevation_storage_capacity (
    elevation INTEGER PRIMARY KEY,
    storage_acre_feet BIGINT NOT NULL,
    storage_per_foot INTEGER NOT NULL,
    elevation_range VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert elevation-storage data for each foot from dead pool to above full pool
-- Using calculated values based on official anchor points

-- Generate values for 3370-3520 ft (30,067 af/ft)
INSERT INTO elevation_storage_capacity (elevation, storage_acre_feet, storage_per_foot, elevation_range, notes)
SELECT 
    elev,
    (elev - 3370) * 30067,
    30067,
    '3370-3520',
    CASE 
        WHEN elev = 3370 THEN 'Dead Pool - minimum pool elevation, no releases possible'
        WHEN elev = 3490 THEN 'Minimum Power Pool - below this, no hydroelectric generation'
        WHEN elev = 3520 THEN 'Lowest recent level (April 2023)'
        ELSE NULL
    END
FROM generate_series(3370, 3519) AS elev;

-- Insert 3520 as the transition point
INSERT INTO elevation_storage_capacity (elevation, storage_acre_feet, storage_per_foot, elevation_range, notes)
VALUES (3520, 4510000, 30067, '3370-3520', 'Transition point - lowest recent level (April 2023)');

-- Generate values for 3521-3700 ft (110,067 af/ft)
INSERT INTO elevation_storage_capacity (elevation, storage_acre_feet, storage_per_foot, elevation_range, notes)
SELECT 
    elev,
    4510000 + (elev - 3520) * 110067,
    110067,
    '3520-3700',
    CASE 
        WHEN elev = 3700 THEN 'Full Pool - maximum normal operating level'
        ELSE NULL
    END
FROM generate_series(3521, 3700) AS elev;

-- Generate values for 3701-3710 ft (179,386 af/ft) - above full pool
INSERT INTO elevation_storage_capacity (elevation, storage_acre_feet, storage_per_foot, elevation_range, notes)
SELECT 
    elev,
    24322000 + (elev - 3700) * 179386,
    179386,
    '3700-3710',
    CASE 
        WHEN elev = 3708 THEN 'Historical Maximum (July 14, 1983)'
        ELSE NULL
    END
FROM generate_series(3701, 3710) AS elev;

-- Create index for fast lookups
CREATE INDEX idx_elevation_storage_capacity_elevation ON elevation_storage_capacity(elevation);

-- Add a comment to the table
COMMENT ON TABLE elevation_storage_capacity IS 'Lake Powell elevation-storage capacity lookup table based on official USBR/USGS data. Storage values represent total storage from dead pool (3370 ft).';

-- View to show current lake status with percentage calculations
CREATE OR REPLACE VIEW lake_powell_status AS
SELECT 
    wm.date,
    wm.elevation,
    esc.storage_acre_feet as calculated_storage,
    wm.content as reported_content,
    ROUND(esc.storage_acre_feet::numeric / 24322000 * 100, 2) as percent_of_full_pool,
    24322000 - esc.storage_acre_feet as storage_remaining_to_full,
    esc.storage_acre_feet - 0 as storage_above_dead_pool,
    esc.storage_per_foot as current_storage_per_foot
FROM water_measurements wm
LEFT JOIN elevation_storage_capacity esc ON FLOOR(wm.elevation)::INTEGER = esc.elevation
ORDER BY wm.date DESC;

-- Verify the table
SELECT 
    elevation,
    storage_acre_feet,
    storage_per_foot,
    elevation_range,
    notes
FROM elevation_storage_capacity
WHERE notes IS NOT NULL OR elevation IN (3370, 3490, 3520, 3538, 3600, 3650, 3700, 3708)
ORDER BY elevation;


