import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getMagicLink, markMagicLinkAccessed } from '../../lib/supabase';

export default function DownloadPage() {
  const router = useRouter();
  const { token } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [downloaded, setDownloaded] = useState({});
  const [downloading, setDownloading] = useState({});

  useEffect(() => {
    if (!token) return;
    
    async function loadData() {
      try {
        const result = await getMagicLink(token);
        
        if (!result || !result.valid) {
          setError('This link has expired or is invalid.');
          return;
        }
        
        setData(result);
        await markMagicLinkAccessed(token);
      } catch (err) {
        console.error(err);
        setError('Something went wrong. Please contact support.');
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [token]);

  // Force download by fetching blob and triggering download
  const handleDownload = async (file) => {
    setDownloading(prev => ({ ...prev, [file.id]: true }));
    
    try {
      // Fetch the file as blob to force download
      const response = await fetch(file.url);
      const blob = await response.blob();
      
      // Create blob URL and trigger download
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = file.name || 'download';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
      }, 100);
      
      setDownloaded(prev => ({ ...prev, [file.id]: true }));
    } catch (err) {
      console.error('Download error:', err);
      // Fallback to direct link
      const a = document.createElement('a');
      a.href = file.url;
      a.download = file.name || 'download';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setDownloaded(prev => ({ ...prev, [file.id]: true }));
    } finally {
      setDownloading(prev => ({ ...prev, [file.id]: false }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-500">Loading your files...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Link Expired</h1>
          <p className="text-gray-500">{error}</p>
          <p className="text-sm text-gray-400 mt-4">Contact <a href="mailto:contact@dxtr.au" className="text-purple-600">contact@dxtr.au</a> for a new link</p>
        </div>
      </div>
    );
  }

  const readyFiles = data?.files?.filter(f => f.url) || [];
  const pendingFiles = data?.files?.filter(f => !f.url) || [];
  const allDownloaded = readyFiles.length > 0 && readyFiles.every(f => downloaded[f.id]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-700 to-purple-900 text-white py-8 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-4xl mb-3">📁</div>
          <h1 className="text-2xl font-bold mb-2">Your Files Are Ready</h1>
          <p className="text-purple-200">Hi {data?.client_name}!</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto p-4 -mt-6">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Project info */}
          <div className="p-4 sm:p-6 border-b">
            <p className="text-sm text-gray-500 mb-1">Project</p>
            <p className="font-semibold text-lg">{data?.project_name}</p>
          </div>

          {/* Ready files */}
          {readyFiles.length > 0 && (
            <div className="p-4 sm:p-6">
              <h2 className="font-semibold mb-4">✅ Ready for Download ({readyFiles.length})</h2>

              <div className="space-y-3">
                {readyFiles.map(file => (
                  <div
                    key={file.id}
                    className={`p-4 rounded-xl border-2 ${
                      downloaded[file.id] 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        downloaded[file.id] ? 'bg-green-100 text-green-600' : 'bg-purple-100 text-purple-600'
                      }`}>
                        {downloaded[file.id] ? '✓' : '📄'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{file.type}</p>
                        <p className="text-xs text-gray-500 truncate">{file.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(file)}
                      disabled={downloading[file.id]}
                      className={`w-full py-3 rounded-lg text-sm font-medium transition-colors ${
                        downloading[file.id]
                          ? 'bg-purple-200 text-purple-600'
                          : downloaded[file.id]
                          ? 'bg-green-100 text-green-700'
                          : 'bg-purple-600 text-white hover:bg-purple-700 active:bg-purple-800'
                      }`}
                    >
                      {downloading[file.id] ? '⏳ Downloading...' : downloaded[file.id] ? '✓ Downloaded' : '📥 Download'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending files section */}
          {pendingFiles.length > 0 && (
            <div className="p-4 sm:p-6 border-t bg-gray-50">
              <h2 className="font-semibold mb-4 text-gray-600">⏳ Still in Progress ({pendingFiles.length})</h2>
              <div className="space-y-2">
                {pendingFiles.map((file, i) => (
                  <div key={i} className="p-3 rounded-lg border-2 border-dashed border-gray-300 bg-white">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                        🔄
                      </div>
                      <div>
                        <p className="font-medium text-gray-500">{file.type}</p>
                        <p className="text-xs text-gray-400">Coming soon - we'll email you when ready</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success message */}
          {allDownloaded && (
            <div className="p-6 bg-green-50 border-t border-green-200">
              <div className="text-center">
                <div className="text-4xl mb-2">🎉</div>
                <p className="font-semibold text-green-800">All files downloaded!</p>
                <p className="text-sm text-green-600">Thank you for your business.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-400 text-sm mt-6">
          This link expires in 7 days • Questions? Contact <a href="mailto:contact@dxtr.au" className="text-purple-600">contact@dxtr.au</a>
        </p>
      </div>
    </div>
  );
}
