# Quick Start Guide

## Prerequisites

- Node.js 20+ (or use nvm to manage versions)
- Python 3.11+
- PostgreSQL database (Supabase recommended)

## Step 1: Set Up Supabase Database

**📖 See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for detailed step-by-step instructions.**

Quick overview:
1. Go to https://supabase.com and create a new project
2. Once created, go to **Settings** → **Database**
3. Copy the **Connection string** (URI format)
4. Replace `[YOUR-PASSWORD]` with your actual database password
5. It should look like: `postgresql://postgres:your-password@db.[PROJECT-REF].supabase.co:5432/postgres`

## Step 2: Configure Environment Variables

### Frontend

```bash
cd frontend
cp .env.example .env.local
```

Edit `frontend/.env.local` and add:
```
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

### Data Collection

```bash
cd data-collection
cp .env.example .env
```

Edit `data-collection/.env` and add:
```
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
WEATHER_API_KEY=your-openweathermap-api-key
```

## Step 3: Set Up Database Schema

```bash
# Make sure DATABASE_URL is set
export DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Run the setup script
./scripts/setup-database.sh
```

Or manually:
```bash
# Run schema migration
psql $DATABASE_URL -f database/schema.sql

# Seed ramp data
cd data-collection
source venv/bin/activate
python migrations/seed_ramps.py
```

## Step 4: Test Database Connection

```bash
cd data-collection
source venv/bin/activate
export DATABASE_URL="your-connection-string"
python ../scripts/test-connection.py
```

## Step 5: Start Development Server

```bash
cd frontend
npm run dev
```

Visit http://localhost:3000

## Step 6: (Optional) Import Historical Data

This will take a while as it imports data from 1980 to present:

```bash
cd data-collection
source venv/bin/activate
python migrations/import_historical_data.py
```

## Step 7: Set Up GitHub Actions (for Production)

1. Push your code to GitHub
2. Go to your repository → **Settings** → **Secrets and variables** → **Actions**
3. Add the following secrets:
   - `DATABASE_URL`: Your Supabase connection string
   - `WEATHER_API_KEY`: Your OpenWeatherMap API key

The GitHub Actions workflows will automatically:
- Run tests on push/PR
- Collect data daily at 1 AM UTC

## Troubleshooting

### Node Version Issues

If you see Node version warnings, use nvm to switch to Node 20+:

```bash
nvm install 20
nvm use 20
```

### Database Connection Issues

1. Make sure your Supabase project is active
2. Check that the connection string is correct
3. Verify your IP is allowed (Supabase allows all by default, but check settings)
4. Test connection: `python scripts/test-connection.py`

### Missing Dependencies

```bash
# Frontend
cd frontend && npm install

# Python
cd data-collection
source venv/bin/activate
pip install -r requirements.txt
```

