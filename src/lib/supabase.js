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

// Generate unique upload ID. Deterministic for a given file so an interrupted
// upload can resume onto the same chunks instead of starting over.
function generateUploadId(file, projectId) {
  return `${projectId}_${file.name}_${file.size}_${file.lastModified}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

// Has this chunk already been uploaded at its full size? Used to resume after a
// crash or reload. Any uncertainty answers "no" - re-uploading is safe, and
// wrongly skipping a chunk would corrupt the file.
async function chunkAlreadyUploaded(fileName, chunkIndex, expectedSize) {
  const result = await probeChunk(fileName, chunkIndex);
  return result.exists && result.size === expectedSize;
}

// Ask the CDN about a chunk. Distinguishes "definitely not there" from
// "couldn't tell" - a CORS-blocked probe must not be read as a missing file.
async function probeChunk(fileName, chunkIndex) {
  try {
    const response = await fetch(`${BUNNY_CDN_URL}/${fileName}.chunk${chunkIndex}`, {
      method: 'HEAD',
      cache: 'no-store',
    });
    return {
      exists: response.ok,
      size: parseInt(response.headers.get('content-length'), 10),
      blocked: false,
    };
  } catch {
    // Network or CORS failure - no information either way.
    return { exists: false, size: NaN, blocked: true };
  }
}

// An upload server can return 2xx without actually storing anything, which
// leaves a file_url in the database pointing at chunks that do not exist.
// Confirm the first and last chunk really landed before calling it a success.
async function verifyChunksStored(fileName, totalChunks, expectedLastSize) {
  const [first, last] = await Promise.all([
    probeChunk(fileName, 0),
    probeChunk(fileName, totalChunks - 1),
  ]);

  if (first.blocked || last.blocked) {
    console.warn(
      'Could not verify uploaded chunks - the CDN blocked the check (likely ' +
      'missing CORS headers on the pull zone). Proceeding without verification.'
    );
    return;
  }

  if (!first.exists || !last.exists) {
    throw new Error(
      'Upload reported success but no chunks were stored on the CDN. ' +
      'The upload server accepted the data without saving it - check that ' +
      'it implements /upload-chunk and writes to the storage zone this app reads from.'
    );
  }

  if (Number.isFinite(expectedLastSize) && last.size !== expectedLastSize) {
    throw new Error(
      `Final chunk is ${last.size} bytes on the CDN but should be ${expectedLastSize}. ` +
      'The upload is incomplete.'
    );
  }
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

  if (!UPLOAD_SERVER_URL) {
    throw new Error('Upload server not configured');
  }

  // Small files - direct upload
  if (file.size <= CHUNK_SIZE) {
    return uploadSmallFile(`${projectId}/${Date.now()}-${safeFileName}`, file, onProgress, onStatusChange);
  }

  // Large files - parallel chunk upload (no server-side combine).
  // The path is derived from the upload id rather than Date.now() so that a
  // retry after a crash lands on the same chunks and can resume.
  const uploadId = generateUploadId(file, projectId);
  const fileName = `${projectId}/${uploadId}-${safeFileName}`;
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
  
  // Upload all chunks with a fixed-size worker pool. If any chunk exhausts its
  // retries the whole upload fails - a partial set of chunks is unusable.
  const uploadQueue = Array.from({ length: totalChunks }, (_, i) => i);

  const uploadWorker = async () => {
    while (uploadQueue.length > 0) {
      const chunkIndex = uploadQueue.shift();
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkSize = end - start;

      // Resume: skip chunks a previous attempt already uploaded intact.
      if (await chunkAlreadyUploaded(fileName, chunkIndex, chunkSize)) {
        chunkProgress.set(chunkIndex, chunkSize);
        updateProgress(chunkIndex, chunkSize);
        continue;
      }

      await uploadChunkWithRetry(
        uploadId, fileName, chunkIndex, totalChunks, file.slice(start, end),
        (idx, loaded) => updateProgress(idx, loaded),
        onStatusChange
      );

      chunkProgress.set(chunkIndex, chunkSize);
      updateProgress(chunkIndex, chunkSize);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(PARALLEL_CHUNKS, totalChunks) }, uploadWorker)
  );

  // Never record a file_url for chunks that are not actually on the CDN.
  onStatusChange?.('finalizing', 'Verifying upload...');
  await verifyChunksStored(fileName, totalChunks, file.size - (totalChunks - 1) * CHUNK_SIZE);

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

// =============================================
// CHUNKED DOWNLOAD - client-side combine
// =============================================

// Above this size a browser cannot hold the whole file in a Blob. Files larger
// than this require stream-to-disk (File System Access API, Chrome/Edge only).
export const MAX_IN_MEMORY_COMBINE = 2 * 1024 * 1024 * 1024; // 2GB

const PARALLEL_DOWNLOADS = 6;
const DOWNLOAD_RETRIES = 5;

// Check if URL is a chunked file
export function isChunkedFile(fileUrl) {
  return !!fileUrl && fileUrl.includes('#chunks=');
}

// True when the browser can stream a download straight to disk, which is the
// only way to handle files too large to fit in a Blob.
export function canStreamToDisk() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

// Parse the chunk manifest encoded in the URL hash:
//   https://cdn/<path>#chunks=N&uploadId=X&size=B&name=F
// Returns null when the URL is not a chunked file.
export function parseChunkedUrl(fileUrl) {
  if (!isChunkedFile(fileUrl)) return null;

  const url = new URL(fileUrl);
  const params = new URLSearchParams(url.hash.slice(1));

  const totalChunks = parseInt(params.get('chunks'), 10);
  const fileSize = parseInt(params.get('size'), 10);
  const uploadId = params.get('uploadId');

  if (!totalChunks || !uploadId || !Number.isFinite(fileSize)) return null;

  const base = `${url.origin}${url.pathname}`;
  return {
    totalChunks,
    uploadId,
    fileSize,
    fileName: decodeURIComponent(params.get('name') || 'download'),
    chunkUrl: (index) => `${base}.chunk${index}`,
  };
}

// Fetch one chunk, retrying on failure. Always verifies the response status —
// a 404 body would otherwise be spliced into the file as if it were data.
async function fetchChunk(chunkUrl, index) {
  let lastError;

  for (let attempt = 0; attempt < DOWNLOAD_RETRIES; attempt++) {
    if (!navigator.onLine) await waitForOnline();

    try {
      const response = await fetch(chunkUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.blob();
    } catch (error) {
      lastError = error;

      // fetch() rejects with a bare TypeError for CORS rejections, DNS
      // failures and dropped connections alike - the browser deliberately
      // withholds the detail. Retrying a CORS misconfiguration is pointless,
      // so fail fast with a message that names the likely cause.
      if (error instanceof TypeError && navigator.onLine) {
        throw new Error(
          `Could not read ${chunkUrl} - the CDN did not allow the request. ` +
          'This is usually missing CORS headers on the Bunny pull zone.'
        );
      }

      if (attempt < DOWNLOAD_RETRIES - 1) {
        await sleep(RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]);
      }
    }
  }

  throw new Error(`Chunk ${index} failed after ${DOWNLOAD_RETRIES} attempts: ${lastError?.message}`);
}

// Tracks download speed and reports percent + bytes/sec.
function createProgressReporter(fileSize, onProgress) {
  let downloadedBytes = 0;
  let lastTime = Date.now();
  let lastBytes = 0;
  const speedSamples = [];

  return {
    add(bytes) {
      downloadedBytes += bytes;

      const now = Date.now();
      const timeDiff = (now - lastTime) / 1000;
      if (timeDiff >= 0.2) {
        speedSamples.push((downloadedBytes - lastBytes) / timeDiff);
        if (speedSamples.length > 10) speedSamples.shift();
        lastBytes = downloadedBytes;
        lastTime = now;
      }

      const avgSpeed = speedSamples.length > 0
        ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
        : 0;

      onProgress?.(Math.min(Math.round((downloadedBytes / fileSize) * 100), 100), avgSpeed);
    },
    get total() { return downloadedBytes; },
  };
}

// Stream chunks straight to a file on disk. Memory stays bounded to the
// prefetch window (PARALLEL_DOWNLOADS chunks) regardless of file size, so this
// handles 20GB+. Chrome/Edge desktop only.
async function streamChunksToDisk(manifest, onProgress, onStatusChange) {
  const { totalChunks, fileSize, fileName, chunkUrl } = manifest;

  // Must prompt for the save location before any await, or the browser
  // discards the user-gesture that authorises the picker.
  const handle = await window.showSaveFilePicker({ suggestedName: fileName });
  const writable = await handle.createWritable();

  onStatusChange?.('downloading', 'Downloading...');
  const progress = createProgressReporter(fileSize, onProgress);

  // Fetch ahead of the write cursor, but write strictly in order.
  const inFlight = new Map();
  const prefetch = (index) => {
    if (index < totalChunks && !inFlight.has(index)) {
      const pending = fetchChunk(chunkUrl(index), index);
      // An earlier chunk may fail and abort the download before this one is
      // awaited; swallow the stray rejection without hiding it from the await.
      pending.catch(() => {});
      inFlight.set(index, pending);
    }
  };

  try {
    for (let i = 0; i < Math.min(PARALLEL_DOWNLOADS, totalChunks); i++) prefetch(i);

    for (let index = 0; index < totalChunks; index++) {
      const blob = await inFlight.get(index);
      inFlight.delete(index);
      prefetch(index + PARALLEL_DOWNLOADS);

      await writable.write(blob);
      progress.add(blob.size);
    }

    if (progress.total !== fileSize) {
      throw new Error(`Size mismatch: got ${progress.total} bytes, expected ${fileSize}`);
    }

    await writable.close();
  } catch (error) {
    // Discard the partial file rather than leaving a truncated one on disk.
    await writable.abort().catch(() => {});
    throw error;
  }

  return { success: true, fileName, streamed: true };
}

// Combine chunks in memory, then hand the Blob to the browser. Works on
// Safari/iOS but is bounded by available memory.
async function combineChunksInMemory(manifest, onProgress, onStatusChange) {
  const { totalChunks, fileSize, fileName, chunkUrl } = manifest;

  if (fileSize > MAX_IN_MEMORY_COMBINE) {
    throw new Error(
      `This file is ${(fileSize / 1024 / 1024 / 1024).toFixed(1)}GB. ` +
      'Files over 2GB can only be downloaded in Chrome or Edge on a desktop computer.'
    );
  }

  onStatusChange?.('downloading', 'Downloading...');
  const progress = createProgressReporter(fileSize, onProgress);

  const chunks = new Array(totalChunks);
  const queue = Array.from({ length: totalChunks }, (_, i) => i);

  const worker = async () => {
    while (queue.length > 0) {
      const index = queue.shift();
      const blob = await fetchChunk(chunkUrl(index), index);
      chunks[index] = blob;
      progress.add(blob.size);
    }
  };

  // Any worker rejecting fails the whole download, rather than silently
  // leaving a hole in the combined file.
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL_DOWNLOADS, totalChunks) }, worker)
  );

  if (progress.total !== fileSize) {
    throw new Error(`Size mismatch: got ${progress.total} bytes, expected ${fileSize}`);
  }

  const combinedBlob = new Blob(chunks, { type: 'application/octet-stream' });
  triggerBlobDownload(combinedBlob, fileName);

  return { success: true, fileName, streamed: false };
}

export function triggerBlobDownload(blob, fileName) {
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
}

// Download a chunked file and reassemble it client-side. Streams to disk when
// the browser supports it, otherwise combines in memory (2GB ceiling).
export async function downloadChunkedFile(fileUrl, onProgress, onStatusChange) {
  const manifest = parseChunkedUrl(fileUrl);

  if (!manifest) {
    // Not a chunked file - download it directly.
    window.location.href = fileUrl.split('#')[0];
    return { success: true, streamed: false };
  }

  if (canStreamToDisk()) {
    try {
      return await streamChunksToDisk(manifest, onProgress, onStatusChange);
    } catch (error) {
      // The user dismissing the save dialog is a cancel, not a failure.
      if (error?.name === 'AbortError') return { success: false, cancelled: true };
      throw error;
    }
  }

  return combineChunksInMemory(manifest, onProgress, onStatusChange);
}

// Fetch a file as a Blob whether or not it is chunked. Used by "Download All",
// which needs the bytes in hand to build a ZIP.
export async function fetchFileAsBlob(fileUrl, onProgress) {
  const manifest = parseChunkedUrl(fileUrl);

  if (!manifest) {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.blob();
  }

  if (manifest.fileSize > MAX_IN_MEMORY_COMBINE) {
    throw new Error(`${manifest.fileName} is too large to include in a ZIP`);
  }

  const progress = createProgressReporter(manifest.fileSize, onProgress);
  const chunks = new Array(manifest.totalChunks);
  const queue = Array.from({ length: manifest.totalChunks }, (_, i) => i);

  const worker = async () => {
    while (queue.length > 0) {
      const index = queue.shift();
      const blob = await fetchChunk(manifest.chunkUrl(index), index);
      chunks[index] = blob;
      progress.add(blob.size);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(PARALLEL_DOWNLOADS, manifest.totalChunks) }, worker)
  );

  if (progress.total !== manifest.fileSize) {
    throw new Error(`${manifest.fileName}: size mismatch, file may be incomplete`);
  }

  return new Blob(chunks, { type: 'application/octet-stream' });
}

const deleteOne = (filePath) =>
  fetch(`${UPLOAD_SERVER_URL}/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  });

export const deleteFile = async (fileUrl) => {
  if (!UPLOAD_SERVER_URL) return;

  try {
    const manifest = parseChunkedUrl(fileUrl);

    if (!manifest) {
      await deleteOne(fileUrl);
      return;
    }

    // Chunked file - delete every chunk. Paths are full CDN URLs, matching the
    // format the single-file delete above has always sent.
    const queue = Array.from({ length: manifest.totalChunks }, (_, i) => i);
    const worker = async () => {
      while (queue.length > 0) {
        await deleteOne(manifest.chunkUrl(queue.shift()));
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  } catch (error) {
    console.error('Delete error:', error);
  }
};

// Legacy exports
export function getPendingUploads() { return []; }
export function clearPendingUpload() {}
