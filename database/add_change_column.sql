-- Migration: Add change column to water_measurements table
-- This adds the change column to track elevation change from previous day

-- Add change column if it doesn't exist
ALTER TABLE water_measurements 
ADD COLUMN IF NOT EXISTS change DECIMAL(10, 2);

-- Add comment to document the column
COMMENT ON COLUMN water_measurements.change IS 'Change in elevation from previous day (feet), NULL for first record';






