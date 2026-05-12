// pages/api/download.js
// Proxies file downloads with Content-Disposition header for native iOS downloads

export default async function handler(req, res) {
  const { url, name } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  
  try {
    const response = await fetch(decodeURIComponent(url));
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch file' });
    }
    
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');
    const fileName = name || 'download';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
}

export const config = {
  api: {
    responseLimit: false,
  },
};
