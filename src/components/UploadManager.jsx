import { useState, useEffect, useCallback } from 'react';

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format seconds to time string
function formatTime(seconds) {
  if (!seconds || seconds === Infinity) return '--:--';
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

// Upload status icons
const StatusIcon = ({ status }) => {
  switch (status) {
    case 'uploading':
      return <span className="animate-spin">⏳</span>;
    case 'waiting':
      return <span>📶</span>;
    case 'retrying':
      return <span className="text-yellow-500">🔄</span>;
    case 'queued':
      return <span className="text-gray-400">⏸️</span>;
    case 'complete':
      return <span className="text-green-500">✅</span>;
    case 'error':
      return <span className="text-red-500">❌</span>;
    case 'finalizing':
      return <span className="animate-pulse">⚡</span>;
    case 'checking':
      return <span>🔍</span>;
    default:
      return <span>📄</span>;
  }
};

// Single upload item row
const UploadItem = ({ item, onCancel, onRetry }) => {
  const progress = item.progress || 0;
  const speed = item.speed ? formatBytes(item.speed) + '/s' : '';
  const eta = item.eta ? formatTime(item.eta) : '';
  
  return (
    <div className="px-3 py-2 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center gap-2">
        <StatusIcon status={item.status} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" title={item.fileName}>
            {item.fileName}
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            {item.status === 'complete' ? (
              <span className="text-green-600">Complete</span>
            ) : item.status === 'error' ? (
              <span className="text-red-500">{item.error || 'Failed'}</span>
            ) : item.status === 'queued' ? (
              <span>Queued</span>
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
          <button 
            onClick={() => onRetry(item.id)}
            className="text-blue-500 hover:text-blue-700 text-xs"
          >
            Retry
          </button>
        )}
        {(item.status === 'uploading' || item.status === 'queued') && onCancel && (
          <button 
            onClick={() => onCancel(item.id)}
            className="text-gray-400 hover:text-red-500 text-xs"
          >
            ✕
          </button>
        )}
      </div>
      {item.status !== 'complete' && item.status !== 'error' && item.status !== 'queued' && (
        <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

// Main Upload Manager Component
export default function UploadManager({ uploads, onCancel, onRetry, onClear }) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  
  // Calculate totals
  const activeUploads = uploads.filter(u => 
    u.status === 'uploading' || u.status === 'waiting' || u.status === 'retrying' || u.status === 'finalizing'
  );
  const queuedUploads = uploads.filter(u => u.status === 'queued');
  const completedUploads = uploads.filter(u => u.status === 'complete');
  const errorUploads = uploads.filter(u => u.status === 'error');
  
  const totalSpeed = activeUploads.reduce((sum, u) => sum + (u.speed || 0), 0);
  
  // Calculate total remaining time
  const totalRemainingBytes = uploads
    .filter(u => u.status !== 'complete' && u.status !== 'error')
    .reduce((sum, u) => {
      const remaining = (u.fileSize || 0) * (1 - (u.progress || 0) / 100);
      return sum + remaining;
    }, 0);
  const totalEta = totalSpeed > 0 ? totalRemainingBytes / totalSpeed : 0;
  
  // Show panel when there are uploads
  useEffect(() => {
    if (uploads.length > 0) {
      setIsVisible(true);
    }
  }, [uploads.length]);
  
  // Auto-hide after all complete (with delay)
  useEffect(() => {
    if (uploads.length > 0 && activeUploads.length === 0 && queuedUploads.length === 0) {
      const timer = setTimeout(() => {
        if (errorUploads.length === 0) {
          setIsVisible(false);
          onClear?.();
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [uploads, activeUploads.length, queuedUploads.length, errorUploads.length, onClear]);
  
  if (!isVisible || uploads.length === 0) return null;
  
  const inProgressCount = activeUploads.length + queuedUploads.length;
  
  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 overflow-hidden">
      {/* Header */}
      <div 
        className="bg-gray-50 px-3 py-2 flex items-center justify-between cursor-pointer border-b border-gray-200"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {inProgressCount > 0 ? (
              <>Uploading {inProgressCount} file{inProgressCount !== 1 ? 's' : ''}</>
            ) : completedUploads.length > 0 ? (
              <>{completedUploads.length} upload{completedUploads.length !== 1 ? 's' : ''} complete</>
            ) : (
              <>Uploads</>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {inProgressCount > 0 && (
            <span className="text-xs text-gray-500">
              {formatBytes(totalSpeed)}/s
            </span>
          )}
          <button className="text-gray-400 hover:text-gray-600">
            {isMinimized ? '▲' : '▼'}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsVisible(false); onClear?.(); }}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
      </div>
      
      {/* Upload list */}
      {!isMinimized && (
        <div className="max-h-64 overflow-y-auto">
          {uploads.map(upload => (
            <UploadItem 
              key={upload.id} 
              item={upload} 
              onCancel={onCancel}
              onRetry={onRetry}
            />
          ))}
        </div>
      )}
      
      {/* Footer with totals */}
      {!isMinimized && inProgressCount > 0 && (
        <div className="bg-gray-50 px-3 py-2 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
          <span>
            {activeUploads.length} uploading
            {queuedUploads.length > 0 && `, ${queuedUploads.length} queued`}
          </span>
          <span>
            {totalEta > 0 && `${formatTime(totalEta)} remaining`}
          </span>
        </div>
      )}
    </div>
  );
}

// Hook to manage upload queue
export function useUploadManager(maxConcurrent = 2) {
  const [uploads, setUploads] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  
  // Add files to queue
  const addToQueue = useCallback((files, projectId, uploadFn) => {
    const newUploads = files.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileName: file.name,
      fileSize: file.size,
      file,
      projectId,
      uploadFn,
      status: 'queued',
      progress: 0,
      speed: 0,
      eta: 0,
      error: null,
    }));
    
    setUploads(prev => [...prev, ...newUploads]);
    return newUploads.map(u => u.id);
  }, []);
  
  // Process queue
  useEffect(() => {
    const processQueue = async () => {
      const queued = uploads.filter(u => u.status === 'queued');
      const active = uploads.filter(u => 
        u.status === 'uploading' || u.status === 'waiting' || u.status === 'retrying' || u.status === 'finalizing'
      );
      
      if (active.length >= maxConcurrent || queued.length === 0) return;
      
      const toStart = queued.slice(0, maxConcurrent - active.length);
      
      for (const upload of toStart) {
        // Mark as uploading
        setUploads(prev => prev.map(u => 
          u.id === upload.id ? { ...u, status: 'uploading' } : u
        ));
        
        // Start upload
        (async () => {
          try {
            const result = await upload.uploadFn(
              upload.projectId,
              upload.file,
              // onProgress
              (percent, speed, eta) => {
                setUploads(prev => prev.map(u => 
                  u.id === upload.id ? { ...u, progress: percent, speed, eta } : u
                ));
              },
              // onStatusChange
              (status, message) => {
                setUploads(prev => prev.map(u => 
                  u.id === upload.id ? { ...u, status, statusMessage: message } : u
                ));
              }
            );
            
            // Success
            setUploads(prev => prev.map(u => 
              u.id === upload.id ? { ...u, status: 'complete', progress: 100, fileUrl: result.fileUrl } : u
            ));
            
          } catch (error) {
            // Error
            setUploads(prev => prev.map(u => 
              u.id === upload.id ? { ...u, status: 'error', error: error.message } : u
            ));
          }
        })();
      }
    };
    
    processQueue();
  }, [uploads, maxConcurrent]);
  
  // Cancel upload
  const cancelUpload = useCallback((id) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);
  
  // Retry failed upload
  const retryUpload = useCallback((id) => {
    setUploads(prev => prev.map(u => 
      u.id === id ? { ...u, status: 'queued', progress: 0, error: null } : u
    ));
  }, []);
  
  // Clear completed/errored uploads
  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => 
      u.status !== 'complete' && u.status !== 'error'
    ));
  }, []);
  
  // Get completed uploads (for updating tasks)
  const getCompletedUploads = useCallback(() => {
    return uploads.filter(u => u.status === 'complete');
  }, [uploads]);
  
  return {
    uploads,
    addToQueue,
    cancelUpload,
    retryUpload,
    clearCompleted,
    getCompletedUploads,
  };
}
