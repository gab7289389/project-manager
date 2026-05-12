// Stream upload to Bunny CDN - handles large files
export const config = {
  api: {
    bodyParser: false, // Disable body parsing to handle raw stream
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'dxtr-staging';
  const BUNNY_API_KEY = process.env.BUNNY_API_KEY;
  const BUNNY_HOSTNAME = 'syd.storage.bunnycdn.com';

  if (!BUNNY_API_KEY) {
    return res.status(500).json({ error: 'Bunny CDN not configured' });
  }

  try {
    const fileName = decodeURIComponent(req.headers['x-file-name'] || '');
    
    if (!fileName) {
      return res.status(400).json({ error: 'Missing file name' });
    }

    const bunnyUrl = `https://${BUNNY_HOSTNAME}/${BUNNY_STORAGE_ZONE}/uploads/${fileName}`;

    // Collect the request body chunks
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    // Upload to Bunny CDN
    const response = await fetch(bunnyUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': BUNNY_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: fileBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bunny upload error:', response.status, errorText);
      return res.status(500).json({ error: `Upload failed: ${response.status}` });
    }

    const publicUrl = `https://${BUNNY_STORAGE_ZONE}.b-cdn.net/uploads/${fileName}`;

    return res.status(200).json({ 
      success: true, 
      url: publicUrl,
      fileName: fileName.split('/').pop()
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message || 'Upload failed' });
  }
}
