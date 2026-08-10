import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  supabase,
  isChunkedFile,
  downloadChunkedFile,
  fetchFileAsBlob,
  triggerBlobDownload,
} from '../../lib/supabase';
import JSZip from 'jszip';

// Download Button
function DownloadButton({ file }) {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const isChunked = isChunkedFile(file.url);
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const handleClick = async () => {
    if (isChunked) {
      // Chunked file - reassembled in the browser (streamed to disk where
      // supported, combined in memory otherwise).
      setStatus('downloading');
      setProgress(0);
      setErrorMessage(null);

      try {
        const result = await downloadChunkedFile(file.url, (percent, spd) => {
          setProgress(percent);
          setSpeed(spd);
        });

        if (result?.cancelled) {
          setStatus('idle');
          setProgress(0);
          return;
        }

        setStatus('done');
        if (isMobile) setShowPopup(true);
        setTimeout(() => { setStatus('idle'); setProgress(0); }, 3000);
      } catch (error) {
        console.error('Download failed:', error);
        setErrorMessage(error.message);
        setStatus('error');
        setTimeout(() => { setStatus('idle'); setErrorMessage(null); }, 8000);
      }
    } else {
      // Regular file - direct download
      setStatus('downloading');
      
      // Use iframe for download to prevent preview
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = file.url;
      document.body.appendChild(iframe);
      
      setTimeout(() => {
        setStatus('done');
        if (isMobile) setShowPopup(true);
        document.body.removeChild(iframe);
        setTimeout(() => setStatus('idle'), 3000);
      }, 1500);
    }
  };
  
  const closePopup = () => {
    setShowPopup(false);
    setStatus('idle');
  };
  
  const formatSpeed = (bytesPerSec) => {
    if (bytesPerSec > 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
    if (bytesPerSec > 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
    return `${bytesPerSec.toFixed(0)} B/s`;
  };
  
  return (
    <>
      <button
        onClick={handleClick}
        disabled={status === 'downloading'}
        className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
          status === 'done' 
            ? 'bg-green-50 border-green-300' 
            : status === 'error'
            ? 'bg-red-50 border-red-300'
            : status === 'downloading'
            ? 'bg-blue-50 border-blue-300'
            : 'bg-white border-gray-200 hover:border-gray-300 active:bg-gray-50'
        }`}
      >
        <div className="flex-1 mr-4 text-left">
          <span className="text-sm text-gray-700 truncate block">{file.name}</span>
          {status === 'downloading' && progress > 0 && (
            <div className="mt-2">
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs text-gray-500 mt-1 block">{progress}% • {formatSpeed(speed)}</span>
            </div>
          )}
          {status === 'error' && errorMessage && (
            <span className="text-xs text-red-600 mt-1 block">{errorMessage}</span>
          )}
        </div>
        <span className="text-sm font-semibold whitespace-nowrap">
          {status === 'idle' && <span className="text-black">Download ↓</span>}
          {status === 'downloading' && <span className="text-blue-600">{progress > 0 ? `${progress}%` : 'Starting...'}</span>}
          {status === 'done' && <span className="text-green-600">✓ Done</span>}
          {status === 'error' && <span className="text-red-600">Failed</span>}
        </span>
      </button>
      
      {/* Mobile popup notification */}
      {showPopup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closePopup}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-4">✓</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Download Complete</h3>
            <p className="text-gray-500 mb-6">Check your Downloads folder.</p>
            <button 
              onClick={closePopup}
              className="w-full bg-black text-white py-3 rounded-xl font-medium"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Project Card Component
function ProjectCard({ project, expanded, onToggle }) {
  const [downloading, setDownloading] = useState(false);
  
  // Get client tasks with files
  const clientTasks = project.tasks?.filter(t => 
    t.is_client_task && (t.file_url || (t.files && t.files.length > 0))
  ) || [];
  
  const totalFiles = clientTasks.reduce((sum, t) => {
    if (t.files && t.files.length > 0) return sum + t.files.length;
    if (t.file_url) return sum + 1;
    return sum;
  }, 0);

  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();

      // Flatten every deliverable into one list of {path, url} to zip.
      const entries = clientTasks.flatMap(task => {
        const label = task.text.replace('Submit ', '').replace(' to client', '');
        if (task.files && task.files.length > 0) {
          return task.files.map(f => ({ path: `${label}/${f.name}`, url: f.url, name: f.name }));
        }
        if (task.file_url) {
          const name = task.file_name || 'file';
          return [{ path: `${label}/${name}`, url: task.file_url, name }];
        }
        return [];
      });

      // Chunked files must be reassembled first - fetching their URL directly
      // returns a 404, which previously left them silently missing from the ZIP.
      const failed = [];
      for (const entry of entries) {
        try {
          zip.file(entry.path, await fetchFileAsBlob(entry.url));
        } catch (e) {
          console.error('Failed to download:', entry.name, e);
          failed.push(entry.name);
        }
      }

      if (failed.length === entries.length) {
        alert('Download failed. Please try downloading the files individually.');
        return;
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      triggerBlobDownload(blob, `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}.zip`);

      if (failed.length > 0) {
        alert(
          `${failed.length} file${failed.length > 1 ? 's were' : ' was'} too large to include in the ZIP ` +
          `(${failed.join(', ')}). Please download ${failed.length > 1 ? 'them' : 'it'} individually.`
        );
      }
    } catch (e) {
      console.error('Download failed:', e);
      alert('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (totalFiles === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-lg">
            📁
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">{project.name}</h3>
            <p className="text-sm text-gray-500">{totalFiles} file{totalFiles !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <span className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      
      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Individual file downloads */}
          <div className="p-4 space-y-3">
            {clientTasks.map(task => {
              const label = task.text.replace('Submit ', '').replace(' to client', '');
              const files = task.files && task.files.length > 0 
                ? task.files 
                : task.file_url ? [{ name: task.file_name || 'File', url: task.file_url }] : [];
              
              return (
                <div key={task.id} className="bg-gray-50 rounded-xl p-4">
                  <p className="font-medium text-gray-900 mb-3">{label}</p>
                  <div className="space-y-2">
                    {files.map((file, idx) => (
                      <DownloadButton key={idx} file={file} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Download all button */}
          {totalFiles > 1 && (
            <div className="px-4 pb-4">
              <button
                onClick={handleDownloadAll}
                disabled={downloading}
                className="w-full bg-black text-white py-3 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {downloading ? 'Creating ZIP...' : `Download All (${totalFiles} files)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Main Dashboard Component
export default function ClientDashboard() {
  const router = useRouter();
  const { token } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [client, setClient] = useState(null);
  const [projects, setProjects] = useState([]);
  const [expandedProject, setExpandedProject] = useState(null);
  
  useEffect(() => {
    if (!token) return;
    loadDashboard();
  }, [token]);
  
  const loadDashboard = async () => {
    try {
      setLoading(true);
      
      // Get client by dashboard token
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('dashboard_token', token)
        .single();
      
      if (clientError || !clientData) {
        setError('Invalid or expired link');
        return;
      }
      
      setClient(clientData);
      
      // Get all projects for this client
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select(`*, tasks(*)`)
        .eq('client_id', clientData.id)
        .order('created_at', { ascending: false });
      
      if (projectsError) throw projectsError;
      
      // Filter to only projects with files ready
      const projectsWithFiles = (projectsData || []).filter(p => 
        p.tasks?.some(t => t.is_client_task && (t.file_url || (t.files && t.files.length > 0)))
      );
      
      setProjects(projectsWithFiles);
      
      // Auto-expand first project if only one
      if (projectsWithFiles.length === 1) {
        setExpandedProject(projectsWithFiles[0].id);
      }
      
    } catch (e) {
      console.error('Dashboard error:', e);
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin text-3xl">⏳</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <Head>
        <title>Your Files | DXTR</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              {/* Logo - add your logo.png to /public folder */}
              <img 
                src="/logo.png" 
                alt="DXTR" 
                className="h-10 w-auto"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="w-10 h-10 bg-black rounded-xl items-center justify-center text-white font-bold hidden">
                D
              </div>
              <div>
                <h1 className="font-semibold text-gray-900">Hi {client?.name?.split(' ')[0]}</h1>
                <p className="text-sm text-gray-500">Your files are ready</p>
              </div>
            </div>
          </div>
        </header>
        
        {/* Main content */}
        <main className="max-w-2xl mx-auto px-4 py-8 pb-24">
          {projects.length > 0 ? (
            <div className="space-y-4">
              {projects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  expanded={expandedProject === project.id}
                  onToggle={() => setExpandedProject(
                    expandedProject === project.id ? null : project.id
                  )}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">📭</div>
              <p className="text-gray-500">No files ready yet</p>
            </div>
          )}
        </main>
        
        {/* Footer */}
        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-4">
          <p className="text-center text-sm text-gray-400">Powered by DXTR</p>
        </footer>
      </div>
    </>
  );
}
