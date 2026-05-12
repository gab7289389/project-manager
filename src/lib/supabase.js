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
// FILE STORAGE - Uses Bunny CDN with progress
// =============================================

export const uploadFile = async (projectId, file, onProgress) => {
  // Sanitize filename
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = `${projectId}/${Date.now()}-${safeFileName}`;
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();
    let lastLoaded = 0;
    let lastTime = startTime;
    let currentSpeed = 0;
    
    // Progress tracking
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
        
        if (timeDiff >= 0.2) {
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
        // Construct the public URL
        const publicUrl = `https://dxtr-staging.b-cdn.net/uploads/${fileName}`;
        resolve({
          fileName: file.name,
          fileUrl: publicUrl
        });
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });
    
    xhr.addEventListener('error', () => reject(new Error('Upload failed - network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
    
    // Upload directly to Bunny CDN via the API route (which will proxy to Bunny)
    xhr.open('POST', '/api/bunny-upload-stream');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
    xhr.send(file);
  });
};

export const deleteFile = async (fileUrl) => {
  try {
    const response = await fetch('/api/bunny-delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: fileUrl })
    });
    
    if (!response.ok) {
      console.error('Failed to delete file:', fileUrl);
    }
  } catch (error) {
    console.error('Delete file error:', error);
  }
};
