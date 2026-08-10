import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
  // Simple version - stores password as-is (migration adds proper hashing)
  const insertData = {
    name: editor.name,
    email: editor.email || ''
  };
  
  // Only add these fields if migration has been run
  if (editor.username) insertData.username = editor.username;
  if (editor.password) insertData.password_hash = editor.password; // Plain text until migration
  
  const { data: newEditor, error: insertError } = await supabase
    .from('editors')
    .insert(insertData)
    .select('*')
    .single();
  if (insertError) throw insertError;
  return newEditor;
};

export const updateEditor = async (id, updates) => {
  let updateData = { ...updates };
  // Move password to password_hash if provided
  if (updates.password) {
    updateData.password_hash = updates.password;
    delete updateData.password;
  }
  
  const { data, error } = await supabase.from('editors').update(updateData).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
};

export const deleteEditor = async (id) => {
  const { error } = await supabase.from('editors').delete().eq('id', id);
  if (error) throw error;
};

// EDITOR AUTH
export const loginEditor = async (username, password) => {
  // Try RPC first (if migration has been run), fall back to simple check
  try {
    const { data, error } = await supabase.rpc('verify_editor_password', {
      input_username: username,
      input_password: password
    });
    if (!error && data && data.length > 0) {
      return data[0]; // { editor_id, editor_name, session_token }
    }
  } catch (e) {
    // RPC doesn't exist, fall back to simple check
  }
  
  // Fallback: simple password check (for pre-migration)
  const { data: editor, error } = await supabase
    .from('editors')
    .select('*')
    .eq('username', username)
    .single();
  
  if (error || !editor) {
    // Try by name if username doesn't exist
    const { data: editorByName } = await supabase
      .from('editors')
      .select('*')
      .eq('name', username)
      .single();
    
    if (!editorByName) return null;
    
    // Check password (plain text or hash)
    if (editorByName.password_hash === password || !editorByName.password_hash) {
      return { editor_id: editorByName.id, editor_name: editorByName.name, session_token: editorByName.id };
    }
    return null;
  }
  
  // Check password (plain text match for pre-migration)
  if (editor.password_hash === password || !editor.password_hash) {
    return { editor_id: editor.id, editor_name: editor.name, session_token: editor.id };
  }
  
  return null;
};

export const getEditorFromToken = async (token) => {
  // Try RPC first, fall back to direct lookup
  try {
    const { data, error } = await supabase.rpc('get_editor_from_token', {
      input_token: token
    });
    if (!error && data && data.length > 0) {
      return data[0];
    }
  } catch (e) {
    // RPC doesn't exist
  }
  
  // Fallback: token is editor ID
  const { data: editor } = await supabase
    .from('editors')
    .select('id, name, username')
    .eq('id', token)
    .single();
  
  if (editor) {
    return { editor_id: editor.id, editor_name: editor.name, editor_username: editor.username };
  }
  return null;
};

export const logoutEditor = async (token) => {
  // Try to delete from sessions table, ignore errors if it doesn't exist
  try {
    await supabase.from('editor_sessions').delete().eq('token', token);
  } catch (e) {
    // Table might not exist
  }
};

// Get tasks assigned to an editor
export const getEditorTasks = async (editorId) => {
  // Try with is_editor_task filter first, fall back to just editor_id
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        project:projects(
          id,
          name,
          due_date,
          client:clients(id, name)
        )
      `)
      .eq('editor_id', editorId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('getEditorTasks error:', e);
    return [];
  }
};

// Simple file upload for assets (uses client folder instead of project)
export const uploadAsset = async (clientId, file) => {
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = `assets/${clientId}/${Date.now()}-${safeFileName}`;
  
  const response = await fetch(`https://syd.storage.bunnycdn.com/dxtr-staging/${fileName}`, {
    method: 'PUT',
    headers: {
      'AccessKey': '8075c367-6712-48c4-a7a5f328e971-f829-4873',
      'Content-Type': file.type || 'application/octet-stream'
    },
    body: file
  });
  
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }
  
  return {
    fileUrl: `https://dxtr-staging.b-cdn.net/${fileName}`,
    fileName: file.name
  };
};

