# Mapbox Setup Guide

## Create a Mapbox Account

1. Go to [mapbox.com](https://www.mapbox.com/) and click "Sign up"
2. Create a free account (50,000 free map loads per month)
3. Verify your email

## Get Your Access Token

1. Log in to your Mapbox account
2. Go to your [Account page](https://account.mapbox.com/)
3. Scroll down to "Access tokens"
4. Copy your **Default public token** (starts with `pk.`)

## Configure the Token

### For Local Development

Add to your `.env.local` file in the `frontend` directory:

```
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
```

### For Vercel Deployment

1. Go to your Vercel project settings
2. Navigate to **Settings** > **Environment Variables**
3. Add a new variable:
   - Name: `NEXT_PUBLIC_MAPBOX_TOKEN`
   - Value: Your Mapbox public token
   - Environment: Production, Preview, Development

## Usage Limits (Free Tier)

- **Map loads**: 50,000/month
- **Static Images**: 50,000/month
- **Directions API**: 100,000/month
- **Geocoding**: 100,000/month

These limits are more than sufficient for personal/small-scale use.

## Features Enabled

The map page uses the following Mapbox features:

- **Satellite imagery**: High-resolution satellite and aerial imagery
- **3D Terrain**: Elevation data for terrain visualization
- **Navigation controls**: Zoom, rotation, and compass
- **Multiple map styles**: Satellite, Satellite Streets, Outdoors

## Offline Support

The map includes a service worker (`public/map-sw.js`) that:

- **Caches map tiles** as you view them
- **Stores up to 500 tiles** (roughly covers detailed views of frequently visited areas)
- **Expires tiles after 7 days** to keep data fresh
- **Falls back to cache** when offline

### How It Works

1. When you view an area of the map, tiles are automatically cached
2. If you lose connection, cached tiles are served from storage
3. Areas you haven't visited won't be available offline
4. The cache stats are shown in the bottom-right corner

### Tips for Best Offline Experience

- Before heading to the lake, browse the areas you plan to visit at various zoom levels
- This will cache those tiles for offline use
- Saved spots are always available offline (stored in localStorage)

