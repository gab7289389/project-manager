// pages/api/upload.js
// Simple file upload to Bunny Storage

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const BUNNY_API_KEY = process.env.BUNNY_API_KEY;
const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'dxtr-staging';
const STORAGE_HOST = 'syd.storage.bunnycdn.com';
const CDN_URL = process.env.NEXT_PUBLIC_BUNNY_CDN_URL || 'https://dxtr-staging.b-cdn.net';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const fileName = decodeURIComponent(req.headers['x-file-name'] || `upload-${Date.now()}`);
    
    // Collect body chunks
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    
    // Upload to Bunny Storage
    const storageUrl = `https://${STORAGE_HOST}/${STORAGE_ZONE}/${fileName}`;
    
    const uploadResponse = await fetch(storageUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': BUNNY_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: body,
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Bunny upload failed:', errorText);
      return res.status(500).json({ error: 'Upload failed', details: errorText });
    }
    
    return res.status(200).json({
      success: true,
      url: `${CDN_URL}/${fileName}`
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message });
  }
}
