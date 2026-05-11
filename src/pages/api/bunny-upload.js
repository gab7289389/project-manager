// Upload file to Bunny CDN Storage
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileName, fileData, folder } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'Missing fileName or fileData' });
    }

    const storageZone = process.env.BUNNY_STORAGE_ZONE;
    const apiKey = process.env.BUNNY_API_KEY;
    const region = 'syd'; // Sydney region

    if (!storageZone || !apiKey) {
      return res.status(500).json({ error: 'Bunny CDN not configured' });
    }

    // Convert base64 to buffer
    const base64Data = fileData.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Build the path: /storage-zone/folder/filename
    const filePath = folder ? `${folder}/${fileName}` : fileName;
    const uploadUrl = `https://${region}.storage.bunnycdn.com/${storageZone}/${filePath}`;

    // Upload to Bunny
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': apiKey,
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bunny upload error:', errorText);
      return res.status(500).json({ error: 'Upload failed', details: errorText });
    }

    // Return the public URL
    // Format: https://storage-zone.b-cdn.net/folder/filename
    const publicUrl = `https://${storageZone}.b-cdn.net/${filePath}`;

    return res.status(200).json({ 
      success: true, 
      url: publicUrl,
      fileName: fileName 
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Increase body size limit for large files
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb',
    },
  },
};
