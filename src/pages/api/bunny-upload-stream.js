// Edge function for large file uploads to Bunny CDN
// Edge functions have better streaming support than serverless

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'dxtr-staging';
  const BUNNY_API_KEY = process.env.BUNNY_API_KEY;
  const BUNNY_HOSTNAME = 'syd.storage.bunnycdn.com';

  if (!BUNNY_API_KEY) {
    return new Response(JSON.stringify({ error: 'Bunny CDN not configured' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const fileName = decodeURIComponent(req.headers.get('x-file-name') || '');
    
    if (!fileName) {
      return new Response(JSON.stringify({ error: 'Missing file name' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const bunnyUrl = `https://${BUNNY_HOSTNAME}/${BUNNY_STORAGE_ZONE}/uploads/${fileName}`;

    // Stream the request body directly to Bunny
    const response = await fetch(bunnyUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': BUNNY_API_KEY,
        'Content-Type': req.headers.get('content-type') || 'application/octet-stream',
      },
      body: req.body,
      duplex: 'half',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bunny upload error:', response.status, errorText);
      return new Response(JSON.stringify({ error: `Upload failed: ${response.status}` }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const publicUrl = `https://${BUNNY_STORAGE_ZONE}.b-cdn.net/uploads/${fileName}`;

    return new Response(JSON.stringify({ 
      success: true, 
      url: publicUrl,
      fileName: fileName.split('/').pop()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Upload failed' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
