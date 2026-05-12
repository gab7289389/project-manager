import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../lib/supabase';
import JSZip from 'jszip';

// Format file size
function formatBytes(bytes) {
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// File type detection
function getFileType(url, name) {
  const ext = (name || url || '').split('.').pop()?.toLowerCase();
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
  const videoExts = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'];
  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  return 'file';
}

// Preview Modal Component
function PreviewModal({ file, onClose, onNext, onPrev, hasNext, hasPrev }) {
  const fileType = getFileType(file.url, file.name);
  
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && hasNext) onNext();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, onNext, onPrev, hasNext, hasPrev]);
  
  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Close button */}
      <button onClick={onClose} className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300 z-50">×</button>
      
      {/* Navigation arrows */}
      {hasPrev && (
        <button 
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 p-4"
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button 
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 p-4"
        >
          ›
        </button>
      )}
      
      {/* Content */}
      <div className="max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {fileType === 'image' ? (
          <img src={file.url} alt={file.name} className="max-w-full max-h-[85vh] object-contain" />
        ) : fileType === 'video' ? (
          <video src={file.url} controls autoPlay className="max-w-full max-h-[85vh]" />
        ) : (
          <div className="bg-white rounded-lg p-8 text-center">
            <p className="text-6xl mb-4">📄</p>
            <p className="text-lg font-medium">{file.name}</p>
            <a href={file.url} download className="mt-4 inline-block bg-black text-white px-6 py-2 rounded-lg">
              Download
            </a>
          </div>
        )}
      </div>
      
      {/* File name */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-4 py-2 rounded-full">
        {file.name}
      </div>
    </div>
  );
}

