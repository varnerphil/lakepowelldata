# Supabase Setup Guide

## Step 1: Create Supabase Account

1. Go to https://supabase.com
2. Click **"Start your project"** or **"Sign up"**
3. Sign up with:
   - GitHub (recommended - easiest)
   - Email
   - Or another provider

## Step 2: Create a New Project

1. Once logged in, click **"New Project"**
2. Fill in the project details:
   - **Name**: `lake-powell-water-data` (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
     - You'll need this for the connection string
   - **Region**: Choose closest to you (e.g., `US West` for Arizona)
   - **Pricing Plan**: Select **Free** (generous free tier)
3. Click **"Create new project"**
4. Wait 2-3 minutes for the project to be provisioned

## Step 3: Get Your Connection String

1. Once your project is ready, go to **Settings** (gear icon in left sidebar)
2. Click **"Database"** in the settings menu
3. Scroll down to **"Connection string"** section
4. Select **"URI"** tab (not "JDBC" or "Golang")
5. Copy the connection string - it will look like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxx.supabase.co:5432/postgres
   ```
6. **Important**: Replace `[YOUR-PASSWORD]` with the password you created in Step 2
   - The final string should look like:
   ```
   postgresql://postgres:your-actual-password@db.xxxxxx.supabase.co:5432/postgres
   ```

## Step 4: Get Your Project URL and Anon Key (for future auth)

While you're in Settings:

1. Go to **Settings** → **API**
2. Copy these for later (Phase 3 - authentication):
   - **Project URL**: `https://xxxxxx.supabase.co`
   - **anon/public key**: Long string starting with `eyJ...`

## Step 5: Configure Your Local Environment

### Frontend (.env.local)

```bash
cd frontend
cp .env.example .env.local
```

Edit `frontend/.env.local`:
```env
DATABASE_URL=postgresql://postgres:your-password@db.xxxxxx.supabase.co:5432/postgres
```

### Data Collection (.env)

```bash
cd data-collection
cp .env.example .env
```

Edit `data-collection/.env`:
```env
DATABASE_URL=postgresql://postgres:your-password@db.xxxxxx.supabase.co:5432/postgres
WEATHER_API_KEY=your-openweathermap-api-key
```

**Note**: You can get a free OpenWeatherMap API key at https://openweathermap.org/api

## Step 6: Test the Connection

```bash
cd data-collection
source venv/bin/activate
export DATABASE_URL="postgresql://postgres:your-password@db.xxxxxx.supabase.co:5432/postgres"
python ../scripts/test-connection.py
```

You should see:
```
✓ Connected to PostgreSQL: PostgreSQL 15.x...
✓ Found X tables: ...
```

## Step 7: Set Up Database Schema

```bash
# Make sure DATABASE_URL is set
export DATABASE_URL="postgresql://postgres:your-password@db.xxxxxx.supabase.co:5432/postgres"

# Run the setup script
./scripts/setup-database.sh
```

This will:
- Create all database tables
- Set up indexes
- Create triggers
- Seed ramp definitions (17 ramps)

## Step 8: Verify Setup

Check that tables were created:

1. In Supabase dashboard, go to **Table Editor** (left sidebar)
2. You should see these tables:
   - `water_measurements`
   - `ramps`
   - `weather_data`
   - `data_sources`

3. Click on `ramps` table - you should see 17 ramp definitions

## Troubleshooting

### Connection Refused

- Make sure your IP is allowed (Supabase allows all by default)
- Check that the password in the connection string matches your database password
- Verify the project is active (not paused)

### Password Issues

- Make sure you replaced `[YOUR-PASSWORD]` in the connection string
- URL-encode special characters in your password if needed
- The password is the one you set when creating the project

### Project Paused

- Free tier projects pause after 1 week of inactivity
- Click "Restore" in the Supabase dashboard to reactivate

## Next Steps

Once Supabase is set up:

1. ✅ Database schema is created
2. ✅ Ramp data is seeded
3. Start the frontend: `cd frontend && npm run dev`
4. (Optional) Import historical data: `cd data-collection && source venv/bin/activate && python migrations/import_historical_data.py`

## Security Notes

- Never commit `.env` or `.env.local` files to git (they're in .gitignore)
- The connection string contains your database password - keep it secure
- For production, use Supabase's connection pooling and environment variables in Vercel