// Simple file upload for editor submissions
export const uploadEditorFile = async (projectId, file) => {
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = `${projectId}/${Date.now()}-${safeFileName}`;
  
  const response = await fetch(`https://syd.storage.bunnycdn.com/dxtr-staging/${fileName}`, {
    method: 'PUT',
    headers: {
      'AccessKey': '8075c367-6712-48c4-a7a5f328e971-f829-4873',
      'Content-Type': file.type || 'application/octet-stream'
    },
    body: file
  });
  
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }
  
  return {
    fileUrl: `https://dxtr-staging.b-cdn.net/${fileName}`,
    fileName: file.name
  };
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
export const createTask = async (task) => {
  const { data, error } = await supabase.from('tasks').insert(task).select().single();
  if (error) throw error;
  return data;
};

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
// FILE STORAGE - Direct upload to Bunny Storage
// =============================================

const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunks - no proxy limit!
const PARALLEL_CHUNKS = 6; // 6 parallel uploads
const MAX_RETRIES = 10;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000, 30000, 30000];

// Direct Bunny Storage config - API key exposed (internal tool only!)
const BUNNY_STORAGE_HOST = 'https://syd.storage.bunnycdn.com';
const BUNNY_STORAGE_ZONE = 'dxtr-staging';
const BUNNY_API_KEY = '8075c367-6712-48c4-a7a5f328e971-f829-4873';
const BUNNY_CDN_URL = 'https://dxtr-staging.b-cdn.net';

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

