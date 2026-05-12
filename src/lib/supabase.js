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

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
const SMALL_FILE_THRESHOLD = 10 * 1024 * 1024;
const MAX_RETRIES = 10;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000, 30000, 30000]; // Exponential backoff

// Wait for network to come back online
function waitForOnline() {
  return new Promise((resolve) => {
    if (navigator.onLine) {
      resolve();
    } else {
      const handler = () => {
        window.removeEventListener('online', handler);
        resolve();
      };
      window.addEventListener('online', handler);
    }
  });
}

// Sleep helper
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Generate unique upload ID
function generateUploadId(file, projectId) {
  return `${projectId}_${file.name}_${file.size}_${file.lastModified}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

// LocalStorage helpers for upload state
function getUploadState(uploadId) {
  try {
    const data = localStorage.getItem(`upload_${uploadId}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function saveUploadState(uploadId, state) {
  try {
    localStorage.setItem(`upload_${uploadId}`, JSON.stringify(state));
  } catch {}
}

function clearUploadState(uploadId) {
  try {
    localStorage.removeItem(`upload_${uploadId}`);
  } catch {}
}

// Get all pending uploads (for resume UI)
export function getPendingUploads() {
  const pending = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('upload_')) {
        const data = JSON.parse(localStorage.getItem(key));
        if (data && data.fileName && data.totalChunks) {
          pending.push({
            uploadId: key.replace('upload_', ''),
            ...data,
            progress: Math.round((data.uploadedChunks?.length || 0) / data.totalChunks * 100)
          });
        }
      }
    }
  } catch {}
  return pending;
}

// Clear a specific pending upload
export function clearPendingUpload(uploadId) {
  clearUploadState(uploadId);
}

// Upload chunk with XHR + network resilience
function uploadChunkWithRetry(uploadId, fileName, chunkIndex, totalChunks, chunkBlob, onProgress, onStatusChange) {
  return new Promise(async (resolve, reject) => {
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
      // Wait for online if offline
      if (!navigator.onLine) {
        onStatusChange?.('waiting', 'Waiting for connection...');
        await waitForOnline();
        onStatusChange?.('uploading', 'Connection restored, resuming...');
        await sleep(1000); // Brief pause after reconnect
      }
      
      try {
        const result = await new Promise((res, rej) => {
          const xhr = new XMLHttpRequest();
          
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
              onProgress(chunkIndex, e.loaded, e.total);
            }
          });
          
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                res(JSON.parse(xhr.responseText));
              } catch {
                res({ success: true });
              }
            } else {
              rej(new Error(`HTTP ${xhr.status}`));
            }
          });
          
          xhr.addEventListener('error', () => rej(new Error('Network error')));
          xhr.addEventListener('abort', () => rej(new Error('Aborted')));
          xhr.addEventListener('timeout', () => rej(new Error('Timeout')));
          
          xhr.timeout = 120000; // 2 minute timeout per chunk
          
          xhr.open('POST', `${UPLOAD_SERVER_URL}/upload-chunk`);
          xhr.setRequestHeader('X-Upload-Id', uploadId);
          xhr.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
          xhr.setRequestHeader('X-Chunk-Index', chunkIndex.toString());
          xhr.setRequestHeader('X-Total-Chunks', totalChunks.toString());
          xhr.send(chunkBlob);
        });
        
        resolve(result);
        return;
        
      } catch (error) {
        retries++;
        const delay = RETRY_DELAYS[Math.min(retries - 1, RETRY_DELAYS.length - 1)];
        
        console.log(`Chunk ${chunkIndex} failed (attempt ${retries}/${MAX_RETRIES}): ${error.message}`);
        
        if (retries >= MAX_RETRIES) {
          reject(new Error(`Failed after ${MAX_RETRIES} attempts: ${error.message}`));
          return;
        }
        
        onStatusChange?.('retrying', `Retry ${retries}/${MAX_RETRIES} in ${delay/1000}s...`);
        await sleep(delay);
        onStatusChange?.('uploading', 'Retrying...');
      }
    }
  });
}

// Check uploaded chunks on server
async function checkUploadedChunks(uploadId, totalChunks) {
  try {
    const response = await fetch(
      `${UPLOAD_SERVER_URL}/check-chunks?uploadId=${uploadId}&totalChunks=${totalChunks}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.uploadedChunks || [];
  } catch {
    return [];
  }
}

// Finalize upload
async function finalizeUpload(uploadId, fileName, totalChunks) {
  const response = await fetch(`${UPLOAD_SERVER_URL}/finalize-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId, fileName, totalChunks }),
  });
  
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Finalize failed');
  }
  
  return response.json();
}

