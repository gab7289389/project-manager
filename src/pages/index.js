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

// Hook to manage upload queue
function useUploadManager(maxConcurrent = 2) {
  const [uploads, setUploads] = useState([]);
  
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
    const queued = uploads.filter(u => u.status === 'queued');
    
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
  
  const cancelUpload = useCallback((id) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);
  
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
  
  return { uploads, addToQueue, cancelUpload, retryUpload, clearCompleted, clearAll };
}

// =============================================
// MAIN APP
// =============================================

function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    if (VALID_PASSWORDS.includes(password)) {
      localStorage.setItem('pm_authenticated', 'true');
      onLogin();
    } else {
      setError('Invalid password');
    }
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-700 to-purple-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><span className="text-3xl">🔐</span></div>
          <h1 className="text-2xl font-bold text-gray-800">Project Manager</h1>
          <p className="text-gray-500 mt-2">Enter password to continue</p>
        </div>
        <form onSubmit={handleSubmit}>
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} placeholder="Enter password" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-lg" autoFocus />
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <button type="submit" className="w-full mt-4 bg-purple-600 text-white py-3 rounded-xl font-semibold hover:bg-purple-700 transition">Login</button>
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
  const [portal, setPortal] = useState('admin');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [editors, setEditors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Upload manager
  const { uploads, addToQueue, cancelUpload, retryUpload, clearCompleted, clearAll } = useUploadManager(2);

  useEffect(() => {
    const auth = localStorage.getItem('pm_authenticated');
    setIsAuthenticated(auth === 'true');
    setAuthChecked(true);
  }, []);

  useEffect(() => { if (isAuthenticated) loadAllData(); }, [isAuthenticated]);
  
  // Check for pending uploads on mount
  useEffect(() => {
    if (isAuthenticated) {
      const pending = getPendingUploads();
      if (pending.length > 0) {
        console.log('Found pending uploads:', pending);
        // Could show a notification here asking user to resume
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

  const handleLogout = () => { localStorage.removeItem('pm_authenticated'); setIsAuthenticated(false); };

  if (!authChecked) return <div className="h-screen flex items-center justify-center bg-gray-100"><div className="animate-spin text-4xl">⏳</div></div>;
  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-100"><div className="text-center"><div className="animate-spin text-4xl mb-4">⏳</div><p className="text-gray-500">Loading...</p></div></div>;

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <div className="bg-gray-900 text-white px-4 py-2 flex items-center justify-between text-sm">
        <span className="text-gray-400 hidden sm:inline">Portal:</span>
        <div className="flex gap-1 sm:gap-2">
          {['admin', 'editor', 'client'].map(p => (
            <button key={p} onClick={() => setPortal(p)} className={`px-2 sm:px-3 py-1 rounded text-xs sm:text-sm capitalize ${portal === p ? (p === 'admin' ? 'bg-purple-600' : p === 'editor' ? 'bg-blue-600' : 'bg-green-600') : 'bg-gray-700'}`}>
              {p === 'admin' ? '👤' : p === 'editor' ? '🎬' : '🏠'} {p}
            </button>
          ))}
        </div>
        <button onClick={handleLogout} className="text-gray-400 hover:text-white text-xs">🚪 Logout</button>
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
        ) : (
          <Placeholder type={portal} />
        )}
      </div>
      
      {/* Upload Manager - Google Drive style */}
      <UploadManager 
        uploads={uploads}
        onCancel={cancelUpload}
        onRetry={retryUpload}
        onClear={clearAll}
      />
    </div>
  );
}

function Placeholder({ type }) {
  const cfg = { editor: { icon: '🎬' }, client: { icon: '🏠' } }[type];
  return <div className="h-full flex items-center justify-center bg-gray-50"><div className="text-center text-gray-400"><p className="text-6xl mb-4">{cfg.icon}</p><p className="text-xl font-medium capitalize">{type} Portal</p><p className="text-sm mt-2">Coming soon</p></div></div>;
}

function AdminPortal({ clients, setClients, services, setServices, editors, setEditors, projects, setProjects, sidebarOpen, setSidebarOpen, refreshData, uploads, addToQueue }) {
  const [tab, setTab] = useState('projects');
  const [clientFilter, setClientFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

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
      
      const allClientTaskIds = project.tasks.filter(t => t.is_client_task).map(t => t.id);
      const pendingTaskIds = project.tasks.filter(t => t.is_client_task && !t.file_url).map(t => t.id);
      const tasksWithFiles = allClientTaskIds.filter(id => !pendingTaskIds.includes(id));
      
      const magicLink = await db.createMagicLink(project.id, client.id, tasksWithFiles, pendingTaskIds);
      const files = project.tasks.filter(t => taskIds.includes(t.id)).map(t => ({ type: t.text.replace('Submit ', '').replace(' to client', ''), name: t.file_name }));
      const pendingFiles = project.tasks.filter(t => t.is_client_task && !t.file_url && !taskIds.includes(t.id)).map(t => ({ type: t.text.replace('Submit ', '').replace(' to client', '') }));
      const previouslySentFiles = project.tasks.filter(t => t.is_client_task && t.sent && !taskIds.includes(t.id)).map(t => ({ type: t.text.replace('Submit ', '').replace(' to client', ''), name: t.file_name }));
      
      const res = await fetch('/api/send-email', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ to: allEmails, projectName: project.name, clientName: client.name, magicLinkToken: magicLink.token, files, pendingFiles, previouslySentFiles }) 
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
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-56 bg-gradient-to-b from-purple-700 to-purple-900 text-white flex flex-col transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-4 border-b border-purple-600 flex justify-between items-center">
          <div className="flex items-center gap-3"><div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-purple-700 font-bold">PM</div><span className="font-semibold">Admin</span></div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-2xl">&times;</button>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {[{ id: 'projects', icon: '📁' }, { id: 'chat', icon: '💬' }, { id: 'database', icon: '🗄️' }].map(i => (
            <button key={i.id} onClick={() => { setTab(i.id); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg capitalize ${tab === i.id ? 'bg-white text-purple-700' : 'text-purple-200 hover:bg-purple-600'}`}>{i.icon} {i.id}</button>
          ))}
        </nav>
        <div className="p-2 border-t border-purple-600"><button onClick={refreshData} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-purple-200 hover:bg-purple-600 text-sm">🔄 Refresh</button></div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        {tab === 'projects' && (
          <>
            <header className="bg-white border-b px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-4 flex-1">
                <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-xl">☰</button>
                <h1 className="text-lg font-bold hidden sm:block">Projects</h1>
                <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm"><option value="all">All Clients</option><option value="orphaned">⚠️ No Client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </div>
              <button onClick={() => setModal({ type: 'addProject' })} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-xs sm:text-sm font-medium">+ New</button>
            </header>
            <div className="flex-1 overflow-auto p-2 sm:p-4 space-y-3">
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
                  <div key={project.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-4 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(isExp ? null : project.id)}>
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${project.status === 'completed' ? 'bg-green-500' : project.status === 'revision' ? 'bg-red-500' : 'bg-yellow-400'}`} />
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-sm sm:text-base">{project.name}</span>
                        <span className={`text-xs ml-2 hidden sm:inline ${isOrphaned ? 'text-red-500' : 'text-gray-500'}`}>• {client?.name || (isOrphaned ? '⚠️ No Client' : 'No Client')}</span>
                        <p className="text-xs text-gray-400 truncate">{project.services?.join(', ')}</p>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-500">{completedCount}/{totalCount}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${project.status === 'completed' ? 'bg-green-100 text-green-700' : project.status === 'revision' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{project.status === 'completed' ? 'Completed' : project.status === 'revision' ? 'Revision' : 'Active'}</span>
                        {project.status !== 'completed' && <span className={`text-xs px-2 py-0.5 rounded-full ${isOverdue(project.due_date, project.status) ? 'bg-red-500 text-white' : 'bg-gray-100'}`}>{formatDueDate(project.due_date)}</span>}
                        <span className={`${isExp ? 'rotate-180' : ''} transition-transform`}>▼</span>
                      </div>
                    </div>
                    {isExp && (
                      <div className="border-t">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 sm:p-4 bg-gray-50 text-sm">
                          <div><div className="flex justify-between mb-2"><span className="font-medium text-gray-600">Details</span><button onClick={() => setModal({ type: 'editProject', project })} className="text-purple-600 text-xs">Edit</button></div><p className={isOrphaned ? 'text-red-500' : 'text-gray-500'}>Client: {client?.name || (isOrphaned ? '⚠️ Deleted - Please reassign' : 'None')}</p><p className="text-gray-500">Due: {new Date(project.due_date).toLocaleDateString()}</p></div>
                          <div><div className="flex justify-between mb-2"><span className="font-medium text-gray-600">Revisions</span><button onClick={() => setModal({ type: 'addRevision', project, serviceTypes })} className="text-purple-600 text-xs">+ Add</button></div>{project.revisions?.map(r => <div key={r.id} className="flex items-center gap-1 mb-1"><p className="text-xs flex-1"><span className="text-purple-600">{r.type}:</span> {r.note}</p><button onClick={() => setModal({ type: 'editRevision', project, revision: r, serviceTypes })} className="text-xs hover:bg-gray-200 p-1 rounded">✏️</button></div>)}{!project.revisions?.length && <p className="text-gray-400 text-xs italic">None</p>}</div>
                          <div><div className="flex justify-between mb-2"><span className="font-medium text-gray-600">Client Notes</span><button onClick={() => setModal({ type: 'editNotes', client })} className="text-purple-600 text-xs">Edit</button></div><p className="text-xs text-gray-500">{client?.notes || 'No notes'}</p></div>
                        </div>
                        <div className="p-3 sm:p-4 border-t bg-blue-50"><h4 className="font-medium text-sm mb-3">🎬 Editor Tasks</h4><div className="space-y-2">{editorTasks.map(t => <label key={t.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border cursor-pointer"><input type="checkbox" checked={t.completed} onChange={() => toggleTask(project.id, t.id, t.completed)} className="w-4 h-4" /><span className={t.completed ? 'line-through text-gray-400' : ''}>{t.text}</span></label>)}</div></div>
                        <div className="p-3 sm:p-4 border-t bg-purple-50">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                            <h4 className="font-medium text-sm">📧 Submit to Client</h4>
                            <div className="flex gap-2">
                              {clientTasks.some(t => t.sent) && <button onClick={() => { if(confirm('Resend all files? This creates a new magic link.')) resendToClient(project, client); }} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs">🔄 Resend All</button>}
                              {readyToSend.length > 0 && <button onClick={() => setModal({ type: 'sendToClient', project, tasks: readyToSend, client })} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs">📤 Send {readyToSend.length} File{readyToSend.length > 1 ? 's' : ''}</button>}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{clientTasks.map(t => {
                            const label = t.text.replace('Submit ', '').replace(' to client', '');
                            const uploadProgress = getUploadProgress(project.id, t.id);
                            return (<div key={t.id} className={`p-3 rounded-lg border-2 ${t.sent ? 'bg-green-50 border-green-300' : t.file_url ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200'}`}>
                              <div className="flex justify-between mb-2"><span className="font-medium text-sm">{label}</span>{t.sent && <span className="text-green-600 text-xs">✓ Sent</span>}{t.file_url && t.file_url !== 'uploading' && !t.sent && <span className="text-yellow-600 text-xs">Ready</span>}{t.file_url === 'uploading' && <span className="text-blue-600 text-xs">Uploading...</span>}</div>
                              {t.sent ? (
                                <div>
                                  <p className="text-sm text-green-600 mb-2">📎 {t.file_name}</p>
                                  <a href={t.file_url} target="_blank" rel="noopener noreferrer" download className="text-xs text-purple-600 hover:underline">📥 Download</a>
                                </div>
                              ) : t.file_url ? (
                                <div>
                                  <p className="text-sm text-yellow-700 mb-1">📎 {t.file_name}</p>
                                  {t.file_url !== 'uploading' && (
                                    <div className="flex gap-2">
                                      <a href={t.file_url} target="_blank" rel="noopener noreferrer" download className="text-xs text-purple-600 hover:underline">📥 Download</a>
                                      <button onClick={() => removeFile(project.id, t.id, t.file_url)} className="text-xs text-red-500">Remove</button>
                                    </div>
                                  )}
                                  {uploadProgress && (
                                    <div className="mt-2">
                                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-purple-600 transition-all" style={{ width: `${uploadProgress.progress}%` }} />
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
                                  className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:bg-gray-50 hover:border-purple-400 transition-colors"
                                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-purple-500', 'bg-purple-50'); }}
                                  onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove('border-purple-500', 'bg-purple-50'); }}
                                  onDrop={e => { 
                                    e.preventDefault(); 
                                    e.currentTarget.classList.remove('border-purple-500', 'bg-purple-50');
                                    if (e.dataTransfer.files?.length) handleFileUpload(project.id, t.id, e.dataTransfer.files);
                                  }}
                                  onClick={() => document.getElementById(`file-${t.id}`).click()}
                                >
                                  <p className="text-gray-400 text-sm">📁 Drop files or click to upload</p>
                                  <p className="text-gray-300 text-xs">Multiple files allowed</p>
                                  <input id={`file-${t.id}`} type="file" multiple className="hidden" onChange={e => e.target.files?.length && handleFileUpload(project.id, t.id, e.target.files)} />
                                </div>
                              )}
                            </div>);
                          })}</div>
                        </div>
                        <div className="p-3 border-t bg-gray-50 flex justify-end"><button onClick={() => setModal({ type: 'deleteProject', project })} className="text-xs text-red-500">🗑️ Delete Project</button></div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="text-center py-12 text-gray-400"><p className="text-4xl mb-2">📁</p><p>No projects yet</p><button onClick={() => setModal({ type: 'addProject' })} className="text-purple-600 mt-2">Create your first project</button></div>}
            </div>
          </>
        )}
        {tab === 'chat' && <div className="flex-1 flex items-center justify-center text-gray-400"><div className="text-center"><p className="text-4xl mb-2">💬</p><p>Chat coming soon</p></div></div>}
        {tab === 'database' && <Database clients={clients} setClients={setClients} services={services} setServices={setServices} editors={editors} setEditors={setEditors} setSidebarOpen={setSidebarOpen} refreshData={refreshData} />}
      </main>

      {modal?.type === 'addProject' && <AddProjectModal clients={clients} services={services} onClose={() => setModal(null)} onCreate={async (p, t) => { await createProject(p, t); setModal(null); }} />}
      {modal?.type === 'editProject' && <EditProjectModal project={modal.project} clients={clients} services={services} onClose={() => setModal(null)} onSave={async (u) => { await updateProject(modal.project.id, u); setModal(null); }} />}
      {modal?.type === 'addRevision' && <AddRevisionModal serviceTypes={modal.serviceTypes} onClose={() => setModal(null)} onSave={async (d) => { await addRevision(modal.project.id, d); setModal(null); }} />}
      {modal?.type === 'editRevision' && <EditRevisionModal revision={modal.revision} serviceTypes={modal.serviceTypes} onClose={() => setModal(null)} onSave={async (d) => { await updateRevision(modal.revision.id, d); setModal(null); }} onDelete={async () => { await deleteRevision(modal.revision.id); setModal(null); }} />}
      {modal?.type === 'editNotes' && <EditNotesModal client={modal.client} onClose={() => setModal(null)} onSave={async (n) => { await updateClientNotes(modal.client.id, n); setModal(null); }} />}
      {modal?.type === 'deleteProject' && <DeleteProjectModal project={modal.project} onClose={() => setModal(null)} onDelete={async () => { await deleteProject(modal.project.id); setModal(null); }} />}
      {modal?.type === 'sendToClient' && <SendToClientModal project={modal.project} tasks={modal.tasks} client={modal.client} onClose={() => setModal(null)} onSend={async (ids) => { const ok = await sendToClient(modal.project, ids, modal.client); if (ok) setModal(null); }} />}
    </div>
  );
}

function Database({ clients, setClients, services, setServices, editors, setEditors, setSidebarOpen, refreshData }) {
  const [tab, setTab] = useState('clients');
  const [modal, setModal] = useState(null);
  
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
      <div className="bg-white border-b p-3 sm:p-4"><div className="flex items-center gap-2 mb-4"><button onClick={() => setSidebarOpen(true)} className="lg:hidden text-xl">☰</button><h1 className="text-lg font-bold">Database</h1></div><div className="flex gap-2">{['clients', 'services', 'editors'].map(t => <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-lg text-sm capitalize ${tab === t ? 'bg-purple-600 text-white' : 'bg-gray-100'}`}>{t}</button>)}</div></div>
      <div className="p-3 sm:p-4"><div className="flex justify-end mb-4"><button onClick={() => setModal({ item: null })} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm">+ Add</button></div><div className="space-y-2">{data.map(item => <div key={item.id} className="bg-white rounded-lg border p-3 flex justify-between items-start"><div className="flex-1 min-w-0"><p className="font-medium">{item.avatar || ''} {item.name}</p><p className="text-xs text-gray-500 truncate">{item.email || item.tasks?.join(', ')}</p>{item.notes && <p className="text-xs text-gray-400 mt-1">{item.notes}</p>}</div><div className="flex gap-2 flex-shrink-0"><button onClick={() => setModal({ item })} className="text-purple-600 text-sm">Edit</button><button onClick={() => handleDelete(tab, item.id)} className="text-red-600 text-sm">Delete</button></div></div>)}</div></div>
      {modal && <DatabaseModal tab={tab} item={modal.item} onClose={() => setModal(null)} onSave={(i) => handleSave(tab, modal.item ? { ...i, id: modal.item.id } : i, !!modal.item)} />}
    </div>
  );
}

function DatabaseModal({ tab, item, onClose, onSave }) {
  const [form, setForm] = useState(item || { name: '', email: '', notes: '', tasks: [], additional_emails: [] });
  const [additionalEmailInput, setAdditionalEmailInput] = useState('');
  
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
    if (tab !== 'services' && !form.email?.trim()) { alert('Email required'); return; }
    const tasks = typeof form.tasks === 'string' ? form.tasks.split(',').map(t => t.trim()).filter(Boolean) : form.tasks;
    
    if (tab === 'services') {
      onSave({ name: form.name, tasks });
    } else if (tab === 'editors') {
      onSave({ name: form.name, email: form.email, avatar: item?.avatar || '👤' });
    } else {
      onSave({ name: form.name, email: form.email, notes: form.notes, additional_emails: form.additional_emails || [] });
    }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-auto"><div className="p-4 border-b flex justify-between"><h2 className="text-lg font-bold">{item ? 'Edit' : 'Add'} {tab.slice(0,-1)}</h2><button onClick={onClose} className="text-2xl text-gray-400">&times;</button></div><div className="p-4 space-y-4"><div><label className="block text-sm font-medium mb-1">Name *</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>{tab !== 'services' && <div><label className="block text-sm font-medium mb-1">Email *</label><input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>}{tab === 'clients' && <div><label className="block text-sm font-medium mb-1">Additional Emails</label><div className="flex gap-2 mb-2"><input value={additionalEmailInput} onChange={e => setAdditionalEmailInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAdditionalEmail())} placeholder="marketing@company.com" className="flex-1 border rounded-lg px-3 py-2 text-sm" /><button type="button" onClick={addAdditionalEmail} className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">+ Add</button></div>{form.additional_emails?.length > 0 && <div className="flex flex-wrap gap-2">{form.additional_emails.map(email => <span key={email} className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs">{email}<button type="button" onClick={() => removeAdditionalEmail(email)} className="text-purple-500 hover:text-purple-700">&times;</button></span>)}</div>}</div>}{tab === 'clients' && <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} /></div>}{tab === 'services' && <div><label className="block text-sm font-medium mb-1">Tasks * (comma separated)</label><textarea value={Array.isArray(form.tasks) ? form.tasks.join(', ') : form.tasks || ''} onChange={e => setForm({ ...form, tasks: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={3} /></div>}<button onClick={save} className="w-full bg-purple-600 text-white py-2 rounded-lg font-medium">Save</button></div></div></div>
  );
}

function AddProjectModal({ clients, services, onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', client_id: '', due_date: '', selectedServices: [] });
  const hasSitePlan = form.selectedServices.some(sn => services.find(s => s.name === sn)?.tasks.some(t => t.toLowerCase().includes('site plan')));
  const previewTasks = form.selectedServices.flatMap(sn => services.find(s => s.name === sn)?.tasks || []);
  const filteredTasks = hasSitePlan ? previewTasks.filter(t => !(t.toLowerCase().includes('floor plan') && t.toLowerCase().includes('client'))) : previewTasks;
  const create = () => {
    if (!form.name || !form.client_id || !form.due_date || !form.selectedServices.length) { alert('Fill all fields'); return; }
    const serviceTypes = [...new Set(filteredTasks.map(t => { const m = t.match(/Submit (.+?) to (editor|client)/i); return m ? m[1] : null; }).filter(Boolean))];
    const tasks = filteredTasks.map(tt => ({ text: tt, is_editor_task: tt.toLowerCase().includes('editor'), is_client_task: tt.toLowerCase().includes('client') }));
    onCreate({ name: form.name, client_id: form.client_id, due_date: form.due_date, services: form.selectedServices, service_types: serviceTypes }, tasks);
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto"><div className="p-4 border-b flex justify-between"><h2 className="text-lg font-bold">New Project</h2><button onClick={onClose} className="text-2xl text-gray-400">&times;</button></div><div className="p-4 space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-medium mb-1">Project Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div><div><label className="block text-sm font-medium mb-1">Client</label><select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="">Select...</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div></div><div><label className="block text-sm font-medium mb-1">Due Date</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div><div><label className="block text-sm font-medium mb-2">Services</label><div className="grid grid-cols-2 gap-2">{services.map(s => <label key={s.id} className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer ${form.selectedServices.includes(s.name) ? 'border-purple-400 bg-purple-50' : 'border-gray-200'}`}><input type="checkbox" checked={form.selectedServices.includes(s.name)} onChange={e => setForm({ ...form, selectedServices: e.target.checked ? [...form.selectedServices, s.name] : form.selectedServices.filter(x => x !== s.name) })} className="w-4 h-4" /><span className="text-sm">{s.name}</span></label>)}</div></div>{filteredTasks.length > 0 && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3"><p className="text-sm font-medium text-blue-800 mb-2">📋 This will create:</p><ul className="text-xs text-blue-700 space-y-1 max-h-40 overflow-auto">{filteredTasks.map((t, i) => <li key={i}>• {t}</li>)}</ul>{hasSitePlan && <p className="text-xs text-orange-600 mt-2">ℹ️ Floor Plan client upload removed (Site Plan replaces it)</p>}</div>}<button onClick={create} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Create Project</button></div></div></div>
  );
}

function EditProjectModal({ project, clients, services, onClose, onSave }) {
  const [form, setForm] = useState({ 
    name: project.name, 
    due_date: project.due_date, 
    client_id: project.client_id,
    services: project.services || []
  });
  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-auto"><div className="p-4 border-b flex justify-between"><h2 className="text-lg font-bold">Edit Project</h2><button onClick={onClose} className="text-2xl text-gray-400">&times;</button></div><div className="p-4 space-y-4"><div><label className="block text-sm font-medium mb-1">Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div><div><label className="block text-sm font-medium mb-1">Due Date</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div><div><label className="block text-sm font-medium mb-1">Client</label><select value={form.client_id || ''} onChange={e => setForm({ ...form, client_id: e.target.value || null })} className={`w-full border rounded-lg px-3 py-2 ${!form.client_id ? 'border-red-300 bg-red-50' : ''}`}><option value="">Select client...</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{!form.client_id && <p className="text-xs text-red-500 mt-1">⚠️ Please assign a client</p>}</div><div><label className="block text-sm font-medium mb-2">Services</label><div className="grid grid-cols-2 gap-2 max-h-40 overflow-auto">{services.map(s => <label key={s.id} className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer text-sm ${form.services.includes(s.name) ? 'border-purple-400 bg-purple-50' : 'border-gray-200'}`}><input type="checkbox" checked={form.services.includes(s.name)} onChange={e => setForm({ ...form, services: e.target.checked ? [...form.services, s.name] : form.services.filter(x => x !== s.name) })} className="w-4 h-4" /><span>{s.name}</span></label>)}</div><p className="text-xs text-gray-400 mt-1">Note: Changing services won't add/remove tasks</p></div><button onClick={() => onSave(form)} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Save</button></div></div></div>;
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