// Upload single chunk with retry - DIRECT to Bunny Storage
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
        const chunkFileName = `${fileName}_chunk${chunkIndex}.bin`;
        const storageUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${chunkFileName}`;
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(chunkIndex, e.loaded, e.total);
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ success: true, chunkIndex, url: `${BUNNY_CDN_URL}/${chunkFileName}` });
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        });
        
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('timeout', () => reject(new Error('Timeout')));
        xhr.timeout = 300000; // 5 min timeout per chunk
        
        xhr.open('PUT', storageUrl);
        xhr.setRequestHeader('AccessKey', BUNNY_API_KEY);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
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
            onProgress?.(100, 0, 0);
            onStatusChange?.('complete', 'Upload complete');
            resolve({ fileName: file.name, fileUrl: `${BUNNY_CDN_URL}/${fileName}` });
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        });
        
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.timeout = 300000;
        
        const storageUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${fileName}`;
        xhr.open('PUT', storageUrl);
        xhr.setRequestHeader('AccessKey', BUNNY_API_KEY);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
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
              const chunkUrl = `${url.origin}${basePath}_chunk${chunkIndex}.bin`;
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
                const chunkUrl = `${url.origin}${basePath}_chunk${chunkIndex}.bin`;
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
  try {
    // For chunked files, delete all chunks
    if (isChunkedFile(fileUrl)) {
      const url = new URL(fileUrl);
      const hash = url.hash.slice(1);
      const params = new URLSearchParams(hash);
      const totalChunks = parseInt(params.get('chunks'));
      const basePath = url.pathname.replace(/^\//, '');
      
      for (let i = 0; i < totalChunks; i++) {
        const storageUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${basePath}_chunk${i}.bin`;
        await fetch(storageUrl, {
          method: 'DELETE',
          headers: { 'AccessKey': BUNNY_API_KEY },
        });
      }
    } else {
      let filePath = fileUrl;
      if (filePath.startsWith('http')) {
        filePath = new URL(filePath).pathname.replace(/^\//, '');
      }
      const storageUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${filePath}`;
      await fetch(storageUrl, {
        method: 'DELETE',
        headers: { 'AccessKey': BUNNY_API_KEY },
      });
    }
  } catch (error) {
    console.error('Delete error:', error);
  }
};

// Legacy exports
export function getPendingUploads() { return []; }
export function clearPendingUpload() {}

// =============================================
// DELETE INDIVIDUAL TASK
// =============================================
export const deleteTask = async (taskId, fileUrl = null) => {
  // If task has a file, delete it from storage first
  if (fileUrl && fileUrl !== 'uploading') {
    try {
      await deleteFile(fileUrl);
    } catch (e) {
      console.error('Failed to delete task file:', e);
    }
  }
  
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw error;
};

// =============================================
// REAL-TIME SUBSCRIPTIONS
// =============================================
export const subscribeToProjects = (callback) => {
  const channel = supabase
    .channel('projects-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, callback)
    .subscribe();
  
  return () => supabase.removeChannel(channel);
};

export const subscribeToTasks = (callback) => {
  const channel = supabase
    .channel('tasks-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, callback)
    .subscribe();
  
  return () => supabase.removeChannel(channel);
};

export const subscribeToAll = (onProjectChange, onTaskChange, onClientChange, onEditorChange) => {
  const channel = supabase
    .channel('all-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, onProjectChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onTaskChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, onClientChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'editors' }, onEditorChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'revisions' }, onProjectChange) // Revisions affect projects
    .subscribe();
  
  return () => supabase.removeChannel(channel);
};

// =============================================
// ASSETS (Client brand assets: images, videos, fonts)
// =============================================
export const getAssets = async (clientId = null) => {
  let query = supabase.from('client_assets').select('*').order('created_at', { ascending: false });
  if (clientId) {
    query = query.eq('client_id', clientId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const createAsset = async (asset) => {
  const { data, error } = await supabase.from('client_assets').insert(asset).select().single();
  if (error) throw error;
  return data;
};

export const deleteAsset = async (assetId, fileUrl) => {
  // Delete file from storage
  if (fileUrl) {
    try {
      await deleteFile(fileUrl);
    } catch (e) {
      console.error('Failed to delete asset file:', e);
    }
  }
  
  const { error } = await supabase.from('client_assets').delete().eq('id', assetId);
  if (error) throw error;
};

export const getTaskAssets = async (taskId) => {
  const { data, error } = await supabase
    .from('task_assets')
    .select('*, asset:client_assets(*)')
    .eq('task_id', taskId);
  if (error) throw error;
  return data?.map(ta => ta.asset) || [];
};

export const linkAssetToTask = async (taskId, assetId) => {
  const { data, error } = await supabase
    .from('task_assets')
    .insert({ task_id: taskId, asset_id: assetId })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const unlinkAssetFromTask = async (taskId, assetId) => {
  const { error } = await supabase
    .from('task_assets')
    .delete()
    .eq('task_id', taskId)
    .eq('asset_id', assetId);
  if (error) throw error;
};

// =============================================
// EDITOR ASSIGNMENT
// =============================================
export const assignTaskToEditor = async (taskId, editorId, dueDate, notes = '', rawFiles = []) => {
  try {
    // Try with all columns first
    const { data, error } = await supabase
      .from('tasks')
      .update({
        editor_id: editorId,
        editor_due_date: dueDate,
        editor_notes: notes,
        raw_files: rawFiles
      })
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.log('Some editor columns may not exist, trying minimal update');
    // Fallback - just update editor_id which should exist
    const { data, error } = await supabase
      .from('tasks')
      .update({ editor_id: editorId })
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

export const submitToEditor = async (taskId) => {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      submitted_to_editor_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const bypassEditorTask = async (taskId, bypass = true) => {
  try {
    // Try with editor_bypass column first
    const { data, error } = await supabase
      .from('tasks')
      .update({
        editor_bypass: bypass,
        completed: bypass
      })
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    // Fallback - just update completed
    console.log('editor_bypass column may not exist, falling back to completed only');
    const { data, error } = await supabase
      .from('tasks')
      .update({ completed: bypass })
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

export const bypassClientTask = async (taskId, bypass = true) => {
  try {
    // Try with client_bypass column first
    const { data, error } = await supabase
      .from('tasks')
      .update({
        client_bypass: bypass,
        completed: bypass,
        sent: bypass
      })
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    // Fallback - just update completed and sent
    console.log('client_bypass column may not exist, falling back to completed/sent only');
    const { data, error } = await supabase
      .from('tasks')
      .update({ completed: bypass, sent: bypass })
      .eq('id', taskId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};
