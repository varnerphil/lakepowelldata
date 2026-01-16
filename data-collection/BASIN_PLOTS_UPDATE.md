# Basin Plots Data Update

This document describes how to keep the basin plots data up to date.

## Manual Update

To manually update the basin plots data:

```bash
cd data-collection
source venv/bin/activate
python -m migrations.import_basin_plots_data
```

Or use the convenience script:

```bash
./data-collection/update_basin_plots.sh
```

## Scheduled Updates

The basin plots data should be updated daily to capture the latest snowpack measurements. The USDA NWCC updates their data daily.

### Using Cron

Add this to your crontab (`crontab -e`):

```bash
# Update basin plots data daily at 2 AM
0 2 * * * cd /path/to/lake-powell-water-data/data-collection && ./update_basin_plots.sh >> /var/log/basin-plots-update.log 2>&1
```

### Using systemd timer (Linux)

Create `/etc/systemd/system/basin-plots-update.service`:

```ini
[Unit]
Description=Update Basin Plots Data
After=network.target

[Service]
Type=oneshot
User=your-user
WorkingDirectory=/path/to/lake-powell-water-data/data-collection
ExecStart=/path/to/lake-powell-water-data/data-collection/update_basin_plots.sh
```

Create `/etc/systemd/system/basin-plots-update.timer`:

```ini
[Unit]
Description=Daily Basin Plots Data Update
Requires=basin-plots-update.service

[Timer]
OnCalendar=daily
OnCalendar=02:00
Persistent=true

[Install]
WantedBy=timers.target
```

Then enable and start:

```bash
sudo systemctl enable basin-plots-update.timer
sudo systemctl start basin-plots-update.timer
```

## Data Source

The data is fetched from:
- JSON: `https://nwcc-apps.sc.egov.usda.gov/awdb/basin-plots/POR/WTEQ/assocHUC2/14_Upper_Colorado_Region.json?hucFilter=14`
- CSV (fallback): `https://nwcc-apps.sc.egov.usda.gov/awdb/basin-plots/POR/WTEQ/assocHUC2/14_Upper_Colorado_Region.csv?hucFilter=14`

The import script automatically handles updates to existing records, so running it multiple times is safe.




