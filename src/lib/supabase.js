import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Bunny Edge Script URL
const UPLOAD_SERVER_URL = process.env.NEXT_PUBLIC_UPLOAD_SERVER_URL || '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// =============================================
// DATABASE FUNCTIONS
// =============================================

// CLIENTS
export const getClients = async () => {
  const { data, error } = await supabase.from('clients').select('*').order('name');
  if (error) throw error;
  return data;
};

export const createNewClient = async (client) => {
  const { data, error } = await supabase.from('clients').insert(client).select().single();
  if (error) throw error;
  return data;
};

export const updateClient = async (id, updates) => {
  const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteClient = async (id) => {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
};

// SERVICES
export const getServices = async () => {
  const { data, error } = await supabase.from('services').select('*').order('name');
  if (error) throw error;
  return data;
};

export const createService = async (service) => {
  const { data, error } = await supabase.from('services').insert(service).select().single();
  if (error) throw error;
  return data;
};

export const updateService = async (id, updates) => {
  const { data, error } = await supabase.from('services').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteService = async (id) => {
  const { error } = await supabase.from('services').delete().eq('id', id);
  if (error) throw error;
};

// EDITORS
export const getEditors = async () => {
  const { data, error } = await supabase.from('editors').select('*').order('name');
  if (error) throw error;
  return data;
};

export const createEditor = async (editor) => {
  const { data, error } = await supabase.from('editors').insert(editor).select().single();
  if (error) throw error;
  return data;
};

export const updateEditor = async (id, updates) => {
  const { data, error } = await supabase.from('editors').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteEditor = async (id) => {
  const { error } = await supabase.from('editors').delete().eq('id', id);
  if (error) throw error;
};

// PROJECTS
export const getProjects = async () => {
  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      client:clients(*),
      tasks(*),
      revisions(*)
    `)
    .order('due_date');
  if (error) throw error;
  return data;
};

export const createProject = async (project, tasks) => {
  console.log('createProject called with tasks:', tasks);
  
  const { data: projectData, error: projectError } = await supabase
    .from('projects')
    .insert(project)
    .select()
    .single();
  
  if (projectError) {
    console.error('Project insert error:', projectError);
    throw projectError;
  }
  
  console.log('Project created:', projectData.id, 'Now inserting', tasks.length, 'tasks');
  
  if (tasks.length > 0) {
    const tasksWithProjectId = tasks.map(t => ({ ...t, project_id: projectData.id }));
    console.log('Tasks to insert:', tasksWithProjectId);
    const { error: tasksError } = await supabase.from('tasks').insert(tasksWithProjectId);
    if (tasksError) {
      console.error('Tasks insert error:', tasksError);
      throw tasksError;
    }
    console.log('Tasks inserted successfully');
  } else {
    console.log('No tasks to insert!');
  }
  
  return projectData;
};

export const updateProject = async (id, updates) => {
  const { data, error } = await supabase.from('projects').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteProject = async (id) => {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
};

// TASKS
export const updateTask = async (id, updates) => {
  const { data, error } = await supabase.from('tasks').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

// REVISIONS
export const createRevision = async (revision, tasks) => {
  const { data: revisionData, error: revisionError } = await supabase
    .from('revisions')
    .insert(revision)
    .select()
    .single();
  
  if (revisionError) throw revisionError;
  
  let createdTasks = [];
  if (tasks.length > 0) {
    const tasksWithIds = tasks.map(t => ({ ...t, revision_id: revisionData.id }));
    const { data: tasksData, error: tasksError } = await supabase
      .from('tasks')
      .insert(tasksWithIds)
      .select();
    if (tasksError) throw tasksError;
    createdTasks = tasksData || [];
  }
  
  return { revision: revisionData, tasks: createdTasks };
};

export const updateRevision = async (id, updates) => {
  const { data, error } = await supabase.from('revisions').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteRevision = async (id) => {
  const { error } = await supabase.from('revisions').delete().eq('id', id);
  if (error) throw error;
};

// MAGIC LINKS
export const createMagicLink = async (projectId, clientId, taskIds, pendingTaskIds = []) => {
  const { data, error } = await supabase
    .from('magic_links')
    .insert({
      project_id: projectId,
      client_id: clientId,
      task_ids: taskIds,
      pending_task_ids: pendingTaskIds
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const getMagicLink = async (token) => {
  const { data, error } = await supabase.rpc('validate_magic_link', { link_token: token });
  if (error) throw error;
  return data?.[0];
};

export const markMagicLinkAccessed = async (token) => {
  const { error } = await supabase
    .from('magic_links')
    .update({ accessed_at: new Date().toISOString() })
    .eq('token', token);
  if (error) throw error;
};

// =============================================
// FILE STORAGE - Robust resumable uploads
// =============================================

const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks
const PARALLEL_CHUNKS = 6; // 6 parallel uploads for max speed
const MAX_RETRIES = 10;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000, 30000, 30000];

// Bunny Edge Script URL
const UPLOAD_SERVER_URL = process.env.NEXT_PUBLIC_UPLOAD_SERVER_URL || '';
const BUNNY_CDN_URL = process.env.NEXT_PUBLIC_BUNNY_CDN_URL || 'https://dxtr-staging.b-cdn.net';

// Wait for network
function waitForOnline() {
  return new Promise((resolve) => {
    if (navigator.onLine) return resolve();
    const handler = () => { window.removeEventListener('online', handler); resolve(); };
    window.addEventListener('online', handler);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Generate unique upload ID
function generateUploadId(file, projectId) {
  return `${projectId}_${file.name}_${file.size}_${file.lastModified}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

// Upload single chunk with retry
async function uploadChunkWithRetry(uploadId, fileName, chunkIndex, totalChunks, chunkBlob, onProgress, onStatusChange) {
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
    if (!navigator.onLine) {
      onStatusChange?.('waiting', 'Waiting for connection...');
      await waitForOnline();
      onStatusChange?.('uploading', 'Resuming...');
      await sleep(1000);
    }
    
    try {
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(chunkIndex, e.loaded, e.total);
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              resolve({ success: true });
            }
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        });
        
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('timeout', () => reject(new Error('Timeout')));
        xhr.timeout = 300000; // 5 min timeout per chunk
        
        xhr.open('POST', `${UPLOAD_SERVER_URL}/upload-chunk`);
        xhr.setRequestHeader('X-Upload-Id', uploadId);
        xhr.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
        xhr.setRequestHeader('X-Chunk-Index', chunkIndex.toString());
        xhr.setRequestHeader('X-Total-Chunks', totalChunks.toString());
        xhr.send(chunkBlob);
      });
    } catch (error) {
      retries++;
      if (retries >= MAX_RETRIES) throw error;
      
      const delay = RETRY_DELAYS[Math.min(retries - 1, RETRY_DELAYS.length - 1)];
      onStatusChange?.('retrying', `Retry ${retries}/${MAX_RETRIES}...`);
      await sleep(delay);
    }
  }
}