// File Grid Component
function FileGrid({ files, title, onPreview }) {
  if (!files || files.length === 0) return null;
  
  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">{title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {files.map((file, idx) => {
          const fileType = getFileType(file.url, file.name);
          return (
            <div 
              key={idx}
              onClick={() => onPreview(idx)}
              className="aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-black transition-all group relative"
            >
              {fileType === 'image' ? (
                <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
              ) : fileType === 'video' ? (
                <div className="w-full h-full relative">
                  <video src={file.url} className="w-full h-full object-cover" muted />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <span className="text-white text-4xl">▶</span>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-4xl">📄</span>
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end">
                <p className="w-full text-white text-xs p-2 truncate opacity-0 group-hover:opacity-100 bg-gradient-to-t from-black/70 to-transparent">
                  {file.name}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Project Card Component
function ProjectCard({ project, onViewFiles }) {
  const completedTasks = project.tasks?.filter(t => t.completed) || [];
  const totalTasks = project.tasks?.length || 0;
  const clientTasks = project.tasks?.filter(t => t.is_client_task && (t.file_url || (t.files && t.files.length > 0))) || [];
  const totalFiles = clientTasks.reduce((sum, t) => {
    if (t.files && t.files.length > 0) return sum + t.files.length;
    if (t.file_url) return sum + 1;
    return sum;
  }, 0);
  
  const isComplete = project.status === 'completed';
  const isRevision = project.status === 'revision';
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-xl font-semibold text-gray-900">{project.name}</h3>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            isComplete ? 'bg-green-100 text-green-700' : 
            isRevision ? 'bg-amber-100 text-amber-700' : 
            'bg-blue-100 text-blue-700'
          }`}>
            {isComplete ? 'Completed' : isRevision ? 'In Revision' : 'In Progress'}
          </span>
        </div>
        <p className="text-gray-500 text-sm">{project.services?.join(' • ')}</p>
      </div>
      
      {/* Stats */}
      <div className="px-6 py-4 bg-gray-50 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{totalFiles}</span> files ready
        </div>
        <div className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{completedTasks.length}/{totalTasks}</span> tasks done
        </div>
      </div>
      
      {/* Actions */}
      {totalFiles > 0 && (
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={() => onViewFiles(project)}
            className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            View & Download Files
          </button>
        </div>
      )}
    </div>
  );
}

// Project Files View Component
function ProjectFilesView({ project, onBack, onDownloadAll }) {
  const [previewIndex, setPreviewIndex] = useState(null);
  const [downloading, setDownloading] = useState(false);
  
  // Group files by task/type
  const fileGroups = {};
  project.tasks?.filter(t => t.is_client_task).forEach(task => {
    const label = task.text.replace('Submit ', '').replace(' to client', '');
    const files = [];
    
    // Support both old single file and new multi-file format
    if (task.files && task.files.length > 0) {
      files.push(...task.files);
    } else if (task.file_url && task.file_url !== 'uploading') {
      files.push({ name: task.file_name || 'File', url: task.file_url });
    }
    
    if (files.length > 0) {
      fileGroups[label] = files;
    }
  });
  
  // Flatten for navigation
  const allFiles = Object.values(fileGroups).flat();
  
  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();
      
      for (const [groupName, files] of Object.entries(fileGroups)) {
        const folder = zip.folder(groupName);
        for (const file of files) {
          try {
            const response = await fetch(file.url);
            const blob = await response.blob();
            folder.file(file.name, blob);
          } catch (e) {
            console.error('Failed to download:', file.name, e);
          }
        }
      }
      
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_files.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed:', e);
      alert('Failed to create download. Please try downloading files individually.');
    }
    setDownloading(false);
  };
  
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-gray-500 hover:text-black">
            ← Back
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{project.name}</h2>
            <p className="text-gray-500">{allFiles.length} files</p>
          </div>
        </div>
        <button
          onClick={handleDownloadAll}
          disabled={downloading}
          className="bg-black text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {downloading ? 'Creating ZIP...' : 'Download All (ZIP)'}
        </button>
      </div>
      
      {/* File groups */}
      {Object.entries(fileGroups).map(([groupName, files]) => (
        <FileGrid
          key={groupName}
          title={groupName}
          files={files}
          onPreview={(idx) => {
            // Calculate global index
            let globalIdx = 0;
            for (const [name, f] of Object.entries(fileGroups)) {
              if (name === groupName) {
                setPreviewIndex(globalIdx + idx);
                return;
              }
              globalIdx += f.length;
            }
          }}
        />
      ))}
      
      {/* Preview modal */}
      {previewIndex !== null && allFiles[previewIndex] && (
        <PreviewModal
          file={allFiles[previewIndex]}
          onClose={() => setPreviewIndex(null)}
          onNext={() => setPreviewIndex(i => Math.min(i + 1, allFiles.length - 1))}
          onPrev={() => setPreviewIndex(i => Math.max(i - 1, 0))}
          hasNext={previewIndex < allFiles.length - 1}
          hasPrev={previewIndex > 0}
        />
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
  const [selectedProject, setSelectedProject] = useState(null);
  
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
        .select(`
          *,
          tasks(*),
          revisions(*)
        `)
        .eq('client_id', clientData.id)
        .order('created_at', { ascending: false });
      
      if (projectsError) throw projectsError;
      
      // Calculate status for each project
      const projectsWithStatus = (projectsData || []).map(p => {
        const allComplete = p.tasks?.every(t => t.completed) || false;
        const hasRevisions = p.revisions?.length > 0;
        const status = allComplete ? 'completed' : hasRevisions ? 'revision' : 'progress';
        return { ...p, status };
      });
      
      setProjects(projectsWithStatus);
      
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
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-500">Loading your dashboard...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }
  
  const projectsWithFiles = projects.filter(p => 
    p.tasks?.some(t => t.is_client_task && (t.file_url || (t.files && t.files.length > 0)))
  );
  
  return (
    <>
      <Head>
        <title>{client?.name || 'Client'} Dashboard | DXTR</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Logo */}
                <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center text-white font-bold">
                  D
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Welcome, {client?.name}</h1>
                  <p className="text-sm text-gray-500">Your project files</p>
                </div>
              </div>
            </div>
          </div>
        </header>
        
        {/* Main content */}
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {selectedProject ? (
            <ProjectFilesView
              project={selectedProject}
              onBack={() => setSelectedProject(null)}
            />
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <p className="text-3xl font-bold text-gray-900">{projects.length}</p>
                  <p className="text-gray-500">Total Projects</p>
                </div>
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <p className="text-3xl font-bold text-gray-900">{projects.filter(p => p.status === 'completed').length}</p>
                  <p className="text-gray-500">Completed</p>
                </div>
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <p className="text-3xl font-bold text-gray-900">{projectsWithFiles.length}</p>
                  <p className="text-gray-500">With Files Ready</p>
                </div>
              </div>
              
              {/* Projects with files */}
              {projectsWithFiles.length > 0 && (
                <section className="mb-12">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Ready for Download</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projectsWithFiles.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onViewFiles={setSelectedProject}
                      />
                    ))}
                  </div>
                </section>
              )}
              
              {/* All projects */}
              {projects.length > projectsWithFiles.length && (
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">All Projects</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projects.filter(p => !projectsWithFiles.includes(p)).map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onViewFiles={setSelectedProject}
                      />
                    ))}
                  </div>
                </section>
              )}
              
              {projects.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-4xl mb-4">📁</p>
                  <p className="text-gray-500">No projects yet</p>
                </div>
              )}
            </>
          )}
        </main>
        
        {/* Footer */}
        <footer className="border-t border-gray-200 mt-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-gray-400">
            Powered by DXTR
          </div>
        </footer>
      </div>
    </>
  );
}
