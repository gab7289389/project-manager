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
// FILE STORAGE - Resumable chunked uploads
// =============================================

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
const PARALLEL_CHUNKS = 3; // Upload 3 chunks simultaneously
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
  } catch {
    // localStorage might be full or unavailable
  }
}

// Clear upload progress
function clearUploadProgress(uploadId) {
  try {
    localStorage.removeItem(`upload_${uploadId}`);
  } catch {
    // Ignore errors
  }
}

// Simple upload for small files
async function uploadSmallFile(fileName, file, onProgress) {
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
          const bytesDiff = e.loaded - lastLoaded;
          currentSpeed = bytesDiff / timeDiff;
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
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
    
    xhr.open('POST', `${UPLOAD_SERVER_URL}/upload`);
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
    xhr.send(file);
  });
}

// Upload a single chunk
async function uploadChunk(uploadId, fileName, chunkIndex, totalChunks, chunkBlob) {
  const response = await fetch(`${UPLOAD_SERVER_URL}/upload-chunk`, {
    method: 'POST',
    headers: {
      'X-Upload-Id': uploadId,
      'X-File-Name': encodeURIComponent(fileName),
      'X-Chunk-Index': chunkIndex.toString(),
      'X-Total-Chunks': totalChunks.toString(),
    },
    body: chunkBlob,
  });
  
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Chunk ${chunkIndex} failed`);
  }
  
  return response.json();
}

// Check which chunks are already uploaded (for resume)
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

// Main upload function with resume support
export const uploadFile = async (projectId, file, onProgress) => {
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = `${projectId}/${Date.now()}-${safeFileName}`;
  
  if (!UPLOAD_SERVER_URL) {
    throw new Error('Upload server not configured');
  }
  
  // Small files - use simple upload
  if (file.size <= SMALL_FILE_THRESHOLD) {
    return uploadSmallFile(fileName, file, onProgress);
  }
  
  // Large files - use chunked upload with resume
  const uploadId = generateUploadId(file, projectId);
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  // Check for existing progress (resume)
  let uploadedChunks = new Set();
  const savedProgress = getUploadProgress(uploadId);
  
  if (savedProgress && savedProgress.fileName === fileName) {
    // Verify chunks actually exist on server
    const serverChunks = await checkUploadedChunks(uploadId, totalChunks);
    uploadedChunks = new Set(serverChunks);
    console.log(`Resuming upload: ${uploadedChunks.size}/${totalChunks} chunks already uploaded`);
  }
  
  // Save initial progress
  saveUploadProgress(uploadId, {
    fileName,
    totalChunks,
    uploadedChunks: Array.from(uploadedChunks),
    startedAt: savedProgress?.startedAt || Date.now(),
  });
  
  const startTime = Date.now();
  let completedBytes = uploadedChunks.size * CHUNK_SIZE;
  let lastTime = startTime;
  let lastBytes = completedBytes;
  let currentSpeed = 0;
  
  // Report initial progress if resuming
  if (uploadedChunks.size > 0 && onProgress) {
    const percent = Math.round((completedBytes / file.size) * 100);
    onProgress(percent, 0, 0);
  }
  
  // Get chunks that still need uploading
  const remainingChunks = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!uploadedChunks.has(i)) {
      remainingChunks.push(i);
    }
  }
  
  // Upload remaining chunks in parallel batches
  for (let i = 0; i < remainingChunks.length; i += PARALLEL_CHUNKS) {
    const batch = remainingChunks.slice(i, i + PARALLEL_CHUNKS);
    
    await Promise.all(batch.map(async (chunkIndex) => {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      // Retry logic for transient failures
      let retries = 3;
      while (retries > 0) {
        try {
          await uploadChunk(uploadId, fileName, chunkIndex, totalChunks, chunk);
          uploadedChunks.add(chunkIndex);
          
          // Update progress
          completedBytes = uploadedChunks.size * CHUNK_SIZE;
          if (completedBytes > file.size) completedBytes = file.size;
          
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          if (timeDiff >= 0.2) {
            currentSpeed = (completedBytes - lastBytes) / timeDiff;
            lastBytes = completedBytes;
            lastTime = now;
          }
          
          if (onProgress) {
            const percent = Math.round((completedBytes / file.size) * 100);
            const remaining = file.size - completedBytes;
            const eta = currentSpeed > 0 ? remaining / currentSpeed : 0;
            onProgress(percent, currentSpeed, eta);
          }
          
          // Save progress after each chunk
          saveUploadProgress(uploadId, {
            fileName,
            totalChunks,
            uploadedChunks: Array.from(uploadedChunks),
            startedAt: savedProgress?.startedAt || startTime,
          });
          
          break; // Success, exit retry loop
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
        }
      }
    }));
  }
  
  // All chunks uploaded - finalize
  if (onProgress) onProgress(99, currentSpeed, 1); // Show 99% while finalizing
  
  const result = await finalizeUpload(uploadId, fileName, totalChunks);
  
  // Clear progress after successful upload
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
