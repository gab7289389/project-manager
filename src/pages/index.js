import React, { useState, useEffect, useCallback } from 'react';
import * as db from '../lib/supabase';
import { getPendingUploads, clearPendingUpload } from '../lib/supabase';

// =============================================
// PASSWORD PROTECTION - CHANGE THESE!
// =============================================
const VALID_PASSWORDS = ['admin123', 'coowner123'];

// =============================================
// UPLOAD MANAGER (Google Drive style)
// =============================================

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime(seconds) {
  if (!seconds || seconds === Infinity || isNaN(seconds)) return '--:--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

const StatusIcon = ({ status }) => {
  switch (status) {
    case 'uploading': return <span className="inline-block animate-spin">⏳</span>;
    case 'waiting': return <span>📶</span>;
    case 'retrying': return <span className="text-yellow-500">🔄</span>;
    case 'queued': return <span className="text-gray-400">⏸️</span>;
    case 'complete': return <span className="text-green-500">✅</span>;
    case 'error': return <span className="text-red-500">❌</span>;
    case 'finalizing': return <span className="animate-pulse">⚡</span>;
    case 'checking': return <span>🔍</span>;
    default: return <span>📄</span>;
  }
};

function UploadItem({ item, onCancel, onRetry }) {
  const progress = item.progress || 0;
  const speed = item.speed ? formatBytes(item.speed) + '/s' : '';
  const eta = item.eta ? formatTime(item.eta) : '';
  
  return (
    <div className="px-3 py-2 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center gap-2">
        <StatusIcon status={item.status} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" title={item.fileName}>{item.fileName}</div>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            {item.status === 'complete' ? (
              <span className="text-green-600">Complete</span>
            ) : item.status === 'error' ? (
              <span className="text-red-500">{item.error || 'Failed'}</span>
            ) : item.status === 'queued' ? (
              <span>Queued</span>
            ) : item.statusMessage ? (
              <span>{item.statusMessage}</span>
            ) : (
              <>
                <span>{progress}%</span>
                {speed && <span>• {speed}</span>}
                {eta && <span>• {eta}</span>}
              </>
            )}
          </div>
        </div>
        {item.status === 'error' && onRetry && (
          <button onClick={() => onRetry(item.id)} className="text-blue-500 hover:text-blue-700 text-xs">Retry</button>
        )}
        {['uploading', 'queued', 'waiting', 'retrying'].includes(item.status) && onCancel && (
          <button onClick={() => onCancel(item.id)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
        )}
      </div>
      {!['complete', 'error', 'queued'].includes(item.status) && (
        <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-purple-600 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

function UploadManager({ uploads, onCancel, onRetry, onClear }) {
  const [isMinimized, setIsMinimized] = useState(false);
  
  const activeUploads = uploads.filter(u => ['uploading', 'waiting', 'retrying', 'finalizing', 'checking'].includes(u.status));
  const queuedUploads = uploads.filter(u => u.status === 'queued');
  const completedUploads = uploads.filter(u => u.status === 'complete');
  const errorUploads = uploads.filter(u => u.status === 'error');
  
  const totalSpeed = activeUploads.reduce((sum, u) => sum + (u.speed || 0), 0);
  const totalRemainingBytes = uploads
    .filter(u => !['complete', 'error'].includes(u.status))
    .reduce((sum, u) => sum + ((u.fileSize || 0) * (1 - (u.progress || 0) / 100)), 0);
  const totalEta = totalSpeed > 0 ? totalRemainingBytes / totalSpeed : 0;
  
  const inProgressCount = activeUploads.length + queuedUploads.length;
  
  if (uploads.length === 0) return null;
  
  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 overflow-hidden">
      <div 
        className="bg-gray-50 px-3 py-2 flex items-center justify-between cursor-pointer border-b border-gray-200"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {inProgressCount > 0 ? (
              <>Uploading {inProgressCount} file{inProgressCount !== 1 ? 's' : ''}</>
            ) : completedUploads.length > 0 && errorUploads.length === 0 ? (
              <>{completedUploads.length} upload{completedUploads.length !== 1 ? 's' : ''} complete</>
            ) : errorUploads.length > 0 ? (
              <>{errorUploads.length} failed</>
            ) : (
              <>Uploads</>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {inProgressCount > 0 && totalSpeed > 0 && (
            <span className="text-xs text-gray-500">{formatBytes(totalSpeed)}/s</span>
          )}
          <button className="text-gray-400 hover:text-gray-600 text-xs">{isMinimized ? '▲' : '▼'}</button>
          <button onClick={(e) => { e.stopPropagation(); onClear?.(); }} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
        </div>
      </div>
      
      {!isMinimized && (
        <div className="max-h-64 overflow-y-auto">
          {uploads.map(upload => (
            <UploadItem key={upload.id} item={upload} onCancel={onCancel} onRetry={onRetry} />
          ))}
        </div>
      )}
      
      {!isMinimized && inProgressCount > 0 && (
        <div className="bg-gray-50 px-3 py-2 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
          <span>
            {activeUploads.length} uploading{queuedUploads.length > 0 && `, ${queuedUploads.length} queued`}
          </span>
          <span>{totalEta > 0 && `${formatTime(totalEta)} remaining`}</span>
        </div>
      )}
    </div>
  );
}

// Hook to manage upload queue with persistence
function useUploadManager(maxConcurrent = 2) {
  const [uploads, setUploads] = useState([]);
  const [initialized, setInitialized] = useState(false);
  
  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('upload_manager_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Restore non-complete uploads as 'interrupted' so user can see them
        // We can't resume without the File object, but we show what was in progress
        const restored = parsed
          .filter(u => !['complete'].includes(u.status))
          .map(u => ({
            ...u,
            status: 'error',
            error: 'Upload interrupted - please re-upload',
            file: null, // File objects can't be serialized
          }));
        if (restored.length > 0) {
          setUploads(restored);
        }
      }
    } catch (e) {
      console.error('Failed to restore uploads:', e);
    }
    setInitialized(true);
  }, []);
  
  // Save to localStorage whenever uploads change
  useEffect(() => {
    if (!initialized) return;
    try {
      // Save minimal state (without File objects)
      const toSave = uploads.map(u => ({
        id: u.id,
        fileName: u.fileName,
        fileSize: u.fileSize,
        projectId: u.projectId,
        taskId: u.taskId,
        status: u.status,
        progress: u.progress,
        error: u.error,
      }));
      localStorage.setItem('upload_manager_state', JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to save uploads:', e);
    }
  }, [uploads, initialized]);
  
  const addToQueue = useCallback((files, projectId, taskId = null) => {
    const newUploads = files.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileName: file.name,
      fileSize: file.size,
      file,
      projectId,
      taskId,
      status: 'queued',
      progress: 0,
      speed: 0,
      eta: 0,
      error: null,
      statusMessage: null,
      fileUrl: null,
    }));
    
    setUploads(prev => [...prev, ...newUploads]);
    return newUploads.map(u => u.id);
  }, []);
  
  // Process queue
  useEffect(() => {
    const active = uploads.filter(u => ['uploading', 'waiting', 'retrying', 'finalizing', 'checking'].includes(u.status));
    const queued = uploads.filter(u => u.status === 'queued' && u.file); // Must have file object
    
    if (active.length >= maxConcurrent || queued.length === 0) return;
    
    const toStart = queued.slice(0, maxConcurrent - active.length);
    
    toStart.forEach(upload => {
      setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'uploading' } : u));
      
      (async () => {
        try {
          const result = await db.uploadFile(
            upload.projectId,
            upload.file,
            (percent, speed, eta) => {
              setUploads(prev => prev.map(u => 
                u.id === upload.id ? { ...u, progress: percent, speed, eta } : u
              ));
            },
            (status, message) => {
              setUploads(prev => prev.map(u => 
                u.id === upload.id ? { ...u, status, statusMessage: message } : u
              ));
            }
          );
          
          setUploads(prev => prev.map(u => 
            u.id === upload.id ? { ...u, status: 'complete', progress: 100, fileUrl: result.fileUrl } : u
          ));
        } catch (error) {
          setUploads(prev => prev.map(u => 
            u.id === upload.id ? { ...u, status: 'error', error: error.message } : u
          ));
        }
      })();
    });
  }, [uploads, maxConcurrent]);
  
  // Cancel returns the upload info so caller can clean up task
  const cancelUpload = useCallback((id) => {
    const upload = uploads.find(u => u.id === id);
    setUploads(prev => prev.filter(u => u.id !== id));
    return upload; // Return so caller can clear the task
  }, [uploads]);
  
  const retryUpload = useCallback((id) => {
    setUploads(prev => prev.map(u => 
      u.id === id ? { ...u, status: 'queued', progress: 0, error: null, statusMessage: null } : u
    ));
  }, []);
  
  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => !['complete', 'error'].includes(u.status)));
  }, []);
  
  const clearAll = useCallback(() => {
    setUploads([]);
  }, []);
  
  // Get uploads that need task cleanup (for cancelled/errored)
  const getUploadsForCleanup = useCallback(() => {
    return uploads.filter(u => u.status === 'error' && u.taskId);
  }, [uploads]);
  
  return { uploads, addToQueue, cancelUpload, retryUpload, clearCompleted, clearAll, getUploadsForCleanup };
}

// =============================================
// MAIN APP
// =============================================

function LoginScreen({ onLogin, onEditorLogin }) {
  const [mode, setMode] = useState('select'); // 'select', 'admin', 'editor'
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleAdminSubmit = (e) => {
    e.preventDefault();
    if (VALID_PASSWORDS.includes(password)) {
      localStorage.setItem('pm_authenticated', 'true');
      localStorage.setItem('pm_mode', 'admin');
      onLogin();
    } else {
      setError('Invalid password');
    }
  };
  
  const handleEditorSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await db.loginEditor(username, password);
      if (result) {
        localStorage.setItem('editor_token', result.session_token || result.id);
        localStorage.setItem('editor_name', result.editor_name || result.name);
        localStorage.setItem('editor_id', result.editor_id || result.id);
        localStorage.setItem('pm_mode', 'editor');
        onEditorLogin(result);
      } else {
        setError('Invalid username or password');
      }
    } catch (err) {
      setError('Invalid username or password');
    }
    setLoading(false);
  };
  
  // Selection screen
  if (mode === 'select') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-10 w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-5">
              <span className="text-white font-bold text-2xl">D</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">DXTR Visions</h1>
            <p className="text-gray-500 mt-2">Select your role</p>
          </div>
          <div className="space-y-3">
            <button 
              onClick={() => setMode('admin')} 
              className="w-full flex items-center justify-center gap-3 bg-black text-white py-4 rounded-xl font-semibold hover:bg-gray-800 transition-colors"
            >
              <span className="text-xl">👤</span> Login as Admin
            </button>
            <button 
              onClick={() => setMode('editor')} 
              className="w-full flex items-center justify-center gap-3 bg-blue-600 text-white py-4 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              <span className="text-xl">🎬</span> Login as Editor
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // Admin login
  if (mode === 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-10 w-full max-w-md">
          <button onClick={() => { setMode('select'); setError(''); setPassword(''); }} className="text-gray-400 hover:text-gray-600 mb-4">← Back</button>
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-5">
              <span className="text-white font-bold text-2xl">👤</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Login</h1>
            <p className="text-gray-500 mt-2">Enter admin password</p>
          </div>
          <form onSubmit={handleAdminSubmit}>
            <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="Enter password" className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:border-black focus:ring-1 focus:ring-black focus:outline-none text-lg" autoFocus />
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <button type="submit" className="w-full mt-5 bg-black text-white py-3.5 rounded-xl font-semibold hover:bg-gray-800 transition-colors">Login</button>
          </form>
        </div>
      </div>
    );
  }
  
  // Editor login
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-10 w-full max-w-md">
        <button onClick={() => { setMode('select'); setError(''); setPassword(''); setUsername(''); }} className="text-gray-400 hover:text-gray-600 mb-4">← Back</button>
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <span className="text-white font-bold text-2xl">🎬</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Editor Login</h1>
          <p className="text-gray-500 mt-2">Enter your credentials</p>
        </div>
        <form onSubmit={handleEditorSubmit}>
          <input type="text" value={username} onChange={(e) => { setUsername(e.target.value); setError(''); }} placeholder="Username" className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none text-lg mb-3" autoFocus />
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="Password" className="w-full px-4 py-3.5 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none text-lg" />
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <button type="submit" disabled={loading} className="w-full mt-5 bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
            {loading ? '⏳ Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

const formatDueDate = (d) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(d); due.setHours(0,0,0,0);
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return Math.abs(diff) + 'd overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return diff + ' days';
};