// Main upload function
export const uploadFile = async (projectId, file, onProgress, onStatusChange) => {
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = `${projectId}/${Date.now()}-${safeFileName}`;
  
  if (!UPLOAD_SERVER_URL) {
    throw new Error('Upload server not configured');
  }
  
  // Small files - direct upload
  if (file.size <= CHUNK_SIZE) {
    return uploadSmallFile(fileName, file, onProgress, onStatusChange);
  }
  
  // Large files - parallel chunk upload (no server-side combine)
  const uploadId = generateUploadId(file, projectId);
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  onStatusChange?.('uploading', 'Uploading...');
  
  // Progress tracking
  const chunkProgress = new Map();
  let lastTime = Date.now();
  let lastBytes = 0;
  let speedSamples = [];
  
  const updateProgress = (chunkIndex, loaded) => {
    chunkProgress.set(chunkIndex, loaded);
    
    let totalBytes = 0;
    for (const bytes of chunkProgress.values()) {
      totalBytes += bytes;
    }
    
    const now = Date.now();
    const timeDiff = (now - lastTime) / 1000;
    if (timeDiff >= 0.2) {
      const speed = (totalBytes - lastBytes) / timeDiff;
      speedSamples.push(speed);
      if (speedSamples.length > 10) speedSamples.shift();
      lastBytes = totalBytes;
      lastTime = now;
    }
    
    const avgSpeed = speedSamples.length > 0 
      ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length 
      : 0;
    
    const percent = Math.round((totalBytes / file.size) * 100);
    const remaining = file.size - totalBytes;
    const eta = avgSpeed > 0 ? remaining / avgSpeed : 0;
    onProgress?.(Math.min(percent, 99), avgSpeed, eta);
  };
  
  // Upload all chunks in parallel
  const uploadQueue = [];
  for (let i = 0; i < totalChunks; i++) {
    uploadQueue.push(i);
  }
  
  const activeUploads = new Set();
  const completedChunks = new Set();
  const errors = [];
  
  await new Promise((resolve, reject) => {
    const processQueue = async () => {
      while (uploadQueue.length > 0 || activeUploads.size > 0) {
        // Start new uploads up to limit
        while (uploadQueue.length > 0 && activeUploads.size < PARALLEL_CHUNKS) {
          const chunkIndex = uploadQueue.shift();
          activeUploads.add(chunkIndex);
          
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);
          
          (async () => {
            try {
              await uploadChunkWithRetry(
                uploadId, fileName, chunkIndex, totalChunks, chunk,
                (idx, loaded) => updateProgress(idx, loaded),
                onStatusChange
              );
              completedChunks.add(chunkIndex);
              chunkProgress.set(chunkIndex, end - start);
              updateProgress(chunkIndex, end - start);
            } catch (error) {
              errors.push({ chunkIndex, error });
            } finally {
              activeUploads.delete(chunkIndex);
            }
          })();
        }
        
        await sleep(50);
      }
      
      if (errors.length > 0) {
        reject(new Error(`Failed to upload ${errors.length} chunks`));
      } else {
        resolve();
      }
    };
    
    processQueue();
  });
  
  // Store chunk info in the URL (no server-side combine)
  // Format: baseUrl#chunks=N&uploadId=X
  const chunkedUrl = `${BUNNY_CDN_URL}/${fileName}#chunks=${totalChunks}&uploadId=${uploadId}&size=${file.size}&name=${encodeURIComponent(file.name)}`;
  
  onProgress?.(100, 0, 0);
  onStatusChange?.('complete', 'Upload complete');
  
  return {
    fileName: file.name,
    fileUrl: chunkedUrl,
    isChunked: true,
    totalChunks,
    uploadId,
    fileSize: file.size
  };
};

