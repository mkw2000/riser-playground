export default async function handler(req, res) {
  console.log('API handler called');
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', method: req.method });
  }

  try {
    // Parse the incoming SVG data
    const { svg } = req.body;
    
    if (!svg) {
      return res.status(400).json({ error: 'No SVG data provided' });
    }

    console.log('Received SVG data, size:', svg.length);

    // Step 1: Get conversion options from Vector Express
    const optionsResponse = await fetch('https://vector.express/api/v2/public/convert/svg/auto/dxf');
    const optionsData = await optionsResponse.json();
    
    console.log('Available conversion options:', optionsData);

    if (!optionsData?.alternatives || optionsData.alternatives.length === 0) {
      return res.status(500).json({ error: 'No conversion options available' });
    }

    // Step 2: Choose the best converter (prefer svg2cad with shortest path)
    const bestOption = optionsData.alternatives.find(alt => 
      alt.path.includes('svg2cad') && alt.length === 1
    ) || optionsData.alternatives[0];
    
    const convertEndpoint = `https://vector.express${bestOption.path}`;
    
    console.log('Using converter path:', bestOption.path);

    // Step 3: Create form data for the conversion
    const formData = new FormData();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    formData.append('file', blob, 'diagram.svg');

    // Step 4: Convert the file
    const convertResponse = await fetch(convertEndpoint, {
      method: 'POST',
      body: formData
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

    // Step 5: Download the converted file
    const downloadUrl = `https://vector.express/api/v2/public/files/${convertResult.id}`;
    const downloadResponse = await fetch(downloadUrl);

    if (!downloadResponse.ok) {
      console.error('Download failed:', downloadResponse.status);
      return res.status(500).json({ error: 'Failed to download converted file' });
    }

    // Get the DXF content
    const dxfBuffer = await downloadResponse.arrayBuffer();
    const dxfBase64 = Buffer.from(dxfBuffer).toString('base64');

    // Return the DXF file as base64
    res.status(200).json({
      success: true,
      dxf: dxfBase64,
      filename: 'converted.dxf',
      converter: bestOption.path
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
}