const isOverdue = (d, s) => s !== 'completed' && new Date(d) < new Date();

const getServiceTypesFromTasks = (tasks) => {
  const types = new Set();
  tasks?.forEach(t => {
    const match = t.text.match(/Submit (.+?) (to editor|to client|Revision)/i);
    if (match) types.add(match[1].replace(' Revision', ''));
  });
  return [...types];
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginMode, setLoginMode] = useState(null); // 'admin' or 'editor'
  const [editorInfo, setEditorInfo] = useState(null);
  const [portal, setPortal] = useState('admin');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [editors, setEditors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Upload manager
  const { uploads, addToQueue, cancelUpload, retryUpload, clearCompleted, clearAll } = useUploadManager(2);
  
  // Handle cancel - also clear the task's file field
  const handleCancelUpload = (id) => {
    const upload = cancelUpload(id);
    if (upload && upload.taskId && upload.projectId) {
      // Clear the task's uploading state
      setProjects(prev => prev.map(p => p.id !== upload.projectId ? p : {
        ...p,
        tasks: p.tasks.map(t => t.id === upload.taskId ? { ...t, file_name: null, file_url: null } : t)
      }));
    }
  };

  useEffect(() => {
    const auth = localStorage.getItem('pm_authenticated');
    const mode = localStorage.getItem('pm_mode');
    const editorId = localStorage.getItem('editor_id');
    const editorName = localStorage.getItem('editor_name');
    
    if (auth === 'true') {
      setIsAuthenticated(true);
      setLoginMode(mode || 'admin');
      if (mode === 'editor' && editorId) {
        setEditorInfo({ id: editorId, name: editorName });
        setPortal('editor');
      }
    }
    setAuthChecked(true);
  }, []);

  useEffect(() => { if (isAuthenticated && loginMode === 'admin') loadAllData(); }, [isAuthenticated, loginMode]);
  
  // Check for pending uploads on mount
  useEffect(() => {
    if (isAuthenticated) {
      const pending = getPendingUploads();
      if (pending.length > 0) {
        console.log('Found pending uploads:', pending);
      }
    }
  }, [isAuthenticated]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [c, s, e, p] = await Promise.all([db.getClients(), db.getServices(), db.getEditors(), db.getProjects()]);
      setClients(c || []); setServices(s || []); setEditors(e || []);
      
      const projectsWithStatus = (p || []).map(project => {
        const allComplete = project.tasks?.every(t => t.completed) || false;
        const hasRevisions = project.revisions?.length > 0;
        const status = allComplete ? 'completed' : hasRevisions ? 'revision' : 'progress';
        return { ...project, status };
      });
      setProjects(projectsWithStatus);
    } catch (error) { console.error('Error:', error); alert('Error loading data'); }
    finally { setLoading(false); }
  };

  // Real-time subscription - auto-refresh when data changes
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const unsubscribe = db.subscribeToAll(
      // Project changes
      (payload) => {
        console.log('Project change:', payload.eventType);
        loadAllData();
      },
      // Task changes
      (payload) => {
        console.log('Task change:', payload.eventType);
        loadAllData();
      },
      // Client changes
      (payload) => {
        console.log('Client change:', payload.eventType);
        loadAllData();
      },
      // Editor changes
      (payload) => {
        console.log('Editor change:', payload.eventType);
        loadAllData();
      }
    );
    
    return () => unsubscribe();
  }, [isAuthenticated, loginMode]);

  const handleLogout = () => { 
    localStorage.removeItem('pm_authenticated'); 
    localStorage.removeItem('pm_mode');
    localStorage.removeItem('editor_id');
    localStorage.removeItem('editor_name');
    localStorage.removeItem('editor_token');
    setIsAuthenticated(false); 
    setLoginMode(null);
    setEditorInfo(null);
  };

  if (!authChecked) return <div className="h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin text-4xl">⏳</div></div>;
  
  if (!isAuthenticated) return <LoginScreen 
    onLogin={() => { setIsAuthenticated(true); setLoginMode('admin'); }} 
    onEditorLogin={(info) => { setIsAuthenticated(true); setLoginMode('editor'); setEditorInfo(info); setPortal('editor'); }}
  />;
  
  // Editor logged in - show only editor portal
  if (loginMode === 'editor') {
    return (
      <div className="h-screen flex flex-col bg-gray-50">
        <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🎬</span>
            <span className="font-medium">Editor Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm opacity-90">Welcome, {editorInfo?.name || 'Editor'}</span>
            <button onClick={handleLogout} className="text-white/70 hover:text-white text-sm">Logout</button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <EditorPortalDashboard editorId={editorInfo?.id} editorName={editorInfo?.name} />
        </div>
      </div>
    );
  }
  
  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-50"><div className="text-center"><div className="animate-spin text-4xl mb-4">⏳</div><p className="text-gray-500">Loading...</p></div></div>;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold text-sm">D</div>
          <span className="font-medium text-gray-900 hidden sm:inline">DXTR</span>
        </div>
        <div className="flex gap-1">
          {['admin', 'editor', 'client'].map(p => (
            <button key={p} onClick={() => setPortal(p)} className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm capitalize transition-colors ${portal === p ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {p === 'admin' ? '👤' : p === 'editor' ? '🎬' : '🏠'} <span className="hidden sm:inline">{p}</span>
            </button>
          ))}
        </div>
        <button onClick={handleLogout} className="text-gray-400 hover:text-gray-900 text-xs transition-colors">Logout</button>
      </div>
      <div className="flex-1 overflow-hidden">
        {portal === 'admin' ? (
          <AdminPortal 
            clients={clients} setClients={setClients} 
            services={services} setServices={setServices} 
            editors={editors} setEditors={setEditors} 
            projects={projects} setProjects={setProjects} 
            sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} 
            refreshData={loadAllData}
            uploads={uploads}
            addToQueue={addToQueue}
          />
        ) : portal === 'editor' ? (
          <EditorPortalDebug editors={editors} />
        ) : (
          <Placeholder type={portal} />
        )}
      </div>
      
      {/* Upload Manager - Google Drive style */}
      <UploadManager 
        uploads={uploads}
        onCancel={handleCancelUpload}
        onRetry={retryUpload}
        onClear={clearAll}
      />
    </div>
  );
}

function Placeholder({ type }) {
  const cfg = { client: { icon: '🏠' } }[type];
  return <div className="h-full flex items-center justify-center bg-gray-50"><div className="text-center text-gray-400"><p className="text-6xl mb-4">{cfg?.icon || '📋'}</p><p className="text-xl font-medium capitalize">{type} Portal</p><p className="text-sm mt-2">Coming soon</p></div></div>;
}

// Editor Portal Debug (for admin view - select an editor to preview their dashboard)
function EditorPortalDebug({ editors }) {
  const [selectedEditorId, setSelectedEditorId] = useState('');
  const selectedEditor = editors.find(e => e.id === selectedEditorId);
  
  if (!selectedEditorId) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎬</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Editor Portal Preview</h1>
          <p className="text-gray-500 mb-6">Select an editor to preview their dashboard</p>
          <select 
            value={selectedEditorId} 
            onChange={e => setSelectedEditorId(e.target.value)}
            className="w-full border rounded-lg px-4 py-3 text-lg"
          >
            <option value="">Select editor...</option>
            {editors.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-4">⚠️ Debug mode - remove before production</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      <div className="bg-yellow-100 border-b border-yellow-300 px-4 py-2 flex items-center justify-between">
        <span className="text-sm text-yellow-800">🔧 Viewing as: <strong>{selectedEditor?.name}</strong></span>
        <button onClick={() => setSelectedEditorId('')} className="text-yellow-700 hover:text-yellow-900 text-sm">← Back</button>
      </div>
      <div className="flex-1 overflow-hidden">
        <EditorPortalDashboard editorId={selectedEditorId} editorName={selectedEditor?.name} />
      </div>
    </div>
  );
}

