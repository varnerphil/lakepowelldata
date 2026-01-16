# PWA Icon Setup

The PWA icon has been created and configured. To complete the setup, you need to generate PNG versions of the icon.

## Current Status

✅ SVG icon created: `public/icon.svg`  
✅ Manifest file created: `public/manifest.json`  
✅ Layout updated with PWA metadata  
⏳ PNG icons needed: `icon-192.png` and `icon-512.png`

## Generate PNG Icons

### Option 1: Online Converter (Easiest)

1. Go to [Convertio](https://convertio.co/svg-png/) or [CloudConvert](https://cloudconvert.com/svg-to-png)
2. Upload `frontend/public/icon.svg`
3. Set output size to **192x192** for the first conversion
4. Download and save as `frontend/public/icon-192.png`
5. Repeat with size **512x512** and save as `frontend/public/icon-512.png`

### Option 2: ImageMagick

If you have ImageMagick installed:

```bash
cd frontend
convert -background none -resize 192x192 public/icon.svg public/icon-192.png
convert -background none -resize 512x512 public/icon.svg public/icon-512.png
```

Install ImageMagick:
- macOS: `brew install imagemagick`
- Linux: `sudo apt-get install imagemagick`
- Windows: Download from [ImageMagick website](https://imagemagick.org/script/download.php)

### Option 3: Using Sharp (Node.js)

1. Install sharp: `npm install --save-dev sharp`
2. Create a script using sharp to convert SVG to PNG

## Testing PWA Installation

After generating the PNG icons:

1. Build the app: `npm run build`
2. Start the server: `npm start`
3. Open in mobile browser (Safari on iOS or Chrome on Android)
4. Use "Add to Home Screen" option
5. The app icon should appear with the new design

## Icon Design

The icon features:
- Background: `#faf9f6` (off-white)
- Water waves at the bottom (blue tones)
- Upward-trending chart line with data points (red/orange)
- Subtle grid lines

This matches the app's aesthetic and clearly represents water data visualization.

