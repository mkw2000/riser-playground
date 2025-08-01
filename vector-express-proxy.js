const express = require('express');
const cors = require('cors');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const app = express();

// Enable CORS for frontend
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Vector Express API proxy endpoint
app.post('/api/convert-svg-to-dxf', upload.single('svg'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No SVG file provided' });
    }

    console.log('Received SVG file:', req.file.originalname, 'Size:', req.file.size);

    // Step 1: Get conversion options
    const optionsResponse = await fetch('https://vector.express/api/v2/public/convert/svg/auto/dxf');
    const options = await optionsResponse.json();
    
    console.log('Available conversion options:', options);

    if (!options || options.length === 0) {
      return res.status(500).json({ error: 'No conversion options available' });
    }

    // Step 2: Choose the first available converter (usually svg2cad)
    const converter = options[0];
    const convertEndpoint = `https://vector.express/api/v2/public/convert/svg/${converter.prog}/dxf`;
    
    console.log('Using converter:', converter.prog, 'Endpoint:', convertEndpoint);

    // Step 3: Convert the file
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const convertResponse = await fetch(convertEndpoint, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    if (!convertResponse.ok) {
      const errorText = await convertResponse.text();
      console.error('Conversion failed:', convertResponse.status, errorText);
      return res.status(500).json({ 
        error: 'Conversion failed', 
        details: errorText,
        status: convertResponse.status 
      });
    }

    const convertResult = await convertResponse.json();
    console.log('Conversion result:', convertResult);

    if (!convertResult.id) {
      return res.status(500).json({ error: 'No file ID returned from conversion' });
    }

    // Step 4: Download the converted file
    const downloadUrl = `https://vector.express/api/v2/public/files/${convertResult.id}`;
    const downloadResponse = await fetch(downloadUrl);

    if (!downloadResponse.ok) {
      console.error('Download failed:', downloadResponse.status);
      return res.status(500).json({ error: 'Failed to download converted file' });
    }

    // Return the DXF file
    const dxfBuffer = await downloadResponse.buffer();
    
    res.set({
      'Content-Type': 'application/dxf',
      'Content-Disposition': 'attachment; filename="converted.dxf"',
      'Content-Length': dxfBuffer.length
    });

    res.send(dxfBuffer);

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Vector Express Proxy' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Vector Express proxy server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Convert endpoint: http://localhost:${PORT}/api/convert-svg-to-dxf`);
});