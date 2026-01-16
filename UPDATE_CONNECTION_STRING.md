# Update Connection String to Use Session Pooler

## The Issue
Your Supabase database is IPv6-only, but your network is IPv4-only. This causes "No route to host" errors.

## The Solution
Use the **Session Pooler** connection string instead, which supports IPv4.

## Steps

1. **In the Supabase connection dialog:**
   - Click the **"Pooler settings"** button
   - OR change the **"Method"** dropdown from "Direct connection" to **"Session Pooler"**

2. **Copy the Session Pooler connection string:**
   - It will look like:
     ```
     postgresql://postgres:[YOUR-PASSWORD]@db.dkvqoemxotrjovawpevv.supabase.co:6543/postgres?pgbouncer=true
     ```
   - Note: Port is **6543** (not 5432) and has `?pgbouncer=true` at the end

3. **Replace [YOUR-PASSWORD] with your actual password** (URL-encoded if needed)

4. **Update your .env files:**

   ```bash
   # Update data-collection/.env
   cd data-collection
   # Edit .env and replace DATABASE_URL with the Session Pooler connection string
   
   # Update frontend/.env.local
   cd ../frontend
   # Edit .env.local and replace DATABASE_URL with the Session Pooler connection string
   ```

5. **Test the connection:**

   ```bash
   cd data-collection
   source venv/bin/activate
   python ../scripts/test-connection.py
   ```

6. **Run the schema setup:**

   ```bash
   python ../scripts/run_schema.py
   ```

## URL Encoding the Password

If your password has special characters, you may need to URL-encode them. The Session Pooler connection string from Supabase should already handle this, but if you're manually constructing it:

- `?` becomes `%3F`
- `!` becomes `%21`
- `$` becomes `%24`
- `+` becomes `%2B`
- etc.

## Alternative: Use Supabase SQL Editor

If connection issues persist, you can always use the SQL Editor in Supabase dashboard to run the schema setup - it bypasses all network connection issues.






