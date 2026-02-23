-- Monte Carlo simulation results cache table
-- Stores pre-computed and on-demand simulation results for fast retrieval

CREATE TABLE IF NOT EXISTS monte_carlo_results (
  id SERIAL PRIMARY KEY,
  
  -- Query parameters (cache key)
  policy_type TEXT NOT NULL,            -- 'simple' or 'tiered'
  policy_config JSONB NOT NULL,         -- e.g. {"simplePercent": 95} or {"tiers": [...]}
  start_date DATE NOT NULL,
  start_elevation NUMERIC(7,2) NOT NULL,
  start_content BIGINT NOT NULL,
  years_to_project INTEGER NOT NULL,
  iterations INTEGER NOT NULL DEFAULT 1000,
  
  -- Result data
  result JSONB NOT NULL,
  
  -- Metadata
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  compute_time_ms INTEGER,
  lake_state_date DATE NOT NULL,        -- "as of" date for the lake data used
  
  -- Uniqueness constraint for cache lookups
  UNIQUE (policy_type, policy_config, start_date, years_to_project)
);

CREATE INDEX IF NOT EXISTS idx_monte_carlo_lookup 
  ON monte_carlo_results (policy_type, start_date, years_to_project);

CREATE INDEX IF NOT EXISTS idx_monte_carlo_freshness
  ON monte_carlo_results (lake_state_date);
