# Connection Troubleshooting

## Issue: "No route to host" / DNS resolution failure

The connection is failing because the hostname `db.dkvqoemxotrjovawpevv.supabase.co` cannot be resolved.

## Solution: Verify Connection String

1. **Go to your Supabase Dashboard**
   - https://supabase.com/dashboard
   - Select your "Lake Powell Data" project

2. **Get the correct connection string:**
   - Go to **Settings** → **Database**
   - Scroll to **"Connection string"** section
   - Make sure you're on the **"URI"** tab
   - Copy the connection string

3. **Verify the hostname:**
   - The hostname should be something like: `db.xxxxxx.supabase.co`
   - Make sure it matches what's in your `.env` files

4. **Try Connection Pooler (Recommended):**
   - In the same Settings → Database page
   - Scroll to **"Connection pooling"** section
   - Copy the **"Session"** pooler connection string
   - It will have `?pgbouncer=true` at the end
   - Update your `.env` files with this connection string

## Update Your .env Files

Once you have the correct connection string:

```bash
# Update data-collection/.env
cd data-collection
# Edit .env and replace DATABASE_URL with the correct one

# Update frontend/.env.local  
cd ../frontend
# Edit .env.local and replace DATABASE_URL with the correct one
```

## Then Try Again

```bash
cd data-collection
source venv/bin/activate
python ../scripts/run_schema.py
```

## Alternative: Use Supabase SQL Editor

If connection issues persist, use the SQL Editor in Supabase dashboard:

1. Click **"SQL Editor"** in left sidebar
2. Click **"New query"**
3. Copy contents of `database/complete_setup.sql`
4. Paste and click **"Run"**

This bypasses network connection issues entirely.






