# Setup Guide

## Prerequisites

- Node.js 20+ (for Next.js)
- Python 3.11+ (for data collection)
- PostgreSQL database (Supabase recommended)

## Initial Setup

### 1. Database Setup (Supabase)

**See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for detailed step-by-step instructions.**

Quick steps:
1. Create a Supabase project at https://supabase.com
2. Get your database connection string from Settings → Database
3. Replace `[YOUR-PASSWORD]` in the connection string with your actual password
4. Run the schema migration:

```bash
psql $DATABASE_URL -f database/schema.sql
```

4. Seed ramp data:

```bash
cd data-collection
source venv/bin/activate
python migrations/seed_ramps.py
```

### 2. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL
npm run dev
```

### 3. Data Collection Setup

```bash
cd data-collection
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your DATABASE_URL and API keys
```

### 4. Run Historical Data Migration (Optional)

```bash
cd data-collection
source venv/bin/activate
python migrations/import_historical_data.py
```

## Testing

### Frontend Tests

```bash
cd frontend
npm test              # Unit/integration tests
npm run test:e2e      # E2E tests
```

### Python Tests

```bash
cd data-collection
source venv/bin/activate
pytest
```

## Deployment

### Vercel (Next.js)

1. Connect your GitHub repo to Vercel
2. Add Supabase integration in Vercel Marketplace
3. Configure environment variables
4. Deploy

### GitHub Actions (Python Scripts)

1. Add secrets to GitHub repository:
   - `DATABASE_URL`
   - `WEATHER_API_KEY`
2. The workflow will run automatically on schedule

## Environment Variables

### Frontend (.env.local)
- `DATABASE_URL`: Supabase PostgreSQL connection string

### Data Collection (.env)
- `DATABASE_URL`: Supabase PostgreSQL connection string
- `WEATHER_API_KEY`: OpenWeatherMap API key

