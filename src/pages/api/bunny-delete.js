// Delete file from Bunny CDN Storage
export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'Missing filePath' });
    }

    const storageZone = process.env.BUNNY_STORAGE_ZONE;
    const apiKey = process.env.BUNNY_API_KEY;
    const region = 'syd'; // Sydney region

    if (!storageZone || !apiKey) {
      return res.status(500).json({ error: 'Bunny CDN not configured' });
    }

    // Extract path from full URL if needed
    let path = filePath;
    if (filePath.includes('.b-cdn.net/')) {
      path = filePath.split('.b-cdn.net/')[1];
    }

    const deleteUrl = `https://${region}.storage.bunnycdn.com/${storageZone}/${path}`;

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'AccessKey': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bunny delete error:', errorText);
      return res.status(500).json({ error: 'Delete failed', details: errorText });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({ error: error.message });
  }
}
