// pages/api/upload-chunk.js
// Streams chunks directly to Bunny Storage

export const config = {
  api: {
    bodyParser: false, // Disable body parsing to handle raw stream
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Upload-Id, X-File-Name, X-Chunk-Index, X-Total-Chunks');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const uploadId = req.headers['x-upload-id'];
    const fileName = decodeURIComponent(req.headers['x-file-name'] || '');
    const chunkIndex = req.headers['x-chunk-index'] || '0';
    const totalChunks = req.headers['x-total-chunks'] || '1';
    
    if (!uploadId || !fileName) {
      return res.status(400).json({ error: 'Missing uploadId or fileName' });
    }
    
    // Collect body chunks
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    
    // Upload to Bunny Storage
    const chunkFileName = `${fileName}.chunk${chunkIndex}`;
    const storageUrl = `https://${STORAGE_HOST}/${STORAGE_ZONE}/${chunkFileName}`;
    
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
      return res.status(500).json({ error: 'Chunk upload failed', details: errorText });
    }
    
    return res.status(200).json({
      success: true,
      chunkIndex: parseInt(chunkIndex),
      totalChunks: parseInt(totalChunks),
      url: `${CDN_URL}/${chunkFileName}`
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message });
  }
}
