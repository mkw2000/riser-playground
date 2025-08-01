# Vector Express API Integration

This integration uses the Vector Express API to convert SVG diagrams to DXF format for better CAD compatibility.

## Setup Options

### Option 1: Vercel Deployment (Recommended)

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy to Vercel:
```bash
vercel
```

3. Follow the prompts and your app will be deployed with the API function automatically configured.

The Vercel function at `/api/convert-svg-to-dxf` handles all the Vector Express API calls without CORS issues.

### Option 2: Local Development with Vercel

For local testing with Vercel functions:
```bash
vercel dev
```

This will run the app locally with the serverless functions available.

### Option 3: Local Development Server (Alternative)

1. Install dependencies for the proxy server:
```bash
# Using the proxy package.json
cp proxy-package.json package-proxy.json
cd /path/to/proxy && npm install --package-lock-only
```

2. Start the proxy server:
```bash
node vector-express-proxy.js
```

The proxy server will run on `http://localhost:3001`

### Option 2: VPS Deployment

1. Upload the proxy server files to your VPS:
   - `vector-express-proxy.js`
   - `proxy-package.json` (rename to `package.json`)

2. SSH into your VPS and install dependencies:
```bash
npm install
```

3. Start the server (consider using PM2 for production):
```bash
# Development
npm start

# Production with PM2
npm install -g pm2
pm2 start vector-express-proxy.js --name "vector-express-proxy"
pm2 startup
pm2 save
```

4. Update the frontend code to use your VPS URL instead of localhost:

In `src/App.tsx`, change line ~687:
```javascript
const proxyUrl = 'https://your-vps-domain.com/api/convert-svg-to-dxf';
```

And line ~691:
```javascript
const healthCheck = await fetch('https://your-vps-domain.com/health');
```

### Option 3: Manual Conversion

If no proxy server is available, the app will:
1. Download the SVG file
2. Show instructions to manually upload to https://vector.express

## How It Works

1. **SVG Generation**: The app generates a clean SVG from the current diagram
2. **Proxy Request**: Sends the SVG to the proxy server
3. **Vector Express API**: The proxy server:
   - Gets conversion options from Vector Express
   - Uploads the SVG file for conversion
   - Downloads the converted DXF file
   - Returns it to the frontend
4. **File Download**: The converted DXF file is automatically downloaded

## Benefits over Legacy DXF Export

- **Better Compatibility**: Vector Express uses professional conversion tools
- **SVG-based**: Works with the actual rendered diagram
- **Multiple Conversion Options**: Can try different converters if one fails
- **Maintained Service**: Vector Express is actively maintained

## Troubleshooting

### CORS Errors
- Ensure the proxy server is running
- Check that the frontend URL matches the proxy server URL

### Conversion Failures
- Try the legacy DXF export as fallback
- Check the proxy server logs for errors
- Verify the SVG file is valid

### File Size Issues
- Vector Express may have file size limits
- Consider optimizing the SVG if it's very large