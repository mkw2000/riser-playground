# DXF Export Options

Since Vector Express has file size limits on their free tier, here are the available export options:

## 1. Client-Side DXF Export (NEW - Recommended)
**Button: "Export to DXF" (Green)**
- ✅ No file size limits
- ✅ Works offline
- ✅ No API keys needed
- ✅ Instant conversion
- ⚠️  Basic DXF output (may need tweaking for some CAD programs)

This uses a JavaScript converter that runs entirely in your browser.

## 2. Vector Express API
**Button: "Export (Vector Express)" (Yellow)**
- ✅ Professional conversion quality
- ❌ 4KB file size limit on free tier
- ❌ Requires internet connection
- Good for small diagrams only

## 3. Legacy Direct Export
**Button: "Export (Legacy)" (Gray)**
- ✅ No file size limits
- ⚠️  Basic block-based DXF format
- ⚠️  May have compatibility issues

## Alternative: CloudConvert API

If you need professional-quality conversion with no size limits:

1. Sign up for a free CloudConvert account at https://cloudconvert.com
2. Get your API key from the dashboard
3. Add to Vercel environment variables:
   ```
   CLOUDCONVERT_API_KEY=your-api-key-here
   ```
4. Use the CloudConvert endpoint instead: `/api/convert-svg-to-dxf-cloudconvert`

CloudConvert offers 25 free conversions per day with no file size limits.

## Other Options

### Self-Hosted Conversion
If you have a VPS, you can install:
- **Inkscape** with command line: `inkscape input.svg --export-type=dxf --export-filename=output.dxf`
- **LibreCAD** tools
- **QCAD** command line utilities

### Manual Conversion Services
- https://cloudconvert.com (web interface)
- https://convertio.co/svg-dxf/
- https://onlineconvertfree.com/convert/svg-to-dxf/

## Recommendation

Try the **"Export to DXF"** button first (green button). It should work for most fire riser diagrams and has no limitations.