// Main upload function
export const uploadFile = async (projectId, file, onProgress, onStatusChange) => {
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = `${projectId}/${Date.now()}-${safeFileName}`;
  
  if (!UPLOAD_SERVER_URL) {
    throw new Error('Upload server not configured');
  }
  
  // Small files - simple upload with retry
  if (file.size <= SMALL_FILE_THRESHOLD) {
    return uploadSmallFile(fileName, file, onProgress, onStatusChange);
  }
  
  // Large files - chunked upload
  const uploadId = generateUploadId(file, projectId);
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  // Check for existing progress
  let completedChunks = new Set();
  const savedState = getUploadState(uploadId);
  
  if (savedState && savedState.fileName === fileName) {
    // Verify chunks on server
    onStatusChange?.('checking', 'Checking previous progress...');
    const serverChunks = await checkUploadedChunks(uploadId, totalChunks);
    completedChunks = new Set(serverChunks);
    
    if (completedChunks.size > 0) {
      console.log(`Resuming: ${completedChunks.size}/${totalChunks} chunks`);
      onStatusChange?.('resuming', `Resuming from ${Math.round(completedChunks.size/totalChunks*100)}%`);
    }
  }
  
  // Save initial state
  saveUploadState(uploadId, {
    fileName,
    originalName: file.name,
    fileSize: file.size,
    totalChunks,
    uploadedChunks: Array.from(completedChunks),
    projectId,
    startedAt: savedState?.startedAt || Date.now(),
  });
  
  // Progress tracking
  const chunkProgress = new Map();
  let lastTime = Date.now();
  let lastBytes = completedChunks.size * CHUNK_SIZE;
  let speedSamples = [];
  
  // Initialize completed chunks
  for (const idx of completedChunks) {
    const size = idx === totalChunks - 1 ? file.size - (idx * CHUNK_SIZE) : CHUNK_SIZE;
    chunkProgress.set(idx, size);
  }
  
  const onChunkProgress = (chunkIndex, loaded, total) => {
    chunkProgress.set(chunkIndex, loaded);
    
    let totalBytes = 0;
    for (const bytes of chunkProgress.values()) {
      totalBytes += bytes;
    }
    
    // Smooth speed calculation
    const now = Date.now();
    const timeDiff = (now - lastTime) / 1000;
    if (timeDiff >= 0.2) {
      const instantSpeed = (totalBytes - lastBytes) / timeDiff;
      speedSamples.push(instantSpeed);
      if (speedSamples.length > 10) speedSamples.shift();
      lastBytes = totalBytes;
      lastTime = now;
    }
    
    const avgSpeed = speedSamples.length > 0 
      ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length 
      : 0;
    
    if (onProgress) {
      const percent = Math.round((totalBytes / file.size) * 100);
      const remaining = file.size - totalBytes;
      const eta = avgSpeed > 0 ? remaining / avgSpeed : 0;
      onProgress(Math.min(percent, 99), avgSpeed, eta);
    }
  };
  
  // Get remaining chunks
  const remainingChunks = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!completedChunks.has(i)) {
      remainingChunks.push(i);
    }
  }
  
  // Initial progress report
  if (completedChunks.size > 0 && onProgress) {
    const bytes = completedChunks.size * CHUNK_SIZE;
    onProgress(Math.min(Math.round(bytes / file.size * 100), 99), 0, 0);
  }
  
  onStatusChange?.('uploading', 'Uploading...');
  
  // Upload remaining chunks
  for (const chunkIndex of remainingChunks) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    
    await uploadChunkWithRetry(
      uploadId, fileName, chunkIndex, totalChunks, chunk,
      onChunkProgress, onStatusChange
    );
    
    completedChunks.add(chunkIndex);
    chunkProgress.set(chunkIndex, end - start);
    
    // Save progress after each chunk
    saveUploadState(uploadId, {
      fileName,
      originalName: file.name,
      fileSize: file.size,
      totalChunks,
      uploadedChunks: Array.from(completedChunks),
      projectId,
      startedAt: savedState?.startedAt || Date.now(),
    });
  }
  
  // Finalize
  onStatusChange?.('finalizing', 'Combining chunks...');
  onProgress?.(99, 0, 1);
  
  const result = await finalizeUpload(uploadId, fileName, totalChunks);
  
  clearUploadState(uploadId);
  
  onProgress?.(100, 0, 0);
  onStatusChange?.('complete', 'Upload complete');
  
  return {
    fileName: file.name,
    fileUrl: result.url,
  };
};

// Small file upload with retry
async function uploadSmallFile(fileName, file, onProgress, onStatusChange) {
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
    if (!navigator.onLine) {
      onStatusChange?.('waiting', 'Waiting for connection...');
      await waitForOnline();
      onStatusChange?.('uploading', 'Resuming...');
    }
    
    try {
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let lastLoaded = 0;
        let lastTime = Date.now();
        let speedSamples = [];
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            const now = Date.now();
            const timeDiff = (now - lastTime) / 1000;
            
            if (timeDiff >= 0.2) {
              const speed = (e.loaded - lastLoaded) / timeDiff;
              speedSamples.push(speed);
              if (speedSamples.length > 5) speedSamples.shift();
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
              resolve({ fileName: file.name, fileUrl: result.url });
            } catch {
              reject(new Error('Invalid response'));
            }
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        });
        
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.timeout = 120000;
        
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

// Resume a pending upload (call from UI)
export const resumeUpload = async (uploadId, file, onProgress, onStatusChange) => {
  const state = getUploadState(uploadId);
  if (!state) throw new Error('No upload to resume');
  
  // Verify file matches
  if (file.name !== state.originalName || file.size !== state.fileSize) {
    throw new Error('File does not match pending upload');
  }
  
  return uploadFile(state.projectId, file, onProgress, onStatusChange);
};

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