// Editor Dashboard (when logged in as editor)
function EditorPortalDashboard({ editorId, editorName }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [clientAssets, setClientAssets] = useState({});
  
  useEffect(() => {
    loadTasks();
  }, [editorId]);
  
  const loadTasks = async () => {
    if (!editorId) return;
    try {
      setLoading(true);
      const data = await db.getEditorTasks(editorId);
      setTasks(data || []);
      
      // Load client assets for each unique client
      const clientIds = [...new Set((data || []).map(t => t.project?.client?.id).filter(Boolean))];
      const assetsMap = {};
      for (const clientId of clientIds) {
        try {
          const assets = await db.getAssets(clientId);
          assetsMap[clientId] = assets || [];
        } catch (e) {
          assetsMap[clientId] = [];
        }
      }
      setClientAssets(assetsMap);
    } catch (e) {
      console.error('Failed to load tasks:', e);
    } finally {
      setLoading(false);
    }
  };
  
  const handleUploadFinal = async (taskId, projectId, file) => {
    setUploading(taskId);
    try {
      const result = await db.uploadFile(projectId, file, () => {}, () => {});
      await db.updateTask(taskId, { 
        file_url: result.fileUrl,
        file_name: file.name,
        editor_submitted_at: new Date().toISOString(),
        status: 'pending_review'
      });
      setTasks(prev => prev.map(t => t.id === taskId ? { 
        ...t, 
        file_url: result.fileUrl, 
        file_name: file.name,
        editor_submitted_at: new Date().toISOString(),
        status: 'pending_review'
      } : t));
      alert('✅ File uploaded! Waiting for admin review.');
    } catch (e) {
      console.error('Upload failed:', e);
      alert('Upload failed. Please try again.');
    }
    setUploading(null);
  };
  
  const formatDate = (date) => {
    if (!date) return 'No date';
    return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  
  const getDaysUntil = (date) => {
    if (!date) return null;
    const now = new Date();
    const due = new Date(date);
    const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    return diff;
  };
  
  const getTaskType = (taskText) => {
    // Extract type like "Listing Video", "Floor Plan", etc.
    const match = taskText?.match(/Submit (.+?) to/i);
    return match ? match[1] : taskText;
  };
  
  if (loading) {
    return <div className="h-full flex items-center justify-center bg-gray-50"><div className="animate-spin text-4xl">⏳</div></div>;
  }
  
  // Group by status
  const pendingTasks = tasks.filter(t => !t.completed && t.status !== 'pending_review' && !t.editor_submitted_at);
  const submittedTasks = tasks.filter(t => (t.status === 'pending_review' || t.editor_submitted_at) && !t.completed);
  const completedTasks = tasks.filter(t => t.completed);
  const rejectedTasks = tasks.filter(t => t.status === 'rejected');
  
  const overdueTasks = pendingTasks.filter(t => getDaysUntil(t.editor_due_date) !== null && getDaysUntil(t.editor_due_date) < 0);
  const dueSoonTasks = pendingTasks.filter(t => {
    const days = getDaysUntil(t.editor_due_date);
    return days !== null && days >= 0 && days <= 3;
  });
  
  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-auto">
      {/* Stats */}
      <div className="px-4 py-3 grid grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
          <p className="text-xl font-bold text-gray-900">{pendingTasks.length}</p>
          <p className="text-xs text-gray-500">To Do</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-3 border border-yellow-200 text-center">
          <p className="text-xl font-bold text-yellow-600">{submittedTasks.length}</p>
          <p className="text-xs text-yellow-600">Pending Review</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 border border-red-200 text-center">
          <p className="text-xl font-bold text-red-600">{rejectedTasks.length}</p>
          <p className="text-xs text-red-600">Needs Revision</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3 border border-green-200 text-center">
          <p className="text-xl font-bold text-green-600">{completedTasks.length}</p>
          <p className="text-xs text-green-600">Approved</p>
        </div>
      </div>
      
      {/* Task List */}
      <div className="flex-1 px-4 pb-6 space-y-6">
        
        {/* Rejected Tasks - Show First */}
        {rejectedTasks.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
              <span>⚠️ Needs Revision</span>
            </h2>
            <div className="space-y-3">
              {rejectedTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  expanded={expanded === task.id}
                  onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
                  onUpload={(file) => handleUploadFinal(task.id, task.project?.id, file)}
                  uploading={uploading === task.id}
                  clientAssets={clientAssets[task.project?.client?.id] || []}
                  formatDate={formatDate}
                  getDaysUntil={getDaysUntil}
                  getTaskType={getTaskType}
                  status="rejected"
                />
              ))}
            </div>
          </div>
        )}
        
        {/* Pending Tasks */}
        {pendingTasks.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">📋 To Do ({pendingTasks.length})</h2>
            <div className="space-y-3">
              {pendingTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  expanded={expanded === task.id}
                  onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
                  onUpload={(file) => handleUploadFinal(task.id, task.project?.id, file)}
                  uploading={uploading === task.id}
                  clientAssets={clientAssets[task.project?.client?.id] || []}
                  formatDate={formatDate}
                  getDaysUntil={getDaysUntil}
                  getTaskType={getTaskType}
                  status="pending"
                />
              ))}
            </div>
          </div>
        )}
        
        {/* Submitted / Pending Review */}
        {submittedTasks.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-yellow-700 mb-2">⏳ Waiting for Review ({submittedTasks.length})</h2>
            <div className="space-y-2">
              {submittedTasks.map(task => (
                <div key={task.id} className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{task.project?.name}</p>
                      <p className="text-sm text-gray-500">{getTaskType(task.text)} • {task.project?.client?.name}</p>
                    </div>
                    <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded-full">Pending Review</span>
                  </div>
                  {task.file_name && (
                    <p className="text-xs text-gray-500 mt-2">📎 Submitted: {task.file_name}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Completed */}
        {completedTasks.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-green-700 mb-2">✅ Approved ({completedTasks.length})</h2>
            <div className="space-y-2">
              {completedTasks.slice(0, 5).map(task => (
                <div key={task.id} className="bg-green-50 border border-green-200 rounded-xl p-3 opacity-70">
                  <p className="font-medium text-gray-700">{task.project?.name}</p>
                  <p className="text-sm text-gray-500">{getTaskType(task.text)} • {task.project?.client?.name}</p>
                </div>
              ))}
              {completedTasks.length > 5 && (
                <p className="text-sm text-gray-400 text-center">+ {completedTasks.length - 5} more</p>
              )}
            </div>
          </div>
        )}
        
        {/* Empty State */}
        {pendingTasks.length === 0 && submittedTasks.length === 0 && rejectedTasks.length === 0 && (
          <div className="text-center py-16">
            <p className="text-6xl mb-4">🎉</p>
            <p className="text-xl font-medium text-gray-600">All caught up!</p>
            <p className="text-gray-400 mt-2">No pending tasks</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Task Card Component for Editor
function TaskCard({ task, expanded, onToggle, onUpload, uploading, clientAssets, formatDate, getDaysUntil, getTaskType, status }) {
  const fileInputRef = React.useRef(null);
  const daysUntil = getDaysUntil(task.editor_due_date);
  const isOverdue = daysUntil !== null && daysUntil < 0;
  const isDueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 3;
  
  const borderColor = status === 'rejected' ? 'border-red-400 bg-red-50' : 
                      isOverdue ? 'border-red-300' : 
                      isDueSoon ? 'border-orange-300' : 'border-gray-200';
  
  return (
    <div className={`bg-white rounded-xl border-2 overflow-hidden ${borderColor}`}>
      {/* Header - Always Visible */}
      <div className="p-4 cursor-pointer hover:bg-gray-50" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Project Name - Main Title */}
            <h3 className="font-semibold text-lg text-gray-900">{task.project?.name || 'Unknown Project'}</h3>
            {/* Task Type - Subtitle */}
            <p className="text-sm text-purple-600 font-medium">{getTaskType(task.text)}</p>
            {/* Client - Clear Banner */}
            <div className="flex items-center gap-2 mt-2">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-lg text-xs font-medium">
                🏢 {task.project?.client?.name || 'Unknown Client'}
              </span>
              {status === 'rejected' && (
                <span className="bg-red-100 text-red-700 px-2 py-1 rounded-lg text-xs font-medium">
                  ⚠️ Revision Needed
                </span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`font-medium ${isOverdue ? 'text-red-600' : isDueSoon ? 'text-orange-600' : 'text-gray-600'}`}>
              {formatDate(task.editor_due_date)}
            </p>
            <p className="text-xs mt-0.5">
              {isOverdue ? (
                <span className="text-red-500 font-medium">{Math.abs(daysUntil)}d overdue</span>
              ) : daysUntil === 0 ? (
                <span className="text-orange-500 font-medium">Due today</span>
              ) : daysUntil !== null ? (
                <span className="text-gray-400">{daysUntil}d left</span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-400">{expanded ? '▲ Hide details' : '▼ Show details & upload'}</span>
        </div>
      </div>
      
      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50 space-y-4">
          
          {/* Rejection Notes */}
          {status === 'rejected' && task.rejection_notes && (
            <div className="bg-red-100 border border-red-300 rounded-lg p-3 mt-3">
              <p className="text-xs font-medium text-red-800 mb-1">📝 Revision Notes:</p>
              <p className="text-sm text-red-700">{task.rejection_notes}</p>
            </div>
          )}
          
          {/* Editor Notes */}
          {task.editor_notes && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">📝 Brief / Instructions</p>
              <p className="text-sm text-gray-700 bg-white p-3 rounded-lg border">{task.editor_notes}</p>
            </div>
          )}
          
          {/* Raw Files - Better Download UI */}
          {task.raw_files && task.raw_files.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">📥 RAW FILES TO DOWNLOAD</p>
              <div className="space-y-2">
                {task.raw_files.map((file, i) => (
                  <a 
                    key={i}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-blue-50 border-2 border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-400 transition-all group"
                  >
                    <span className="text-2xl">📁</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-blue-900 truncate">{file.name}</p>
                      <p className="text-xs text-blue-600">Click to download</p>
                    </div>
                    <span className="text-blue-600 text-xl group-hover:translate-x-1 transition-transform">↓</span>
                  </a>
                ))}
              </div>
            </div>
          )}
          
          {/* Client Assets */}
          {clientAssets.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">🎨 CLIENT BRAND ASSETS</p>
              <div className="grid grid-cols-2 gap-2">
                {clientAssets.map((asset, i) => (
                  <a 
                    key={i}
                    href={asset.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 text-sm"
                  >
                    <span>{asset.type === 'image' ? '🖼️' : asset.type === 'font' ? '🔤' : asset.type === 'video' ? '🎬' : '📄'}</span>
                    <span className="truncate flex-1 text-purple-900">{asset.name}</span>
                    <span className="text-purple-400">↓</span>
                  </a>
                ))}
              </div>
            </div>
          )}
          
          {/* Upload Final File */}
          <div className="pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase mb-2">📤 UPLOAD FINAL FILE</p>
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  onUpload(e.target.files[0]);
                }
              }}
            />
            {task.file_url ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-700">✅ Uploaded: {task.file_name}</p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-green-600 underline mt-1"
                  disabled={uploading}
                >
                  Replace file
                </button>
              </div>
            ) : (
              <div 
                className="border-2 border-dashed border-green-300 rounded-xl p-6 text-center cursor-pointer hover:bg-green-50 hover:border-green-500 transition-colors"
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-green-500', 'bg-green-100'); }}
                onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove('border-green-500', 'bg-green-100'); }}
                onDrop={e => { 
                  e.preventDefault(); 
                  e.currentTarget.classList.remove('border-green-500', 'bg-green-100');
                  if (e.dataTransfer.files?.[0]) onUpload(e.dataTransfer.files[0]);
                }}
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                {uploading ? (
                  <div className="text-green-600">
                    <p className="text-2xl mb-2">⏳</p>
                    <p className="font-medium">Uploading...</p>
                  </div>
                ) : (
                  <>
                    <p className="text-3xl mb-2">📤</p>
                    <p className="font-medium text-green-700">Drop your final file here</p>
                    <p className="text-sm text-green-600 mt-1">or click to browse</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminPortal({ clients, setClients, services, setServices, editors, setEditors, projects, setProjects, sidebarOpen, setSidebarOpen, refreshData, uploads, addToQueue }) {
  const [tab, setTab] = useState('projects');
  const [clientFilter, setClientFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [assets, setAssets] = useState([]);
  
  // Load assets on mount
  useEffect(() => {
    const loadAssets = async () => {
      try {
        const data = await db.getAssets();
        setAssets(data || []);
      } catch (e) {
        console.error('Failed to load assets:', e);
      }
    };
    loadAssets();
  }, []);

  const getClient = id => clients.find(c => c.id === id);
  const filtered = projects.filter(p => {
    if (clientFilter === 'all') return true;
    if (clientFilter === 'orphaned') return !p.client_id || !clients.find(c => c.id === p.client_id);
    return p.client_id === clientFilter;
  }).sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (b.status === 'completed' && a.status !== 'completed') return -1;
    return new Date(a.due_date) - new Date(b.due_date);
  });

  const toggleTask = async (projectId, taskId, currentValue) => {
    const currentProject = projects.find(p => p.id === projectId);
    if (!currentProject) return;
    
    const projectName = currentProject.name || 'Unknown';
    const clientName = clients.find(c => c.id === currentProject.client_id)?.name || 'Unknown';
    
    const updatedTasks = currentProject.tasks.map(t => 
      t.id === taskId ? { ...t, completed: !currentValue } : t
    );
    
    const oldAllComplete = currentProject.tasks.every(t => t.completed);
    const newAllComplete = updatedTasks.every(t => t.completed);
    const hasRevisions = (currentProject.revisions?.length || 0) > 0;
    
    const oldStatus = oldAllComplete ? 'completed' : hasRevisions ? 'revision' : 'progress';
    const newStatus = newAllComplete ? 'completed' : hasRevisions ? 'revision' : 'progress';
    
    setProjects(prev => prev.map(p => 
      p.id !== projectId ? p : { ...p, tasks: updatedTasks, status: newStatus }
    ));
    
    try { 
      await db.updateTask(taskId, { completed: !currentValue });
      await db.updateProject(projectId, { status: newStatus });
      
      if (oldStatus !== newStatus) {
        if (newStatus === 'completed') {
          fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'project_complete', data: { projectName, clientName } }) }).catch(console.error);
        } else if (newStatus === 'revision') {
          fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'project_revision', data: { projectName, clientName } }) }).catch(console.error);
        }
      }
    } catch (e) { console.error(e); await refreshData(); }
  };

  // Delete individual task
  const handleDeleteTask = async (projectId, task) => {
    if (!confirm(`Delete task "${task.text}"? This cannot be undone.`)) return;
    
    setProjects(prev => prev.map(p => p.id !== projectId ? p : {
      ...p,
      tasks: p.tasks.filter(t => t.id !== task.id)
    }));
    
    try {
      await db.deleteTask(task.id, task.file_url);
    } catch (e) {
      console.error(e);
      await refreshData();
    }
  };

  // Editor bypass (manual override)
  const handleEditorBypass = async (projectId, taskId, bypass) => {
    setProjects(prev => prev.map(p => p.id !== projectId ? p : {
      ...p,
      tasks: p.tasks.map(t => t.id === taskId ? { ...t, editor_bypass: bypass, completed: bypass } : t)
    }));
    
    try {
      await db.bypassEditorTask(taskId, bypass);
    } catch (e) {
      console.error(e);
      await refreshData();
    }
  };

  // Client bypass (manual override)
  const handleClientBypass = async (projectId, taskId, bypass) => {
    setProjects(prev => prev.map(p => p.id !== projectId ? p : {
      ...p,
      tasks: p.tasks.map(t => t.id === taskId ? { ...t, client_bypass: bypass, completed: bypass, sent: bypass } : t)
    }));
    
    try {
      await db.bypassClientTask(taskId, bypass);
    } catch (e) {
      console.error(e);
      await refreshData();
    }
  };

  // Assign task to editor
  const handleAssignEditor = async (taskId, projectId, data) => {
    setProjects(prev => prev.map(p => p.id !== projectId ? p : {
      ...p,
      tasks: p.tasks.map(t => t.id === taskId ? { ...t, ...data, assigned_at: new Date().toISOString() } : t)
    }));
    
    try {
      await db.assignTaskToEditor(taskId, data.editor_id, data.editor_due_date, data.editor_notes, data.raw_files);
    } catch (e) {
      console.error(e);
      await refreshData();
    }
  };

  // Approve editor submission - copies file to corresponding client task
  const handleApproveTask = async (projectId, taskId) => {
    const project = projects.find(p => p.id === projectId);
    const editorTask = project?.tasks?.find(t => t.id === taskId);
    
    // Find the corresponding client task (same type, e.g., "Submit Listing Video to editor" → "Submit Listing Video to client")
    const taskType = editorTask?.text?.replace('Submit ', '').replace(' to editor', '');
    const clientTask = project?.tasks?.find(t => 
      t.is_client_task && 
      t.text?.includes(taskType)
    );
    
    setProjects(prev => prev.map(p => p.id !== projectId ? p : {
      ...p,
      tasks: p.tasks.map(t => {
        if (t.id === taskId) {
          return { ...t, completed: true, status: 'approved', approved_at: new Date().toISOString() };
        }
        // Copy file to client task
        if (clientTask && t.id === clientTask.id && editorTask?.file_url) {
          return { ...t, file_url: editorTask.file_url, file_name: editorTask.file_name };
        }
        return t;
      })
    }));
    
    try {
      await db.updateTask(taskId, { completed: true, status: 'approved', approved_at: new Date().toISOString() });
      // Also update client task with the file
      if (clientTask && editorTask?.file_url) {
        await db.updateTask(clientTask.id, { file_url: editorTask.file_url, file_name: editorTask.file_name });
      }
    } catch (e) {
      console.error(e);
      await refreshData();
    }
  };

  // Reject editor submission
  const handleRejectTask = async (projectId, taskId, notes) => {
    setProjects(prev => prev.map(p => p.id !== projectId ? p : {
      ...p,
      tasks: p.tasks.map(t => t.id === taskId ? { 
        ...t, 
        status: 'rejected', 
        rejection_notes: notes,
        file_url: null, // Clear the file so editor can re-upload
        file_name: null,
        editor_submitted_at: null
      } : t)
    }));
    
    try {
      await db.updateTask(taskId, { 
        status: 'rejected', 
        rejection_notes: notes,
        file_url: null,
        file_name: null,
        editor_submitted_at: null
      });
    } catch (e) {
      console.error(e);
      await refreshData();
    }
  };

  // Upload files using the queue
  const handleFileUpload = async (projectId, taskId, files) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    
    // Add to upload queue
    addToQueue(fileArray, projectId, taskId);
    
    // Mark task as uploading immediately
    setProjects(prev => prev.map(p => p.id !== projectId ? p : { 
      ...p, 
      tasks: p.tasks.map(t => t.id === taskId ? { ...t, file_name: fileArray.map(f => f.name).join(', '), file_url: 'uploading' } : t) 
    }));
  };
  
  // Watch for completed uploads and update tasks
  useEffect(() => {
    const completedUploads = uploads.filter(u => u.status === 'complete' && u.taskId && u.fileUrl);
    
    completedUploads.forEach(async (upload) => {
      const project = projects.find(p => p.id === upload.projectId);
      const task = project?.tasks?.find(t => t.id === upload.taskId);
      
      if (task && task.file_url === 'uploading') {
        // Update local state
        setProjects(prev => prev.map(p => p.id !== upload.projectId ? p : { 
          ...p, 
          tasks: p.tasks.map(t => t.id === upload.taskId ? { ...t, file_name: upload.fileName, file_url: upload.fileUrl } : t) 
        }));
        
        // Update database
        try {
          await db.updateTask(upload.taskId, { file_name: upload.fileName, file_url: upload.fileUrl });
        } catch (e) {
          console.error('Failed to save upload to database:', e);
        }
      }
    });
  }, [uploads, projects]);

  // Get upload progress for a specific task
  const getUploadProgress = (projectId, taskId) => {
    return uploads.find(u => u.projectId === projectId && u.taskId === taskId && !['complete', 'error'].includes(u.status));
  };

  const removeFile = async (projectId, taskId, fileUrl) => {
    setProjects(prev => prev.map(p => p.id !== projectId ? p : { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, file_name: null, file_url: null } : t) }));
    try { await db.deleteFile(fileUrl); await db.updateTask(taskId, { file_name: null, file_url: null }); } catch (e) { console.error(e); await refreshData(); }
  };

  const sendToClient = async (project, taskIds, client) => {
    const fileNames = project.tasks.filter(t => taskIds.includes(t.id)).map(t => t.text.replace('Submit ', '').replace(' to client', ''));
    const allEmails = [client.email, ...(client.additional_emails || [])].filter(Boolean);
    
    try {
      setSaving(true);
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = allEmails.filter(e => !emailRegex.test(e));
      if (invalidEmails.length > 0) throw new Error(`Invalid email format: ${invalidEmails.join(', ')}`);
      
      // Use client's permanent dashboard token instead of magic link
      const dashboardToken = client.dashboard_token;
      if (!dashboardToken) throw new Error('Client dashboard link not set up. Please refresh and try again.');
      
      const files = project.tasks.filter(t => taskIds.includes(t.id)).map(t => ({ type: t.text.replace('Submit ', '').replace(' to client', ''), name: t.file_name }));
      const pendingFiles = project.tasks.filter(t => t.is_client_task && !t.file_url && !taskIds.includes(t.id)).map(t => ({ type: t.text.replace('Submit ', '').replace(' to client', '') }));
      const previouslySentFiles = project.tasks.filter(t => t.is_client_task && t.sent && !taskIds.includes(t.id)).map(t => ({ type: t.text.replace('Submit ', '').replace(' to client', ''), name: t.file_name }));
      
      const res = await fetch('/api/send-email', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          to: allEmails, 
          projectName: project.name, 
          clientName: client.name, 
          dashboardToken, // Use permanent dashboard token
          files, 
          pendingFiles, 
          previouslySentFiles 
        }) 
      });
      
      const resData = await res.json();
      if (!res.ok) throw new Error(`${resData.error || 'Email failed'} (${resData.errorType || 'unknown'})`);
      
      const updatedTasks = project.tasks.map(t => taskIds.includes(t.id) ? { ...t, sent: true, completed: true } : t);
      const allComplete = updatedTasks.every(t => t.completed);
      const hasRevisions = (project.revisions?.length || 0) > 0;
      const newStatus = allComplete ? 'completed' : hasRevisions ? 'revision' : 'progress';
      
      setProjects(prev => prev.map(p => p.id !== project.id ? p : { ...p, tasks: updatedTasks, status: newStatus }));
      
      await Promise.all(taskIds.map(id => db.updateTask(id, { sent: true, completed: true, sent_at: new Date().toISOString() })));
      await db.updateProject(project.id, { status: newStatus });
      
      if (newStatus === 'completed') {
        fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'project_complete', data: { projectName: project.name, clientName: client.name } }) }).catch(console.error);
      }
      
      return true;
    } catch (e) { 
      console.error('Send to client error:', e); 
      alert('❌ Failed to send: ' + e.message);
      fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'files_sent', data: { success: false, projectName: project.name, clientName: client.name, clientEmail: allEmails.join(', '), files: fileNames, error: e.message } }) }).catch(console.error);
      return false; 
    } finally { setSaving(false); }
  };
  
  const resendToClient = async (project, client) => {
    const sentTasks = project.tasks.filter(t => t.is_client_task && t.sent && t.file_url);
    const fileNames = sentTasks.map(t => t.text.replace('Submit ', '').replace(' to client', ''));
    const allEmails = [client.email, ...(client.additional_emails || [])].filter(Boolean);
    
    try {
      setSaving(true);
      if (sentTasks.length === 0) { alert('No files have been sent to this client yet'); return false; }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = allEmails.filter(e => !emailRegex.test(e));
      if (invalidEmails.length > 0) throw new Error(`Invalid email format: ${invalidEmails.join(', ')}`);
      
      const sentTaskIds = sentTasks.map(t => t.id);
      const pendingTaskIds = project.tasks.filter(t => t.is_client_task && !t.file_url).map(t => t.id);
      
      const magicLink = await db.createMagicLink(project.id, client.id, sentTaskIds, pendingTaskIds);
      const files = sentTasks.map(t => ({ type: t.text.replace('Submit ', '').replace(' to client', ''), name: t.file_name }));
      const pendingFiles = project.tasks.filter(t => t.is_client_task && !t.file_url).map(t => ({ type: t.text.replace('Submit ', '').replace(' to client', '') }));
      
      const res = await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: allEmails, projectName: project.name, clientName: client.name, magicLinkToken: magicLink.token, files, pendingFiles, previouslySentFiles: [], isResend: true }) });
      
      const resData = await res.json();
      if (!res.ok) throw new Error(`${resData.error || 'Email failed'} (${resData.errorType || 'unknown'})`);
      
      return true;
    } catch (e) { 
      console.error('Resend error:', e); 
      alert('❌ Failed to resend: ' + e.message);
      fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'files_sent', data: { success: false, projectName: project.name + ' (RESEND)', clientName: client.name, clientEmail: allEmails.join(', '), files: fileNames, error: e.message } }) }).catch(console.error);
      return false; 
    } finally { setSaving(false); }
  };

  const addRevision = async (projectId, data) => {
    const tempId = 'temp-' + Date.now();
    const tempRevision = { id: tempId, type: data.type, note: data.note || 'Revision requested' };
    const tempTasks = [
      { id: tempId + '-1', text: `Submit ${data.type} Revision to editor`, is_editor_task: true, is_client_task: false, completed: false },
      { id: tempId + '-2', text: `Submit ${data.type} Revision to client`, is_editor_task: false, is_client_task: true, completed: false }
    ];
    
    setProjects(prev => prev.map(p => p.id !== projectId ? p : {
      ...p, status: 'revision', revisions: [...(p.revisions || []), tempRevision], tasks: [...(p.tasks || []), ...tempTasks]
    }));
    
    try {
      const result = await db.createRevision({ project_id: projectId, type: data.type, note: data.note || 'Revision requested' }, [
        { project_id: projectId, text: `Submit ${data.type} Revision to editor`, is_editor_task: true },
        { project_id: projectId, text: `Submit ${data.type} Revision to client`, is_client_task: true }
      ]);
      
      if (result && result.revision && result.tasks) {
        setProjects(prev => prev.map(p => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            revisions: p.revisions.map(r => r.id === tempId ? { ...r, id: result.revision.id } : r),
            tasks: p.tasks.map(t => {
              if (t.id === tempId + '-1') return { ...t, ...result.tasks[0] };
              if (t.id === tempId + '-2') return { ...t, ...result.tasks[1] };
              return t;
            })
          };
        }));
      }
    } catch (e) { 
      console.error(e); 
      alert('Error adding revision'); 
      setProjects(prev => prev.map(p => p.id !== projectId ? p : {
        ...p, revisions: p.revisions.filter(r => r.id !== tempId), tasks: p.tasks.filter(t => !t.id.startsWith(tempId))
      }));
    }
  };

  const updateRevision = async (revisionId, data) => {
    setProjects(prev => prev.map(p => ({
      ...p, revisions: p.revisions?.map(r => r.id === revisionId ? { ...r, ...data } : r)
    })));
    try { await db.updateRevision(revisionId, data); } catch (e) { console.error(e); await refreshData(); }
  };

  const deleteRevision = async (revisionId) => {
    setProjects(prev => prev.map(p => ({
      ...p, revisions: p.revisions?.filter(r => r.id !== revisionId), tasks: p.tasks?.filter(t => t.revision_id !== revisionId)
    })));
    try { await db.deleteRevision(revisionId); } catch (e) { console.error(e); await refreshData(); }
  };

  const updateClientNotes = async (clientId, notes) => {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, notes } : c));
    try { await db.updateClient(clientId, { notes }); } catch (e) { console.error(e); await refreshData(); }
  };

  const updateProject = async (projectId, updates) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ...updates } : p));
    try { await db.updateProject(projectId, updates); } catch (e) { console.error(e); await refreshData(); }
  };

  const deleteProject = async (projectId) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    setExpanded(null);
    try { await db.deleteProject(projectId); } catch (e) { console.error(e); await refreshData(); }
  };

  const createProject = async (projectData, tasks) => {
    if (creatingProject) return;
    setCreatingProject(true);
    
    const tempId = 'temp-' + Date.now();
    const tempProject = {
      id: tempId, ...projectData, status: 'progress',
      tasks: tasks.map((t, i) => ({ id: tempId + '-' + i, ...t, completed: false })),
      revisions: [], client: clients.find(c => c.id === projectData.client_id)
    };
    setProjects(prev => [tempProject, ...prev]);
    try {
      await db.createProject(projectData, tasks);
      await refreshData();
    } catch (e) { console.error(e); alert('Error'); await refreshData(); }
    finally { setCreatingProject(false); }
  };

  return (
    <div className="h-full flex relative">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 flex flex-col transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-5 border-b border-gray-200 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white font-bold text-lg">D</div>
            <span className="font-semibold text-gray-900">DXTR Admin</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-2xl text-gray-400">&times;</button>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[{ id: 'projects', icon: '📁', label: 'Projects' }, { id: 'chat', icon: '💬', label: 'Chat' }, { id: 'database', icon: '🗄️', label: 'Database' }].map(i => (
            <button key={i.id} onClick={() => { setTab(i.id); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${tab === i.id ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>{i.icon} {i.label}</button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <button onClick={refreshData} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">🔄 Refresh Data</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {tab === 'projects' && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 sm:px-8 py-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-xl">☰</button>
                <h1 className="text-xl font-semibold text-gray-900 hidden sm:block">Projects</h1>
                <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-black focus:border-black"><option value="all">All Clients</option><option value="orphaned">⚠️ No Client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </div>
              <button onClick={() => setModal({ type: 'addProject' })} className="bg-black text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors">+ New Project</button>
            </header>
            <div className="flex-1 overflow-auto p-4 sm:p-8 space-y-4">
              {filtered.map(project => {
                const client = project.client || getClient(project.client_id);
                const isOrphaned = !client && project.client_id;
                const isExp = expanded === project.id;
                const editorTasks = project.tasks?.filter(t => t.is_editor_task) || [];
                const clientTasks = project.tasks?.filter(t => t.is_client_task) || [];
                const readyToSend = clientTasks.filter(t => t.file_url && t.file_url !== 'uploading' && !t.sent);
                const completedCount = project.tasks?.filter(t => t.completed).length || 0;
                const totalCount = project.tasks?.length || 0;
                const serviceTypes = project.service_types?.length ? project.service_types : getServiceTypesFromTasks(project.tasks);
                return (
                  <div key={project.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                    <div className="px-5 sm:px-6 py-5 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setExpanded(isExp ? null : project.id)}>
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${project.status === 'completed' ? 'bg-green-500' : project.status === 'revision' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-sm sm:text-base">{project.name}</span>
                        <span className={`text-xs ml-2 hidden sm:inline ${isOrphaned ? 'text-red-500' : 'text-gray-500'}`}>• {client?.name || (isOrphaned ? '⚠️ No Client' : 'No Client')}</span>
                        <p className="text-xs text-gray-400 truncate">{project.services?.join(', ')}</p>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-500">{completedCount}/{totalCount}</span>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${project.status === 'completed' ? 'bg-green-100 text-green-700' : project.status === 'revision' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{project.status === 'completed' ? 'Completed' : project.status === 'revision' ? 'Revision' : 'Active'}</span>
                        {project.status !== 'completed' && <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isOverdue(project.due_date, project.status) ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{formatDueDate(project.due_date)}</span>}
                        <span className={`text-gray-400 ${isExp ? 'rotate-180' : ''} transition-transform`}>▼</span>
                      </div>
                    </div>
                    {isExp && (
                      <div className="border-t border-gray-200">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 p-5 sm:p-6 bg-white text-sm">
                          <div>
                            <div className="flex justify-between mb-3"><span className="font-medium text-gray-900">Details</span><button onClick={() => setModal({ type: 'editProject', project })} className="text-gray-500 hover:text-black text-xs">Edit</button></div>
                            <p className={isOrphaned ? 'text-red-500' : 'text-gray-600'}>Client: {client?.name || (isOrphaned ? '⚠️ Deleted - Please reassign' : 'None')}</p>
                            <p className="text-gray-600">Due: {new Date(project.due_date).toLocaleDateString()}</p>
                            {client?.dashboard_token && (
                              <div className="mt-3 flex items-center gap-2">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const url = `${window.location.origin}/client/${client.dashboard_token}`;
                                    navigator.clipboard.writeText(url);
                                    e.target.innerText = '✓ Copied!';
                                    setTimeout(() => e.target.innerText = '📋 Copy Client Link', 1500);
                                  }}
                                  className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  📋 Copy Client Link
                                </button>
                                <a href={`/client/${client.dashboard_token}`} target="_blank" className="text-xs text-gray-400 hover:text-black">↗</a>
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="flex justify-between mb-3"><span className="font-medium text-gray-900">Revisions</span><button onClick={() => setModal({ type: 'addRevision', project, serviceTypes })} className="text-gray-500 hover:text-black text-xs">+ Add</button></div>
                            {project.revisions?.map(r => <div key={r.id} className="flex items-center gap-1 mb-2"><p className="text-xs flex-1"><span className="font-medium">{r.type}:</span> <span className="text-gray-600">{r.note}</span></p><button onClick={() => setModal({ type: 'editRevision', project, revision: r, serviceTypes })} className="text-xs hover:bg-gray-100 p-1 rounded">✏️</button></div>)}
                            {!project.revisions?.length && <p className="text-gray-400 text-xs italic">None</p>}
                          </div>
                          <div>
                            <div className="flex justify-between mb-3"><span className="font-medium text-gray-900">Client Notes</span><button onClick={() => setModal({ type: 'editNotes', client })} className="text-gray-500 hover:text-black text-xs">Edit</button></div>
                            <p className="text-xs text-gray-600">{client?.notes || 'No notes'}</p>
                          </div>
                        </div>
                        <div className="p-5 sm:p-6 border-t border-gray-200 bg-gray-50">
                          <h4 className="font-medium text-sm mb-4 text-gray-900">🎬 Editor Workflow</h4>
                          {/* Group editor tasks by status */}
                          {(() => {
                            const pendingReview = editorTasks.filter(t => (t.status === 'pending_review' || t.editor_submitted_at) && !t.completed && t.status !== 'rejected');
                            const rejected = editorTasks.filter(t => t.status === 'rejected');
                            const awaitingUpload = editorTasks.filter(t => !t.completed && !t.editor_submitted_at && t.status !== 'pending_review' && t.status !== 'rejected' && !t.file_url);
                            const completed = editorTasks.filter(t => t.completed);
                            
                            return (
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {editorTasks.map(t => {
                                  const label = t.text.replace('Submit ', '').replace(' to editor', '');
                                  const isPendingReview = (t.status === 'pending_review' || t.editor_submitted_at) && !t.completed && t.status !== 'rejected';
                                  const isRejected = t.status === 'rejected';
                                  const isCompleted = t.completed;
                                  const isAwaiting = !isCompleted && !isPendingReview && !isRejected;
                                  
                                  return (
                                    <div 
                                      key={t.id} 
                                      className={`p-4 rounded-xl border-2 ${
                                        isPendingReview ? 'bg-yellow-50 border-yellow-300' :
                                        isRejected ? 'bg-red-50 border-red-300' :
                                        isCompleted ? 'bg-green-50 border-green-200' :
                                        'bg-white border-gray-200'
                                      }`}
                                    >
                                      {/* Header */}
                                      <div className="flex items-start justify-between gap-2 mb-3">
                                        <div>
                                          <span className="font-medium text-gray-900">{label}</span>
                                          {t.editor_id && <p className="text-xs text-purple-600 mt-0.5">Assigned: {editors.find(e => e.id === t.editor_id)?.name}</p>}
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                          isPendingReview ? 'bg-yellow-200 text-yellow-800' :
                                          isRejected ? 'bg-red-200 text-red-800' :
                                          isCompleted ? 'bg-green-200 text-green-800' :
                                          t.editor_id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                                        }`}>
                                          {isPendingReview ? '⏳ Review' :
                                           isRejected ? '⚠️ Revision' :
                                           isCompleted ? '✓ Approved' :
                                           t.editor_id ? '🎬 In Progress' : 'Unassigned'}
                                        </span>
                                      </div>
                                      
                                      {/* Rejection notes */}
                                      {isRejected && t.rejection_notes && (
                                        <div className="text-xs text-red-700 bg-red-100 p-2 rounded mb-3">
                                          📝 {t.rejection_notes}
                                        </div>
                                      )}
                                      
                                      {/* Content based on status */}
                                      {isPendingReview && t.file_url && (
                                        <>
                                          <div className="bg-white rounded-lg p-3 mb-3 border">
                                            <p className="text-sm mb-2">📎 {t.file_name}</p>
                                            <a href={t.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-700">
                                              👁️ Preview / Download
                                            </a>
                                          </div>
                                          <div className="flex gap-2">
                                            <button onClick={() => handleApproveTask(project.id, t.id)} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700">
                                              ✓ Approve
                                            </button>
                                            <button onClick={() => {
                                              const notes = prompt('Revision notes for editor:');
                                              if (notes !== null) handleRejectTask(project.id, t.id, notes);
                                            }} className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg text-sm font-medium hover:bg-red-200">
                                              ✗ Revise
                                            </button>
                                          </div>
                                        </>
                                      )}
                                      
                                      {isCompleted && t.file_url && (
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                          <span>📎 {t.file_name}</span>
                                          <a href={t.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">↓</a>
                                        </div>
                                      )}
                                      
                                      {isAwaiting && !t.file_url && (
                                        <>
                                          {/* Upload box for admin to upload on behalf of editor */}
                                          <div 
                                            className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-colors"
                                            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-blue-400', 'bg-blue-50'); }}
                                            onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50'); }}
                                            onDrop={e => { 
                                              e.preventDefault(); 
                                              e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50');
                                              if (e.dataTransfer.files?.[0]) {
                                                // Upload and mark as pending review
                                                handleFileUpload(project.id, t.id, e.dataTransfer.files);
                                              }
                                            }}
                                            onClick={() => document.getElementById(`editor-file-${t.id}`).click()}
                                          >
                                            <p className="text-gray-500 text-sm">📁 Drop file or click</p>
                                            <p className="text-gray-400 text-xs mt-1">Upload on behalf of editor</p>
                                            <input 
                                              id={`editor-file-${t.id}`} 
                                              type="file" 
                                              className="hidden" 
                                              onChange={e => e.target.files?.length && handleFileUpload(project.id, t.id, e.target.files)} 
                                            />
                                          </div>
                                          <div className="flex items-center justify-between mt-2">
                                            {!t.editor_id && (
                                              <button onClick={() => setModal({ type: 'assignEditor', task: t, project, client })} className="text-xs text-blue-600 hover:text-blue-800">
                                                + Assign Editor
                                              </button>
                                            )}
                                            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer ml-auto">
                                              <input type="checkbox" checked={t.editor_bypass || false} onChange={(e) => handleEditorBypass(project.id, t.id, e.target.checked)} className="w-3 h-3" />
                                              Bypass
                                            </label>
                                          </div>
                                        </>
                                      )}
                                      
                                      {isRejected && (
                                        <p className="text-xs text-red-600 italic">Waiting for editor to resubmit</p>
                                      )}
                                    </div>
                                  );
                                })}
                                
                                {editorTasks.length === 0 && (
                                  <p className="text-gray-400 text-sm italic col-span-2">No editor tasks for this project</p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="p-5 sm:p-6 border-t border-gray-200">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
                            <h4 className="font-medium text-sm text-gray-900">📧 Client Deliverables</h4>
                            <div className="flex gap-2">
                              {clientTasks.some(t => t.sent) && <button onClick={() => { if(confirm('Resend notification? Client will receive a new email with their dashboard link.')) resendToClient(project, client); }} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-xs hover:bg-gray-200 transition-colors">🔄 Resend Notification</button>}
                              {readyToSend.length > 0 && <button onClick={() => setModal({ type: 'sendToClient', project, tasks: readyToSend, client })} className="bg-black text-white px-4 py-2 rounded-lg text-xs hover:bg-gray-800 transition-colors">📤 Send {readyToSend.length} File{readyToSend.length > 1 ? 's' : ''}</button>}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{clientTasks.map(t => {
                            const label = t.text.replace('Submit ', '').replace(' to client', '');
                            const uploadProgress = getUploadProgress(project.id, t.id);
                            const isBypassed = t.client_bypass;
                            return (<div key={t.id} className={`p-4 rounded-xl border-2 transition-colors group ${isBypassed ? 'bg-gray-50 border-gray-300' : t.sent ? 'bg-green-50 border-green-200' : t.file_url ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                              <div className="flex justify-between items-start mb-3">
                                <span className={`font-medium text-sm ${isBypassed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{label}</span>
                                <div className="flex items-center gap-2">
                                  {isBypassed && <span className="text-gray-500 text-xs font-medium">⚡ Bypassed</span>}
                                  {t.sent && !isBypassed && <span className="text-green-600 text-xs font-medium">✓ Sent</span>}
                                  {t.file_url && t.file_url !== 'uploading' && !t.sent && !isBypassed && <span className="text-amber-600 text-xs font-medium">Ready to Send</span>}
                                  {t.file_url === 'uploading' && <span className="text-blue-600 text-xs font-medium">Uploading...</span>}
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer" title="Manual bypass - mark as sent without uploading">
                                      <input type="checkbox" checked={isBypassed || false} onChange={(e) => handleClientBypass(project.id, t.id, e.target.checked)} className="w-3 h-3" />
                                      Bypass
                                    </label>
                                    <button onClick={() => handleDeleteTask(project.id, t)} className="text-xs text-red-400 hover:text-red-600 ml-1">🗑️</button>
                                  </div>
                                </div>
                              </div>
                              {t.sent ? (
                                <div>
                                  <p className="text-sm text-gray-600 mb-2">📎 {t.file_name}</p>
                                  <a href={t.file_url} target="_blank" rel="noopener noreferrer" download className="text-xs text-gray-500 hover:text-black">📥 Download</a>
                                </div>
                              ) : t.file_url ? (
                                <div>
                                  <p className="text-sm text-gray-700 mb-2">📎 {t.file_name}</p>
                                  {t.file_url !== 'uploading' && (
                                    <div className="flex gap-3">
                                      <a href={t.file_url} target="_blank" rel="noopener noreferrer" download className="text-xs text-gray-500 hover:text-black">📥 Download</a>
                                      <button onClick={() => removeFile(project.id, t.id, t.file_url)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                                    </div>
                                  )}
                                  {uploadProgress && (
                                    <div className="mt-3">
                                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-black transition-all" style={{ width: `${uploadProgress.progress}%` }} />
                                      </div>
                                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                                        <span>{uploadProgress.progress}%</span>
                                        <span>{uploadProgress.speed > 0 ? `${formatBytes(uploadProgress.speed)}/s` : ''}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div 
                                  className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-colors"
                                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-black', 'bg-gray-100'); }}
                                  onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove('border-black', 'bg-gray-100'); }}
                                  onDrop={e => { 
                                    e.preventDefault(); 
                                    e.currentTarget.classList.remove('border-black', 'bg-gray-100');
                                    if (e.dataTransfer.files?.length) handleFileUpload(project.id, t.id, e.dataTransfer.files);
                                  }}
                                  onClick={() => document.getElementById(`file-${t.id}`).click()}
                                >
                                  <p className="text-gray-500 text-sm">📁 Drop files or click to upload</p>
                                  <p className="text-gray-400 text-xs mt-1">Multiple files supported</p>
                                  <input id={`file-${t.id}`} type="file" multiple className="hidden" onChange={e => e.target.files?.length && handleFileUpload(project.id, t.id, e.target.files)} />
                                </div>
                              )}
                            </div>);
                          })}</div>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 flex justify-end"><button onClick={() => setModal({ type: 'deleteProject', project })} className="text-xs text-gray-400 hover:text-red-500 transition-colors">🗑️ Delete Project</button></div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="text-center py-16 text-gray-400"><p className="text-5xl mb-4">📁</p><p className="text-lg">No projects yet</p><button onClick={() => setModal({ type: 'addProject' })} className="text-black mt-3 hover:underline">Create your first project</button></div>}
            </div>
          </>
        )}
        {tab === 'chat' && <div className="flex-1 flex items-center justify-center text-gray-400"><div className="text-center"><p className="text-5xl mb-4">💬</p><p className="text-lg">Chat coming soon</p></div></div>}
        {tab === 'database' && <Database clients={clients} setClients={setClients} services={services} setServices={setServices} editors={editors} setEditors={setEditors} setSidebarOpen={setSidebarOpen} refreshData={refreshData} />}
      </main>

      {modal?.type === 'addProject' && <AddProjectModal clients={clients} services={services} editors={editors} onClose={() => setModal(null)} onCreate={async (p, t) => { await createProject(p, t); setModal(null); }} />}
      {modal?.type === 'editProject' && <EditProjectModal project={modal.project} clients={clients} services={services} onClose={() => setModal(null)} onSave={async (u) => { await updateProject(modal.project.id, u); setModal(null); }} onAddTask={async (t) => { await db.createTask({ ...t, project_id: modal.project.id }); await refreshData(); }} onDeleteTask={async (taskId) => { await db.deleteTask(taskId); await refreshData(); }} />}
      {modal?.type === 'addRevision' && <AddRevisionModal serviceTypes={modal.serviceTypes} onClose={() => setModal(null)} onSave={async (d) => { await addRevision(modal.project.id, d); setModal(null); }} />}
      {modal?.type === 'editRevision' && <EditRevisionModal revision={modal.revision} serviceTypes={modal.serviceTypes} onClose={() => setModal(null)} onSave={async (d) => { await updateRevision(modal.revision.id, d); setModal(null); }} onDelete={async () => { await deleteRevision(modal.revision.id); setModal(null); }} />}
      {modal?.type === 'editNotes' && <EditNotesModal client={modal.client} onClose={() => setModal(null)} onSave={async (n) => { await updateClientNotes(modal.client.id, n); setModal(null); }} />}
      {modal?.type === 'deleteProject' && <DeleteProjectModal project={modal.project} onClose={() => setModal(null)} onDelete={async () => { await deleteProject(modal.project.id); setModal(null); }} />}
      {modal?.type === 'sendToClient' && <SendToClientModal project={modal.project} tasks={modal.tasks} client={modal.client} onClose={() => setModal(null)} onSend={async (ids) => { const ok = await sendToClient(modal.project, ids, modal.client); if (ok) setModal(null); }} />}
      {modal?.type === 'assignEditor' && <AssignEditorModal task={modal.task} project={modal.project} client={modal.client} editors={editors} assets={assets} onClose={() => setModal(null)} onSave={async (data) => { await handleAssignEditor(modal.task.id, modal.project.id, data); setModal(null); }} addToQueue={addToQueue} />}
    </div>
  );
}

function Database({ clients, setClients, services, setServices, editors, setEditors, setSidebarOpen, refreshData }) {
  const [tab, setTab] = useState('clients');
  const [modal, setModal] = useState(null);
  const [assetModal, setAssetModal] = useState(null);
  
  const handleSave = async (type, item, isEdit) => {
    const tempId = 'temp-' + Date.now();
    try {
      if (type === 'clients') {
        if (isEdit) {
          setClients(prev => prev.map(c => c.id === item.id ? { ...c, ...item } : c));
          const { id, ...updates } = item;
          await db.updateClient(id, updates);
        } else {
          setClients(prev => [...prev, { ...item, id: tempId }]);
          await db.createNewClient(item);
          await refreshData();
        }
      } else if (type === 'services') {
        if (isEdit) {
          setServices(prev => prev.map(s => s.id === item.id ? { ...s, ...item } : s));
          const { id, ...updates } = item;
          await db.updateService(id, updates);
        } else {
          setServices(prev => [...prev, { ...item, id: tempId }]);
          await db.createService(item);
          await refreshData();
        }
      } else if (type === 'editors') {
        if (isEdit) {
          setEditors(prev => prev.map(e => e.id === item.id ? { ...e, ...item } : e));
          const { id, ...updates } = item;
          await db.updateEditor(id, updates);
        } else {
          setEditors(prev => [...prev, { ...item, id: tempId }]);
          await db.createEditor(item);
          await refreshData();
        }
      }
      setModal(null);
    } catch (e) { 
      console.error(e);
      alert('Error: ' + e.message); 
      await refreshData();
    }
  };
  
  const handleDelete = async (type, id) => {
    if (!confirm('Delete?')) return;
    try {
      if (type === 'clients') {
        setClients(prev => prev.filter(c => c.id !== id));
        await db.deleteClient(id);
      } else if (type === 'services') {
        setServices(prev => prev.filter(s => s.id !== id));
        await db.deleteService(id);
      } else if (type === 'editors') {
        setEditors(prev => prev.filter(e => e.id !== id));
        await db.deleteEditor(id);
      }
    } catch (e) { 
      console.error(e);
      alert('Error'); 
      await refreshData();
    }
  };
  
  const data = tab === 'clients' ? clients : tab === 'services' ? services : editors;
  return (
    <div className="flex-1 overflow-auto">
      <div className="bg-white border-b p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-xl">☰</button>
          <h1 className="text-lg font-bold">Database</h1>
        </div>
        <div className="flex gap-2">
          {['clients', 'services', 'editors'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-lg text-sm capitalize ${tab === t ? 'bg-purple-600 text-white' : 'bg-gray-100'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="p-3 sm:p-4">
        <div className="flex justify-end mb-4">
          <button onClick={() => setModal({ item: null })} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm">+ Add</button>
        </div>
        <div className="space-y-2">
          {data.map(item => (
            <div key={item.id} className="bg-white rounded-lg border p-3">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{item.avatar || ''} {item.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {tab === 'editors' ? `@${item.username || item.name}` : (item.email || item.tasks?.join(', '))}
                  </p>
                  {item.email && tab === 'editors' && <p className="text-xs text-gray-400">{item.email}</p>}
                  {item.notes && <p className="text-xs text-gray-400 mt-1">{item.notes}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {tab === 'clients' && (
                    <button 
                      onClick={() => setAssetModal({ client: item })} 
                      className="text-blue-600 text-sm bg-blue-50 px-2 py-1 rounded"
                    >
                      🎨 Assets
                    </button>
                  )}
                  <button onClick={() => setModal({ item })} className="text-purple-600 text-sm">Edit</button>
                  <button onClick={() => handleDelete(tab, item.id)} className="text-red-600 text-sm">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {modal && <DatabaseModal tab={tab} item={modal.item} onClose={() => setModal(null)} onSave={(i) => handleSave(tab, modal.item ? { ...i, id: modal.item.id } : i, !!modal.item)} />}
      {assetModal && <ClientAssetsModal client={assetModal.client} onClose={() => setAssetModal(null)} />}
    </div>
  );
}

// Client Assets Modal
function ClientAssetsModal({ client, onClose }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);
  
  useEffect(() => {
    loadAssets();
  }, [client.id]);
  
  const loadAssets = async () => {
    try {
      const data = await db.getAssets(client.id);
      setAssets(data || []);
    } catch (e) {
      console.error('Failed to load assets:', e);
    } finally {
      setLoading(false);
    }
  };
  
  const handleUpload = async (files) => {
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        // Determine asset type
        const ext = file.name.split('.').pop().toLowerCase();
        let assetType = 'other';
        if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) assetType = 'image';
        else if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) assetType = 'font';
        else if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) assetType = 'video';
        else if (['pdf'].includes(ext)) assetType = 'pdf';
        
        // Upload to Bunny
        const result = await db.uploadFile(client.id, file, () => {}, () => {});
        
        // Create asset record
        await db.createAsset({
          client_id: client.id,
          name: file.name,
          file_url: result.fileUrl,
          type: assetType,
          size: file.size
        });
      } catch (e) {
        console.error('Failed to upload asset:', e);
        alert(`Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
    loadAssets();
  };
  
  const handleDelete = async (asset) => {
    if (!confirm(`Delete "${asset.name}"?`)) return;
    try {
      await db.deleteAsset(asset.id, asset.file_url);
      setAssets(prev => prev.filter(a => a.id !== asset.id));
    } catch (e) {
      console.error('Failed to delete asset:', e);
      alert('Failed to delete');
    }
  };
  
  const getAssetIcon = (type) => {
    switch (type) {
      case 'image': return '🖼️';
      case 'font': return '🔤';
      case 'video': return '🎬';
      case 'pdf': return '📄';
      default: return '📁';
    }
  };
  
  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold">🎨 Client Assets</h2>
            <p className="text-sm text-gray-500">{client.name}</p>
          </div>
          <button onClick={onClose} className="text-2xl text-gray-400">&times;</button>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Upload Section */}
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center bg-gray-50">
            <input 
              type="file" 
              ref={fileInputRef}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  handleUpload(e.target.files);
                }
              }}
            />
            <p className="text-3xl mb-2">📤</p>
            <p className="text-sm text-gray-600 mb-3">Upload logos, fonts, brand guidelines, intros/outros</p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? '⏳ Uploading...' : '+ Upload Assets'}
            </button>
          </div>
          
          {/* Assets List */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Uploaded Assets ({assets.length})</h3>
            {loading ? (
              <p className="text-gray-400 text-center py-4">Loading...</p>
            ) : assets.length === 0 ? (
              <p className="text-gray-400 text-center py-4 text-sm">No assets uploaded yet</p>
            ) : (
              <div className="space-y-2">
                {assets.map(asset => (
                  <div key={asset.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
                    <span className="text-2xl">{getAssetIcon(asset.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{asset.name}</p>
                      <p className="text-xs text-gray-500">{asset.type} • {formatSize(asset.size)}</p>
                    </div>
                    <a 
                      href={asset.file_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      ↓
                    </a>
                    <button 
                      onClick={() => handleDelete(asset)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <p className="text-xs text-gray-400 text-center">
            These assets will be available to editors working on projects for this client
          </p>
        </div>
      </div>
    </div>
  );
}

function DatabaseModal({ tab, item, onClose, onSave }) {
  const [form, setForm] = useState(item || { name: '', email: '', notes: '', tasks: [], additional_emails: [], username: '', password: '' });
  const [additionalEmailInput, setAdditionalEmailInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const addAdditionalEmail = () => {
    const email = additionalEmailInput.trim();
    if (!email) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { alert('Invalid email format'); return; }
    if (form.additional_emails?.includes(email) || email === form.email) { alert('Email already added'); return; }
    setForm({ ...form, additional_emails: [...(form.additional_emails || []), email] });
    setAdditionalEmailInput('');
  };
  
  const removeAdditionalEmail = (email) => {
    setForm({ ...form, additional_emails: form.additional_emails.filter(e => e !== email) });
  };
  
  const save = () => {
    if (!form.name?.trim()) { alert('Name required'); return; }
    if (tab === 'clients' && !form.email?.trim()) { alert('Email required'); return; }
    const tasks = typeof form.tasks === 'string' ? form.tasks.split(',').map(t => t.trim()).filter(Boolean) : form.tasks;
    
    if (tab === 'services') {
      onSave({ name: form.name, tasks });
    } else if (tab === 'editors') {
      // Username/password optional until migration is run
      const editorData = { name: form.name, email: form.email || '' };
      if (form.username?.trim()) editorData.username = form.username;
      if (form.password?.trim()) editorData.password = form.password;
      onSave(editorData);
    } else {
      onSave({ name: form.name, email: form.email, notes: form.notes, additional_emails: form.additional_emails || [] });
    }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex justify-between">
          <h2 className="text-lg font-bold">{item ? 'Edit' : 'Add'} {tab.slice(0,-1)}</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">&times;</button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          </div>
          
          {/* Editor-specific fields */}
          {tab === 'editors' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Username {!item && '*'}</label>
                <input 
                  value={form.username || ''} 
                  onChange={e => setForm({ ...form, username: e.target.value })} 
                  className="w-full border rounded-lg px-3 py-2"
                  disabled={!!item}
                  placeholder={item ? item.username : 'login username'}
                />
                {item && <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password {!item && '*'}</label>
                <div className="relative">
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    value={form.password || ''} 
                    onChange={e => setForm({ ...form, password: e.target.value })} 
                    className="w-full border rounded-lg px-3 py-2 pr-10"
                    placeholder={item ? 'Leave blank to keep current' : 'Set password'}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email (optional)</label>
                <input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="editor@email.com" />
              </div>
            </>
          )}
          
          {/* Client fields */}
          {tab === 'clients' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Email *</label>
                <input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Additional Emails</label>
                <div className="flex gap-2 mb-2">
                  <input value={additionalEmailInput} onChange={e => setAdditionalEmailInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAdditionalEmail())} placeholder="marketing@company.com" className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                  <button type="button" onClick={addAdditionalEmail} className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">+ Add</button>
                </div>
                {form.additional_emails?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.additional_emails.map(email => (
                      <span key={email} className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs">
                        {email}
                        <button type="button" onClick={() => removeAdditionalEmail(email)} className="text-purple-500 hover:text-purple-700">&times;</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} />
              </div>
            </>
          )}
          
          {/* Service fields */}
          {tab === 'services' && (
            <div>
              <label className="block text-sm font-medium mb-1">Tasks * (comma separated)</label>
              <textarea value={Array.isArray(form.tasks) ? form.tasks.join(', ') : form.tasks || ''} onChange={e => setForm({ ...form, tasks: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={3} />
            </div>
          )}
          
          <button onClick={save} className="w-full bg-purple-600 text-white py-2 rounded-lg font-medium">Save</button>
        </div>
      </div>
    </div>
  );
}

function AddProjectModal({ clients, services, editors, onClose, onCreate }) {
  const [form, setForm] = useState({ 
    name: '', 
    client_id: '', 
    due_date: '', 
    selectedServices: []
  });
  const hasSitePlan = form.selectedServices.some(sn => services.find(s => s.name === sn)?.tasks.some(t => t.toLowerCase().includes('site plan')));
  const previewTasks = form.selectedServices.flatMap(sn => services.find(s => s.name === sn)?.tasks || []);
  const filteredTasks = hasSitePlan ? previewTasks.filter(t => !(t.toLowerCase().includes('floor plan') && t.toLowerCase().includes('client'))) : previewTasks;
  
  const create = () => {
    if (!form.name || !form.client_id || !form.due_date || !form.selectedServices.length) { alert('Fill all fields'); return; }
    const serviceTypes = [...new Set(filteredTasks.map(t => { const m = t.match(/Submit (.+?) to (editor|client)/i); return m ? m[1] : null; }).filter(Boolean))];
    const tasks = filteredTasks.map(tt => ({ 
      text: tt, 
      is_editor_task: tt.toLowerCase().includes('editor'), 
      is_client_task: tt.toLowerCase().includes('client')
    }));
    onCreate({ name: form.name, client_id: form.client_id, due_date: form.due_date, services: form.selectedServices, service_types: serviceTypes }, tasks);
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex justify-between">
          <h2 className="text-lg font-bold">New Project</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">&times;</button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Project Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Client *</label>
              <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                <option value="">Select...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Due Date *</label>
            <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Services *</label>
            <div className="grid grid-cols-2 gap-2">
              {services.map(s => (
                <label key={s.id} className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer ${form.selectedServices.includes(s.name) ? 'border-purple-400 bg-purple-50' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={form.selectedServices.includes(s.name)} onChange={e => setForm({ ...form, selectedServices: e.target.checked ? [...form.selectedServices, s.name] : form.selectedServices.filter(x => x !== s.name) })} className="w-4 h-4" />
                  <span className="text-sm">{s.name}</span>
                </label>
              ))}
            </div>
          </div>
          
          {filteredTasks.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-medium text-blue-800 mb-2">📋 This will create:</p>
              <ul className="text-xs text-blue-700 space-y-1 max-h-40 overflow-auto">
                {filteredTasks.map((t, i) => <li key={i}>• {t}</li>)}
              </ul>
              {hasSitePlan && <p className="text-xs text-orange-600 mt-2">ℹ️ Floor Plan client upload removed (Site Plan replaces it)</p>}
              <p className="text-xs text-gray-500 mt-2">💡 Assign editors after creating the project</p>
            </div>
          )}
          
          <button onClick={create} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Create Project</button>
        </div>
      </div>
    </div>
  );
}

function EditProjectModal({ project, clients, services, onClose, onSave, onAddTask, onDeleteTask }) {
  const [form, setForm] = useState({ 
    name: project.name, 
    due_date: project.due_date, 
    client_id: project.client_id,
    services: project.services || []
  });
  const [saving, setSaving] = useState(false);
  
  // Get current tasks grouped by whether they're from services
  const tasks = project.tasks || [];
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex justify-between">
          <h2 className="text-lg font-bold">Edit Project</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">&times;</button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Due Date</label>
            <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Client</label>
            <select value={form.client_id || ''} onChange={e => setForm({ ...form, client_id: e.target.value || null })} className={`w-full border rounded-lg px-3 py-2 ${!form.client_id ? 'border-red-300 bg-red-50' : ''}`}>
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!form.client_id && <p className="text-xs text-red-500 mt-1">⚠️ Please assign a client</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Services</label>
            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-auto">
              {services.map(s => (
                <label key={s.id} className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer text-sm ${form.services.includes(s.name) ? 'border-purple-400 bg-purple-50' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={form.services.includes(s.name)} onChange={e => setForm({ ...form, services: e.target.checked ? [...form.services, s.name] : form.services.filter(x => x !== s.name) })} className="w-4 h-4" />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
          </div>
          
          {/* Tasks Preview - read only */}
          <div className="border-t pt-4">
            <label className="block text-sm font-medium mb-2">📋 Current Tasks ({tasks.length})</label>
            <div className="space-y-1 max-h-40 overflow-auto">
              {tasks.map(t => (
                <div key={t.id} className={`flex items-center gap-2 p-2 rounded-lg text-sm ${t.completed ? 'bg-green-50 text-gray-400 line-through' : 'bg-gray-50'}`}>
                  <span className={t.completed ? 'text-green-500' : 'text-gray-400'}>{t.completed ? '✓' : '○'}</span>
                  <span className="truncate flex-1">{t.text}</span>
                  {t.is_editor_task && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Editor</span>}
                  {t.is_client_task && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Client</span>}
                </div>
              ))}
              {tasks.length === 0 && <p className="text-gray-400 text-sm italic">No tasks</p>}
            </div>
            <p className="text-xs text-gray-400 mt-2">Tasks are managed through revisions and the Assign Editor feature</p>
          </div>
          
          <button onClick={() => onSave(form)} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Save Project</button>
        </div>
      </div>
    </div>
  );
}

function AddRevisionModal({ serviceTypes, onClose, onSave }) {
  const [form, setForm] = useState({ type: '', note: '' });
  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl max-w-md w-full"><div className="p-4 border-b flex justify-between"><h2 className="text-lg font-bold">Add Revision</h2><button onClick={onClose} className="text-2xl text-gray-400">&times;</button></div><div className="p-4 space-y-4"><div><label className="block text-sm font-medium mb-1">Service Type</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="">Select...</option>{serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}</select></div><div><label className="block text-sm font-medium mb-1">Note</label><textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={3} /></div>{form.type && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3"><p className="text-sm font-medium text-blue-800 mb-2">📋 This will create:</p><ul className="text-xs text-blue-700"><li>• Submit {form.type} Revision to editor</li><li>• Submit {form.type} Revision to client</li></ul></div>}<button onClick={() => { if (!form.type) { alert('Select type'); return; } onSave(form); }} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Add Revision</button></div></div></div>;
}

function EditRevisionModal({ revision, serviceTypes, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ type: revision.type, note: revision.note });
  const [showDel, setShowDel] = useState(false);
  if (showDel) return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl max-w-md w-full"><div className="p-4 border-b bg-red-50"><h2 className="text-lg font-bold text-red-700">🗑️ Delete Revision</h2></div><div className="p-4 space-y-4"><p>Delete the <strong>{revision.type}</strong> revision?</p><div className="flex gap-3"><button onClick={() => setShowDel(false)} className="flex-1 border py-2 rounded-lg">Cancel</button><button onClick={onDelete} className="flex-1 bg-red-600 text-white py-2 rounded-lg">Delete</button></div></div></div></div>;
  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl max-w-md w-full"><div className="p-4 border-b flex justify-between"><h2 className="text-lg font-bold">Edit Revision</h2><button onClick={onClose} className="text-2xl text-gray-400">&times;</button></div><div className="p-4 space-y-4"><div><label className="block text-sm font-medium mb-1">Service Type</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full border rounded-lg px-3 py-2">{serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}</select></div><div><label className="block text-sm font-medium mb-1">Note</label><textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={3} /></div><button onClick={() => onSave(form)} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Save</button><button onClick={() => setShowDel(true)} className="w-full border border-red-300 text-red-600 py-2 rounded-lg text-sm">🗑️ Delete Revision</button></div></div></div>;
}

function EditNotesModal({ client, onClose, onSave }) {
  const [notes, setNotes] = useState(client?.notes || '');
  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl max-w-md w-full"><div className="p-4 border-b flex justify-between"><h2 className="text-lg font-bold">Edit Client Notes</h2><button onClick={onClose} className="text-2xl text-gray-400">&times;</button></div><div className="p-4 space-y-4"><p className="text-sm text-gray-500">Client: {client?.name}</p><textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border rounded-lg px-3 py-2" rows={4} /><button onClick={() => onSave(notes)} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Save</button></div></div></div>;
}

function DeleteProjectModal({ project, onClose, onDelete }) {
  const [confirm, setConfirm] = useState('');
  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl max-w-md w-full"><div className="p-4 border-b bg-red-50"><h2 className="text-lg font-bold text-red-700">⚠️ Delete Project</h2></div><div className="p-4 space-y-4"><div className="bg-red-100 border border-red-300 rounded-lg p-3 text-sm text-red-800"><p className="font-bold mb-2">Permanently delete:</p><p>• "{project.name}"</p><p>• {project.tasks?.length || 0} tasks</p><p>• All uploaded files</p></div><div><label className="block text-sm mb-1">Type "DELETE" to confirm:</label><input value={confirm} onChange={e => setConfirm(e.target.value)} className="w-full border border-red-300 rounded-lg px-3 py-2" /></div><div className="flex gap-3"><button onClick={onClose} className="flex-1 border py-2 rounded-lg">Cancel</button><button onClick={onDelete} disabled={confirm !== 'DELETE'} className="flex-1 bg-red-600 text-white py-2 rounded-lg disabled:opacity-50">Delete</button></div></div></div></div>;
}

function SendToClientModal({ project, tasks, client, onClose, onSend }) {
  const [selected, setSelected] = useState(tasks.reduce((a, t) => ({ ...a, [t.id]: true }), {}));
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const ids = tasks.filter(t => selected[t.id]).map(t => t.id);
  const send = async () => { setSending(true); await onSend(ids); setSending(false); setSent(true); };
  if (sent) return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl max-w-md w-full p-8 text-center"><p className="text-6xl mb-4">✅</p><p className="text-xl font-bold text-green-700">Email Sent!</p><p className="text-gray-500">Magic link sent to {client?.email}</p><button onClick={onClose} className="mt-4 bg-purple-600 text-white px-6 py-2 rounded-lg">Done</button></div></div>;
  const allEmails = [client?.email, ...(client?.additional_emails || [])].filter(Boolean);
  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl max-w-lg w-full"><div className="p-4 border-b bg-green-50"><h2 className="text-lg font-bold text-green-700">📤 Send to Client</h2></div><div className="p-4 space-y-4"><div className="bg-gray-50 rounded-lg p-3 text-sm"><p><strong>Project:</strong> {project.name}</p><p><strong>To:</strong> {client?.email}{client?.additional_emails?.length > 0 && <span className="text-gray-500"> + {client.additional_emails.length} more</span>}</p>{client?.additional_emails?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{client.additional_emails.map(e => <span key={e} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{e}</span>)}</div>}</div><div className="space-y-2 max-h-48 overflow-auto">{tasks.map(t => <label key={t.id} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer ${selected[t.id] ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}><input type="checkbox" checked={selected[t.id]} onChange={() => setSelected({ ...selected, [t.id]: !selected[t.id] })} className="w-4 h-4" /><div><p className="font-medium text-sm">{t.text.replace('Submit ', '').replace(' to client', '')}</p><p className="text-xs text-gray-500">📎 {t.file_name}</p></div></label>)}</div><div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">📧 Email will be sent to {allEmails.length} recipient{allEmails.length > 1 ? 's' : ''}</div><div className="flex gap-3"><button onClick={onClose} className="flex-1 border py-2 rounded-lg">Cancel</button><button onClick={send} disabled={!ids.length || sending} className="flex-1 bg-green-600 text-white py-2 rounded-lg disabled:opacity-50">{sending ? '⏳ Sending...' : `Send ${ids.length} File${ids.length > 1 ? 's' : ''}`}</button></div></div></div></div>;
}

// =============================================
// ASSIGN EDITOR MODAL
// =============================================
function AssignEditorModal({ task, project, client, editors, assets, onClose, onSave, onUploadRaw, addToQueue }) {
  const [form, setForm] = useState({
    editor_id: task.editor_id || '',
    editor_due_date: task.editor_due_date || '',
    editor_notes: task.editor_notes || '',
    raw_files: task.raw_files || [],
    selected_assets: []
  });
  const [uploading, setUploading] = useState(false);
  
  // Get client assets
  const clientAssets = assets?.filter(a => a.client_id === project?.client_id) || [];
  
  const handleRawFileUpload = async (files) => {
    setUploading(true);
    const fileArray = Array.from(files);
    const newRawFiles = [];
    
    for (const file of fileArray) {
      try {
        const result = await db.uploadFile(project.id, file, () => {}, () => {});
        newRawFiles.push({
          name: file.name,
          url: result.fileUrl,
          size: file.size,
          uploaded_at: new Date().toISOString()
        });
      } catch (e) {
        console.error('Raw file upload failed:', e);
      }
    }
    
    setForm(prev => ({ ...prev, raw_files: [...prev.raw_files, ...newRawFiles] }));
    setUploading(false);
  };
  
  const removeRawFile = (index) => {
    setForm(prev => ({
      ...prev,
      raw_files: prev.raw_files.filter((_, i) => i !== index)
    }));
  };
  
  const save = () => {
    if (!form.editor_id) { alert('Please select an editor'); return; }
    if (!form.editor_due_date) { alert('Please set a due date'); return; }
    onSave({
      editor_id: form.editor_id,
      editor_due_date: form.editor_due_date,
      editor_notes: form.editor_notes,
      raw_files: form.raw_files
    });
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b bg-blue-50">
          <h2 className="text-lg font-bold text-blue-700">🎬 Assign to Editor</h2>
          <p className="text-sm text-blue-600 mt-1">{task.text}</p>
        </div>
        <div className="p-4 space-y-4">
          {/* Editor Selection */}
          <div>
            <label className="block text-sm font-medium mb-1">Editor *</label>
            <select value={form.editor_id} onChange={e => setForm({ ...form, editor_id: e.target.value })} className="w-full border rounded-lg px-3 py-2">
              <option value="">Select editor...</option>
              {editors.map(e => <option key={e.id} value={e.id}>{e.avatar || '👤'} {e.name}</option>)}
            </select>
          </div>
          
          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium mb-1">Due Date *</label>
            <input type="date" value={form.editor_due_date} onChange={e => setForm({ ...form, editor_due_date: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          </div>
          
          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Notes for Editor</label>
            <textarea value={form.editor_notes} onChange={e => setForm({ ...form, editor_notes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={3} placeholder="Any special instructions..." />
          </div>
          
          {/* Raw Files Upload */}
          <div>
            <label className="block text-sm font-medium mb-2">Raw Files</label>
            <div 
              className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 transition-colors"
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50'); }}
              onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50'); }}
              onDrop={e => { 
                e.preventDefault(); 
                e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
                if (e.dataTransfer.files?.length) handleRawFileUpload(e.dataTransfer.files);
              }}
              onClick={() => document.getElementById('raw-file-input').click()}
            >
              {uploading ? (
                <p className="text-blue-600">⏳ Uploading...</p>
              ) : (
                <>
                  <p className="text-gray-500">📁 Drop raw files or click to upload</p>
                  <p className="text-xs text-gray-400 mt-1">Video, photos, etc.</p>
                </>
              )}
              <input id="raw-file-input" type="file" multiple className="hidden" onChange={e => e.target.files?.length && handleRawFileUpload(e.target.files)} />
            </div>
            
            {/* Uploaded Raw Files List */}
            {form.raw_files.length > 0 && (
              <div className="mt-2 space-y-1">
                {form.raw_files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm">
                    <span className="truncate flex-1">{f.name}</span>
                    <button onClick={() => removeRawFile(i)} className="text-red-500 text-xs ml-2">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Client Assets */}
          {clientAssets.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">Client Assets</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-auto">
                {clientAssets.map(asset => (
                  <label key={asset.id} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer text-xs ${form.selected_assets.includes(asset.id) ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
                    <input 
                      type="checkbox" 
                      checked={form.selected_assets.includes(asset.id)} 
                      onChange={e => {
                        if (e.target.checked) {
                          setForm({ ...form, selected_assets: [...form.selected_assets, asset.id] });
                        } else {
                          setForm({ ...form, selected_assets: form.selected_assets.filter(id => id !== asset.id) });
                        }
                      }} 
                      className="w-3 h-3" 
                    />
                    <span className="truncate">{asset.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border py-2 rounded-lg">Cancel</button>
            <button onClick={save} className="flex-1 bg-blue-600 text-white py-2 rounded-lg">Assign to Editor</button>
          </div>
        </div>
      </div>
    </div>
  );
}
