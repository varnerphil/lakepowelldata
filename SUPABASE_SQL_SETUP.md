# Setting Up Database via Supabase SQL Editor

Since direct connection is having issues, use the Supabase SQL Editor to set up your database.

## Step 1: Run Schema SQL

1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New query"** button
3. Copy the entire contents of `database/schema.sql` and paste it into the editor
4. Click **"Run"** (or press Cmd+Enter / Ctrl+Enter)
5. You should see: **"Success. No rows returned"**

This creates:
- `water_measurements` table
- `ramps` table  
- `weather_data` table
- `data_sources` table
- Indexes and triggers

## Step 2: Seed Ramp Data

After the schema is created, run this SQL in the SQL Editor:

```sql
-- Insert ramp definitions
INSERT INTO ramps (name, min_safe_elevation, min_usable_elevation, location) VALUES
('Wahweap Main Ramp', 3550.0, 3520.0, 'Wahweap Bay'),
('Wahweap Auxiliary Ramp', 3550.0, 3520.0, 'Wahweap Bay'),
('Stateline Ramp', 3520.0, 3490.0, 'Wahweap Bay'),
('Antelope Point Ramp', 3520.0, 3490.0, 'Antelope Point'),
('Bullfrog Main Ramp', 3600.0, 3570.0, 'Bullfrog Marina'),
('Bullfrog North Ramp', 3600.0, 3570.0, 'Bullfrog Marina'),
('Halls Crossing Ramp', 3600.0, 3570.0, 'Halls Crossing'),
('Hite Ramp', 3700.0, 3670.0, 'Hite Marina'),
('Dangling Rope Ramp', 3600.0, 3570.0, 'Dangling Rope Marina'),
('Farley Canyon Ramp', 3650.0, 3620.0, 'Farley Canyon'),
('Hite North Ramp', 3700.0, 3670.0, 'Hite Marina'),
('Warm Creek Ramp', 3550.0, 3520.0, 'Warm Creek Bay'),
('Lone Rock Ramp', 3520.0, 3490.0, 'Lone Rock Beach'),
('Castle Rock Cut Ramp', 3520.0, 3490.0, 'Castle Rock Cut'),
('Navajo Ramp', 3520.0, 3490.0, 'Navajo Canyon'),
('Dominguez Ramp', 3520.0, 3490.0, 'Dominguez Canyon'),
('San Juan Ramp', 3600.0, 3570.0, 'San Juan Arm')
ON CONFLICT (name) DO NOTHING;
```

Click **"Run"** again.

## Step 3: Verify Setup

In the SQL Editor, run:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see: `data_sources`, `ramps`, `water_measurements`, `weather_data`

Then check ramps:

```sql
SELECT COUNT(*) as ramp_count FROM ramps;
```

Should return: `17`

## Step 4: Test Connection from Local

Once the schema is set up, try the connection test again:

```bash
cd data-collection
source venv/bin/activate
python ../scripts/test-connection.py
```

If it still doesn't work, we can proceed with using the Supabase SQL Editor for data operations, or try the connection pooler URL.






