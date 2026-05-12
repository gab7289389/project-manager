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
// FILE STORAGE - Resumable chunked uploads with smooth progress
// =============================================

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
const SMALL_FILE_THRESHOLD = 10 * 1024 * 1024; // Files under 10MB use simple upload

// Generate unique upload ID based on file properties
function generateUploadId(file, projectId) {
  return `${projectId}_${file.name}_${file.size}_${file.lastModified}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

// Get upload progress from localStorage
function getUploadProgress(uploadId) {
  try {
    const data = localStorage.getItem(`upload_${uploadId}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

// Save upload progress to localStorage
function saveUploadProgress(uploadId, progress) {
  try {
    localStorage.setItem(`upload_${uploadId}`, JSON.stringify(progress));
  } catch {}
}

// Clear upload progress
function clearUploadProgress(uploadId) {
  try {
    localStorage.removeItem(`upload_${uploadId}`);
  } catch {}
}

// Upload chunk with XHR for progress tracking
function uploadChunkWithProgress(uploadId, fileName, chunkIndex, totalChunks, chunkBlob, onChunkProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onChunkProgress) {
        onChunkProgress(chunkIndex, e.loaded, e.total);
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
        reject(new Error(`Chunk ${chunkIndex} failed: ${xhr.status}`));
      }
    });
    
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
    
    xhr.open('POST', `${UPLOAD_SERVER_URL}/upload-chunk`);
    xhr.setRequestHeader('X-Upload-Id', uploadId);
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
    xhr.setRequestHeader('X-Chunk-Index', chunkIndex.toString());
    xhr.setRequestHeader('X-Total-Chunks', totalChunks.toString());
    xhr.send(chunkBlob);
  });
}

// Check which chunks exist on server (for resume)
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

// Finalize upload - combine chunks into final file
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
export const uploadFile = async (projectId, file, onProgress) => {
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = `${projectId}/${Date.now()}-${safeFileName}`;
  
  if (!UPLOAD_SERVER_URL) {
    throw new Error('Upload server not configured');
  }
  
  // Small files - use simple direct upload
  if (file.size <= SMALL_FILE_THRESHOLD) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const startTime = Date.now();
      let lastLoaded = 0;
      let lastTime = startTime;
      let currentSpeed = 0;
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          
          if (timeDiff >= 0.1) {
            currentSpeed = (e.loaded - lastLoaded) / timeDiff;
            lastLoaded = e.loaded;
            lastTime = now;
          }
          
          const remaining = e.total - e.loaded;
          const eta = currentSpeed > 0 ? remaining / currentSpeed : 0;
          onProgress(percent, currentSpeed, eta);
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            resolve({ fileName: file.name, fileUrl: result.url });
          } catch {
            reject(new Error('Invalid server response'));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });
      
      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.open('POST', `${UPLOAD_SERVER_URL}/upload`);
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
      xhr.send(file);
    });
  }
  
  // Large files - chunked upload with resume support
  const uploadId = generateUploadId(file, projectId);
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  // Check for existing progress (resume)
  let completedChunks = new Set();
  const savedProgress = getUploadProgress(uploadId);
  
  if (savedProgress && savedProgress.fileName === fileName) {
    const serverChunks = await checkUploadedChunks(uploadId, totalChunks);
    completedChunks = new Set(serverChunks);
    if (completedChunks.size > 0) {
      console.log(`Resuming: ${completedChunks.size}/${totalChunks} chunks done`);
    }
  }
  
  // Track progress across all chunks
  const chunkProgress = new Map(); // chunkIndex -> bytes uploaded
  const startTime = Date.now();
  let lastTime = startTime;
  let lastTotalBytes = completedChunks.size * CHUNK_SIZE;
  let currentSpeed = 0;
  
  // Initialize completed chunks progress
  for (const idx of completedChunks) {
    const chunkSize = idx === totalChunks - 1 
      ? file.size - (idx * CHUNK_SIZE) 
      : CHUNK_SIZE;
    chunkProgress.set(idx, chunkSize);
  }
  
  // Progress callback for individual chunks
  const onChunkProgress = (chunkIndex, loaded, total) => {
    chunkProgress.set(chunkIndex, loaded);
    
    // Calculate total bytes across all chunks
    let totalBytes = 0;
    for (const bytes of chunkProgress.values()) {
      totalBytes += bytes;
    }
    
    // Calculate speed
    const now = Date.now();
    const timeDiff = (now - lastTime) / 1000;
    if (timeDiff >= 0.1) {
      currentSpeed = (totalBytes - lastTotalBytes) / timeDiff;
      lastTotalBytes = totalBytes;
      lastTime = now;
    }
    
    // Report progress
    if (onProgress) {
      const percent = Math.round((totalBytes / file.size) * 100);
      const remaining = file.size - totalBytes;
      const eta = currentSpeed > 0 ? remaining / currentSpeed : 0;
      onProgress(Math.min(percent, 99), currentSpeed, eta); // Cap at 99% until finalized
    }
  };
  
  // Get remaining chunks
  const remainingChunks = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!completedChunks.has(i)) {
      remainingChunks.push(i);
    }
  }
  
  // Report initial progress if resuming
  if (completedChunks.size > 0 && onProgress) {
    const completedBytes = completedChunks.size * CHUNK_SIZE;
    const percent = Math.round((completedBytes / file.size) * 100);
    onProgress(Math.min(percent, 99), 0, 0);
  }
  
  // Upload chunks sequentially for reliable progress
  for (const chunkIndex of remainingChunks) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    
    // Retry logic
    let retries = 3;
    while (retries > 0) {
      try {
        await uploadChunkWithProgress(
          uploadId, fileName, chunkIndex, totalChunks, chunk, onChunkProgress
        );
        
        completedChunks.add(chunkIndex);
        chunkProgress.set(chunkIndex, end - start);
        
        // Save progress
        saveUploadProgress(uploadId, {
          fileName,
          totalChunks,
          uploadedChunks: Array.from(completedChunks),
        });
        
        break; // Success
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        console.log(`Chunk ${chunkIndex} failed, retrying... (${retries} left)`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  
  // Finalize
  if (onProgress) onProgress(99, currentSpeed, 1);
  
  const result = await finalizeUpload(uploadId, fileName, totalChunks);
  
  clearUploadProgress(uploadId);
  
  if (onProgress) onProgress(100, currentSpeed, 0);
  
  return {
    fileName: file.name,
    fileUrl: result.url,
  };
};

export const deleteFile = async (fileUrl) => {
  if (!UPLOAD_SERVER_URL) {
    console.error('Upload server not configured');
    return;
  }
  
  try {
    const response = await fetch(`${UPLOAD_SERVER_URL}/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: fileUrl }),
    });
    
    if (!response.ok) {
      console.error('Failed to delete file:', fileUrl);
    }
  } catch (error) {
    console.error('Delete file error:', error);
  }
};