// Small file upload
async function uploadSmallFile(fileName, file, onProgress, onStatusChange) {
  let retries = 0;
  let startTime = Date.now();
  let lastLoaded = 0;
  let lastTime = startTime;
  let speedSamples = [];
  
  while (retries < MAX_RETRIES) {
    if (!navigator.onLine) {
      onStatusChange?.('waiting', 'Waiting for connection...');
      await waitForOnline();
      onStatusChange?.('uploading', 'Resuming...');
    }
    
    try {
      onStatusChange?.('uploading', 'Uploading...');
      
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            const now = Date.now();
            const timeDiff = (now - lastTime) / 1000;
            
            if (timeDiff >= 0.2) {
              const speed = (e.loaded - lastLoaded) / timeDiff;
              speedSamples.push(speed);
              if (speedSamples.length > 10) speedSamples.shift();
              lastLoaded = e.loaded;
              lastTime = now;
            }
            
            const avgSpeed = speedSamples.length > 0
              ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
              : 0;
            
            const percent = Math.round((e.loaded / e.total) * 100);
            const remaining = e.total - e.loaded;
            const eta = avgSpeed > 0 ? remaining / avgSpeed : 0;
            onProgress(percent, avgSpeed, eta);
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              onProgress?.(100, 0, 0);
              onStatusChange?.('complete', 'Upload complete');
              resolve({ fileName: file.name, fileUrl: result.url });
            } catch {
              reject(new Error('Invalid response'));
            }
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        });
        
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.timeout = 300000;
        
        xhr.open('POST', `${UPLOAD_SERVER_URL}/upload`);
        xhr.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
        xhr.send(file);
      });
    } catch (error) {
      retries++;
      if (retries >= MAX_RETRIES) throw error;
      
      const delay = RETRY_DELAYS[Math.min(retries - 1, RETRY_DELAYS.length - 1)];
      onStatusChange?.('retrying', `Retry ${retries}/${MAX_RETRIES}...`);
      await sleep(delay);
    }
  }
}

