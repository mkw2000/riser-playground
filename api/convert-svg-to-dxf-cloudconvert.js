export default async function handler(req, res) {
  console.log('CloudConvert API handler called');
  
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
    const { svg } = req.body;
    
    if (!svg) {
      return res.status(400).json({ error: 'No SVG data provided' });
    }

    console.log('Received SVG data, size:', svg.length);

    // CloudConvert requires an API key
    const CLOUDCONVERT_API_KEY = process.env.CLOUDCONVERT_API_KEY;
    
    if (!CLOUDCONVERT_API_KEY) {
      console.log('No CloudConvert API key configured');
      return res.status(500).json({ 
        error: 'CloudConvert API key not configured',
        details: 'Please set CLOUDCONVERT_API_KEY environment variable in Vercel'
      });
    }

    // Step 1: Create a job
    const jobResponse = await fetch('https://api.cloudconvert.com/v2/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDCONVERT_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tasks: {
          'import-my-file': {
            operation: 'import/raw',
            file: svg,
            filename: 'diagram.svg'
          },
          'convert-my-file': {
            operation: 'convert',
            input: 'import-my-file',
            output_format: 'dxf',
            some_other_option: 'value'
          },
          'export-my-file': {
            operation: 'export/url',
            input: 'convert-my-file'
          }
        }
      })
    });

    if (!jobResponse.ok) {
      const error = await jobResponse.json();
      console.error('CloudConvert job creation failed:', error);
      return res.status(500).json({ 
        error: 'CloudConvert job creation failed',
        details: error.message || 'Unknown error'
      });
    }

    const job = await jobResponse.json();
    console.log('Job created:', job.data.id);

    // Step 2: Wait for the job to complete
    let jobStatus = job.data;
    const maxAttempts = 30; // 30 seconds timeout
    let attempts = 0;

    while (jobStatus.status !== 'finished' && jobStatus.status !== 'error' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const statusResponse = await fetch(`https://api.cloudconvert.com/v2/jobs/${job.data.id}`, {
        headers: {
          'Authorization': `Bearer ${CLOUDCONVERT_API_KEY}`
        }
      });
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        jobStatus = statusData.data;
        console.log(`Job status: ${jobStatus.status} (attempt ${attempts + 1})`);
      }
      
      attempts++;
    }

    if (jobStatus.status === 'error') {
      console.error('Conversion failed:', jobStatus);
      return res.status(500).json({ 
        error: 'Conversion failed',
        details: jobStatus.message || 'Unknown error'
      });
    }

    if (jobStatus.status !== 'finished') {
      return res.status(500).json({ 
        error: 'Conversion timeout',
        details: 'The conversion took too long to complete'
      });
    }

    // Step 3: Get the export URL
    const exportTask = jobStatus.tasks.find(task => task.name === 'export-my-file');
    if (!exportTask || !exportTask.result?.files?.[0]?.url) {
      return res.status(500).json({ 
        error: 'No output file found',
        details: 'The conversion completed but no file was generated'
      });
    }

    const fileUrl = exportTask.result.files[0].url;
    
    // Step 4: Download the file
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      return res.status(500).json({ error: 'Failed to download converted file' });
    }

    const dxfBuffer = await fileResponse.arrayBuffer();
    const dxfBase64 = Buffer.from(dxfBuffer).toString('base64');

    // Return the DXF file as base64
    res.status(200).json({
      success: true,
      dxf: dxfBase64,
      filename: 'converted.dxf',
      converter: 'cloudconvert'
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: error.message 
    });
  }
}