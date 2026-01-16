#!/bin/bash
# Script to update basin plots data from USDA NWCC
# Can be run via cron: 0 2 * * * /path/to/update_basin_plots.sh

cd "$(dirname "$0")"
source venv/bin/activate
python -m migrations.import_basin_plots_data




