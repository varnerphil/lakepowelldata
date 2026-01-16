-- Fix security issues identified by Supabase security scanner

-- 1. Fix function search_path issue
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

-- 2. Enable Row Level Security (RLS) on all public tables
-- Note: For a read-only public data site, RLS policies can be permissive
-- This enables RLS but allows all reads (no restrictions needed for public data)

-- Enable RLS on water_measurements
ALTER TABLE water_measurements ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for reads (allows all SELECT operations)
CREATE POLICY "Allow public read access" ON water_measurements
    FOR SELECT
    USING (true);

-- Enable RLS on ramps
ALTER TABLE ramps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON ramps
    FOR SELECT
    USING (true);

-- Enable RLS on weather_data (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weather_data') THEN
        ALTER TABLE weather_data ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Allow public read access" ON weather_data
            FOR SELECT
            USING (true);
    END IF;
END
$$;

-- Enable RLS on data_sources (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'data_sources') THEN
        ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Allow public read access" ON data_sources
            FOR SELECT
            USING (true);
    END IF;
END
$$;

-- Enable RLS on basin_plots_data
ALTER TABLE basin_plots_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON basin_plots_data
    FOR SELECT
    USING (true);

-- Enable RLS on snotel_sites
ALTER TABLE snotel_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON snotel_sites
    FOR SELECT
    USING (true);

-- Enable RLS on snotel_measurements
ALTER TABLE snotel_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON snotel_measurements
    FOR SELECT
    USING (true);

-- Enable RLS on elevation_storage_capacity
ALTER TABLE elevation_storage_capacity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON elevation_storage_capacity
    FOR SELECT
    USING (true);

-- Enable RLS on water_year_analysis
ALTER TABLE water_year_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON water_year_analysis
    FOR SELECT
    USING (true);

-- Note: These policies allow all SELECT operations, which is appropriate for a public read-only data site.
-- If you need to restrict access in the future, you can modify or add more restrictive policies.

