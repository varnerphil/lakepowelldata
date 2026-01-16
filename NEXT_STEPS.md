# Next Steps After Environment Setup

## Current Status
✅ Frontend `.env.local` configured  
✅ Data collection `.env` configured  
⚠️ Database connection test failed - likely project is paused

## Step 1: Check Supabase Project Status

1. Go to https://supabase.com/dashboard
2. Check if your project shows as **"Paused"** or **"Active"**
3. If paused:
   - Click on your project
   - Click **"Restore"** or **"Resume"** button
   - Wait 1-2 minutes for it to come back online

## Step 2: Test Connection Again

Once your project is active, test the connection:

```bash
cd data-collection
source venv/bin/activate
python ../scripts/test-connection.py
```

You should see:
```
✓ Connected to PostgreSQL: PostgreSQL 15.x...
✓ Found X tables: ...
```

## Step 3: Set Up Database Schema

Once connection works, run the setup script:

```bash
# Make sure you're in the project root
cd /Users/phil/Development/lake-powell-water-data

# The script will read DATABASE_URL from data-collection/.env
cd data-collection
source venv/bin/activate
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d '=' -f2-)
cd ..
./scripts/setup-database.sh
```

Or manually:

```bash
cd data-collection
source venv/bin/activate

# Run schema
psql $DATABASE_URL -f ../database/schema.sql

# Seed ramps
python migrations/seed_ramps.py
```

## Step 4: Start Development Server

Once database is set up:

```bash
cd frontend
npm run dev
```

Visit http://localhost:3000

## Troubleshooting Connection Issues

### If "No route to host" persists:

1. **Check Supabase Dashboard**: Make sure project is active
2. **Try Connection Pooler**: In Supabase dashboard, go to Settings → Database → Connection string, try the "Session" or "Transaction" pooler instead
3. **Check IP Restrictions**: Supabase allows all IPs by default, but verify in Settings → Database → Connection pooling
4. **Wait a few minutes**: New projects sometimes take 5-10 minutes to fully provision

### Alternative: Use psql directly

If you have `psql` installed:

```bash
psql "postgresql://postgres:%3FVL%2B%21a%25Wu9fXm%24F@db.dkvqoemxotrjovawpevv.supabase.co:5432/postgres" -c "SELECT version();"
```

If this works, the connection string is correct and the issue is with the Python connection.






