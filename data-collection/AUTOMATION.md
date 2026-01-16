# Data Collection Automation

This document describes the automated data collection processes for Lake Powell Water Data.

## Overview

Data collection is automated via GitHub Actions. All workflows can be:
- **Automatically triggered** on their schedules
- **Manually triggered** from the GitHub Actions tab

## Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| **Water Data** | Daily 1 AM UTC (6 PM MST) | Collects water level, inflow, outflow from USBR |
| **Snowpack Data** | Daily 2 PM UTC (7 AM MST) | Updates SNOTEL measurements and Basin Plots |
| **Water Year Analysis** | Oct 15 annually | Recalculates runoff correlations after water year ends |

## Workflow Files

### `.github/workflows/data-collection.yml`

**Daily data collection** - runs automatically every day:

1. **Water Data Job** (1 AM UTC)
   - Fetches today's water measurements from USBR
   - Fills any gaps in historical data
   - Updates weather data

2. **Snowpack Data Job** (2 PM UTC)
   - Updates SNOTEL site measurements
   - Updates Basin Plots data (regional snowpack trends)

### `.github/workflows/annual-analysis.yml`

**Annual water year analysis** - runs October 15:

- Calculates runoff patterns for the just-completed water year
- Updates snowpack-to-elevation correlations
- Powers the "Snowpack-Based Projection" feature

## Manual Triggering

### From GitHub UI

1. Go to **Actions** tab in GitHub
2. Select the workflow (e.g., "Data Collection")
3. Click **Run workflow**
4. Choose which job to run:
   - `all` - Run all daily jobs
   - `water-data` - Only water measurements
   - `snowpack-data` - Only SNOTEL + Basin Plots
   - `basin-plots` - Only Basin Plots
   - `water-year-analysis` - Recalculate water year analysis

### From Command Line (GitHub CLI)

```bash
# Run all daily jobs
gh workflow run data-collection.yml -f job=all

# Run only water data
gh workflow run data-collection.yml -f job=water-data

# Run water year analysis
gh workflow run data-collection.yml -f job=water-year-analysis
```

## Required Secrets

Set these in GitHub repository settings → Secrets and variables → Actions:

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `WEATHER_API_KEY` | API key for weather data (optional) |

## Local Development

To run data collection locally:

```bash
cd data-collection
source venv/bin/activate

# Daily water data
python collectors/scheduler.py

# SNOTEL update
python -m migrations.import_snotel_historical_data --end-date $(date +%Y-%m-%d)

# Basin Plots
python -m migrations.import_basin_plots_data

# Water Year Analysis
python -m migrations.calculate_water_year_analysis
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATA SOURCES                                 │
├─────────────────┬─────────────────┬─────────────────────────────┤
│     USBR        │     NRCS        │        USDA NWCC            │
│  (Water Data)   │   (SNOTEL)      │     (Basin Plots)           │
└────────┬────────┴────────┬────────┴────────────┬────────────────┘
         │                 │                      │
         ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GITHUB ACTIONS                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ scheduler.py │  │ import_      │  │ import_basin_        │   │
│  │   (daily)    │  │ snotel.py    │  │ plots_data.py        │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
└─────────┼─────────────────┼─────────────────────┼───────────────┘
          │                 │                      │
          ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE (PostgreSQL)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ water_       │  │ snotel_      │  │ basin_plots_         │   │
│  │ measurements │  │ measurements │  │ data                 │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              water_year_analysis                          │   │
│  │     (calculated annually, powers projections)            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       NEXT.JS FRONTEND                           │
│  (fetches from Supabase, caches API responses for 1 hour)       │
└─────────────────────────────────────────────────────────────────┘
```

## Monitoring

- Check the **Actions** tab in GitHub for job status
- Failed jobs will show ❌ in the workflow list
- Each job logs detailed output for debugging

## Troubleshooting

### Job Failed - Database Connection

Check that `DATABASE_URL` secret is set correctly and the database is accessible.

### SNOTEL Update Issues

SNOTEL data quality can vary. The job will continue even if some sites fail.
Check the logs for specific site errors.

### Basin Plots Not Updating

The USDA NWCC data source occasionally has outages. Try again later.

### Stale Projections

If snowpack projections seem outdated, manually trigger the water year analysis:
1. Go to Actions → Annual Water Year Analysis → Run workflow