// Download and combine chunks on client side
export async function downloadChunkedFile(fileUrl, onProgress) {
  // Parse chunk info from URL hash
  const url = new URL(fileUrl);
  const hash = url.hash.slice(1);
  const params = new URLSearchParams(hash);
  
  const totalChunks = parseInt(params.get('chunks'));
  const uploadId = params.get('uploadId');
  const fileSize = parseInt(params.get('size'));
  const fileName = decodeURIComponent(params.get('name'));
  const basePath = url.pathname;
  
  if (!totalChunks || !uploadId) {
    // Not a chunked file, download directly
    window.location.href = fileUrl.split('#')[0];
    return;
  }
  
  // Download all chunks in parallel
  const chunks = new Array(totalChunks);
  let downloadedBytes = 0;
  let lastTime = Date.now();
  let lastBytes = 0;
  let speedSamples = [];
  
  const updateProgress = () => {
    const now = Date.now();
    const timeDiff = (now - lastTime) / 1000;
    if (timeDiff >= 0.2) {
      const speed = (downloadedBytes - lastBytes) / timeDiff;
      speedSamples.push(speed);
      if (speedSamples.length > 10) speedSamples.shift();
      lastBytes = downloadedBytes;
      lastTime = now;
    }
    
    const avgSpeed = speedSamples.length > 0 
      ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length 
      : 0;
    
    const percent = Math.round((downloadedBytes / fileSize) * 100);
    onProgress?.(percent, avgSpeed);
  };
  
  // Download chunks with concurrency limit
  const PARALLEL_DOWNLOADS = 6;
  const downloadQueue = [];
  for (let i = 0; i < totalChunks; i++) {
    downloadQueue.push(i);
  }
  
  const activeDownloads = new Set();
  
  await new Promise((resolve, reject) => {
    const processQueue = async () => {
      while (downloadQueue.length > 0 || activeDownloads.size > 0) {
        while (downloadQueue.length > 0 && activeDownloads.size < PARALLEL_DOWNLOADS) {
          const chunkIndex = downloadQueue.shift();
          activeDownloads.add(chunkIndex);
          
          (async () => {
            try {
              const chunkUrl = `${url.origin}${basePath}.chunk${chunkIndex}`;
              const response = await fetch(chunkUrl);
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              
              const blob = await response.blob();
              chunks[chunkIndex] = blob;
              downloadedBytes += blob.size;
              updateProgress();
            } catch (error) {
              console.error(`Chunk ${chunkIndex} failed:`, error);
              // Retry once
              try {
                const chunkUrl = `${url.origin}${basePath}.chunk${chunkIndex}`;
                const response = await fetch(chunkUrl);
                const blob = await response.blob();
                chunks[chunkIndex] = blob;
                downloadedBytes += blob.size;
                updateProgress();
              } catch (e) {
                reject(new Error(`Failed to download chunk ${chunkIndex}`));
              }
            } finally {
              activeDownloads.delete(chunkIndex);
            }
          })();
        }
        
        await sleep(50);
      }
      resolve();
    };
    
    processQueue();
  });
  
  // Combine chunks into single blob
  const combinedBlob = new Blob(chunks, { type: 'application/octet-stream' });
  
  // Trigger download
  const downloadUrl = URL.createObjectURL(combinedBlob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
  
  return { success: true };
}

// Check if URL is a chunked file
export function isChunkedFile(fileUrl) {
  return fileUrl && fileUrl.includes('#chunks=');
}

export const deleteFile = async (fileUrl) => {
  if (!UPLOAD_SERVER_URL) return;
  
  try {
    // For chunked files, delete all chunks
    if (isChunkedFile(fileUrl)) {
      const url = new URL(fileUrl);
      const hash = url.hash.slice(1);
      const params = new URLSearchParams(hash);
      const totalChunks = parseInt(params.get('chunks'));
      const basePath = url.pathname;
      
      for (let i = 0; i < totalChunks; i++) {
        await fetch(`${UPLOAD_SERVER_URL}/delete`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: `${basePath}.chunk${i}` }),
        });
      }
    } else {
      await fetch(`${UPLOAD_SERVER_URL}/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: fileUrl }),
      });
    }
  } catch (error) {
    console.error('Delete error:', error);
  }
};

// Legacy exports
export function getPendingUploads() { return []; }
export function clearPendingUpload() {}

export const deleteFile = async (fileUrl) => {
  if (!UPLOAD_SERVER_URL) return;
  
  try {
    await fetch(`${UPLOAD_SERVER_URL}/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: fileUrl }),
    });
  } catch (error) {
    console.error('Delete error:', error);
  }
};
