# Lake Powell Water Data Platform

A modern web application to track and display Lake Powell water data, boat ramp accessibility, and historical trends.

## Technology Stack

- **Frontend/API**: Next.js 14+ with TypeScript
- **Data Collection**: Python 3.11+ with scheduled scripts
- **Database**: Supabase PostgreSQL
- **Testing**: pytest (Python), Vitest (Next.js), Playwright (E2E)
- **Deployment**: Vercel (Next.js), Supabase (Database), GitHub Actions (Python scripts)

## Project Structure

```
lake-powell-water-data/
├── frontend/                 # Next.js application
├── data-collection/         # Python scripts
├── database/                # Database migrations/schema
├── .github/                 # GitHub Actions workflows
└── docs/                    # Documentation
```

## Development Setup

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Data Collection (Python)

```bash
cd data-collection
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Testing

**Frontend Tests:**
```bash
cd frontend
npm test              # Run unit/integration tests
npm run test:e2e      # Run E2E tests
```

**Python Tests:**
```bash
cd data-collection
source venv/bin/activate
pytest
```

## Environment Variables

Create `.env.local` in the frontend directory and `.env` in the data-collection directory:

- `DATABASE_URL`: Supabase PostgreSQL connection string
- `WEATHER_API_KEY`: OpenWeatherMap API key
- `USBR_API_KEY`: (if required)

## License

MIT






