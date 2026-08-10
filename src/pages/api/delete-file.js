// pages/api/delete-file.js
// Delete file from Bunny Storage

const BUNNY_API_KEY = process.env.BUNNY_API_KEY;
const STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'dxtr-staging';
const STORAGE_HOST = 'syd.storage.bunnycdn.com';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    let filePath = req.body?.filePath || '';
    
    if (filePath.startsWith('http')) {
      filePath = new URL(filePath).pathname.replace(/^\//, '');
    }
    
    if (!filePath) {
      return res.status(400).json({ error: 'Missing filePath' });
    }
    
    const storageUrl = `https://${STORAGE_HOST}/${STORAGE_ZONE}/${filePath}`;
    
    await fetch(storageUrl, {
      method: 'DELETE',
      headers: { 'AccessKey': BUNNY_API_KEY },
    });
    
    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({ error: error.message });
  }
}
