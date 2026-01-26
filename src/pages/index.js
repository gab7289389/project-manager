import React, { useState, useEffect } from 'react';
import * as db from '../lib/supabase';

// =============================================
// HELPERS
// =============================================

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

// =============================================
// MAIN APP
// =============================================

export default function App() {
  const [portal, setPortal] = useState('admin');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Data state
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [editors, setEditors] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load data on mount
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [clientsData, servicesData, editorsData, projectsData] = await Promise.all([
        db.getClients(),
        db.getServices(),
        db.getEditors(),
        db.getProjects()
      ]);
      setClients(clientsData || []);
      setServices(servicesData || []);
      setEditors(editorsData || []);
      setProjects(projectsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Error loading data. Check console.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

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
          />
        ) : (
          <Placeholder type={portal} />
        )}
      </div>
    </div>
  );
}

function Placeholder({ type }) {
  const cfg = { editor: { icon: '🎬' }, client: { icon: '🏠' } }[type];
  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center text-gray-400">
        <p className="text-6xl mb-4">{cfg.icon}</p>
        <p className="text-xl font-medium capitalize">{type} Portal</p>
        <p className="text-sm mt-2">Coming soon</p>
      </div>
    </div>
  );
}

// =============================================
// ADMIN PORTAL
// =============================================

function AdminPortal({ clients, setClients, services, setServices, editors, setEditors, projects, setProjects, sidebarOpen, setSidebarOpen, refreshData }) {
  const [tab, setTab] = useState('projects');
  const [clientFilter, setClientFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const getClient = id => clients.find(c => c.id === id);
  
  const filtered = projects
    .filter(p => clientFilter === 'all' || p.client_id === clientFilter)
    .sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (b.status === 'completed' && a.status !== 'completed') return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });

  // Task toggle
  const toggleTask = async (projectId, taskId, currentValue) => {
    try {
      await db.updateTask(taskId, { completed: !currentValue });
      await refreshData();
    } catch (error) {
      console.error('Error toggling task:', error);
      alert('Error updating task');
    }
  };

  // File upload
  const handleFileUpload = async (projectId, taskId, file) => {
    try {
      setSaving(true);
      const { fileName, fileUrl } = await db.uploadFile(projectId, file);
      await db.updateTask(taskId, { file_name: fileName, file_url: fileUrl });
      await refreshData();
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file');
    } finally {
      setSaving(false);
    }
  };

  // Remove file
  const removeFile = async (taskId, fileUrl) => {
    try {
      await db.deleteFile(fileUrl);
      await db.updateTask(taskId, { file_name: null, file_url: null });
      await refreshData();
    } catch (error) {
      console.error('Error removing file:', error);
      alert('Error removing file');
    }
  };

  // Send to client
  const sendToClient = async (project, taskIds, client) => {
    try {
      setSaving(true);
      
      // Create magic link
      const magicLink = await db.createMagicLink(project.id, client.id, taskIds);
      
      // Get file info
      const files = project.tasks
        .filter(t => taskIds.includes(t.id))
        .map(t => ({
          type: t.text.replace('Submit ', '').replace(' to client', ''),
          name: t.file_name
        }));
      
      // Send email
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: client.email,
          projectName: project.name,
          clientName: client.name,
          magicLinkToken: magicLink.token,
          files
        })
      });
      
      if (!response.ok) throw new Error('Email failed');
      
      // Mark tasks as sent
      await Promise.all(taskIds.map(id => 
        db.updateTask(id, { sent: true, completed: true, sent_at: new Date().toISOString() })
      ));
      
      await refreshData();
      return true;
    } catch (error) {
      console.error('Error sending to client:', error);
      alert('Error sending email: ' + error.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Add revision
  const addRevision = async (projectId, revisionData) => {
    try {
      const revision = {
        project_id: projectId,
        type: revisionData.type,
        note: revisionData.note || 'Revision requested'
      };
      
      const tasks = [
        { project_id: projectId, text: `Submit ${revisionData.type} Revision to editor`, is_editor_task: true },
        { project_id: projectId, text: `Submit ${revisionData.type} Revision to client`, is_client_task: true }
      ];
      
      await db.createRevision(revision, tasks);
      await refreshData();
    } catch (error) {
      console.error('Error adding revision:', error);
      alert('Error adding revision');
    }
  };

  // Delete revision
  const deleteRevision = async (revisionId) => {
    try {
      await db.deleteRevision(revisionId);
      await refreshData();
    } catch (error) {
      console.error('Error deleting revision:', error);
      alert('Error deleting revision');
    }
  };

  // Update revision
  const updateRevision = async (revisionId, data) => {
    try {
      await db.updateRevision(revisionId, data);
      await refreshData();
    } catch (error) {
      console.error('Error updating revision:', error);
      alert('Error updating revision');
    }
  };

  return (
    <div className="h-full flex relative">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-56 bg-gradient-to-b from-purple-700 to-purple-900 text-white flex flex-col transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-4 border-b border-purple-600 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-purple-700 font-bold">PM</div>
            <span className="font-semibold">Admin</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-2xl">&times;</button>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {[{ id: 'projects', icon: '📁' }, { id: 'chat', icon: '💬' }, { id: 'database', icon: '🗄️' }].map(i => (
            <button key={i.id} onClick={() => { setTab(i.id); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg capitalize ${tab === i.id ? 'bg-white text-purple-700' : 'text-purple-200 hover:bg-purple-600'}`}>{i.icon} {i.id}</button>
          ))}
        </nav>
        <div className="p-2 border-t border-purple-600">
          <button onClick={refreshData} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-purple-200 hover:bg-purple-600 text-sm">
            🔄 Refresh Data
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Projects Tab */}
        {tab === 'projects' && (
          <>
            <header className="bg-white border-b px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-4 flex-1">
                <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-xl">☰</button>
                <h1 className="text-lg font-bold hidden sm:block">Projects</h1>
                <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
                  <option value="all">All Clients</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button onClick={() => setModal({ type: 'addProject' })} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-xs sm:text-sm font-medium">+ New</button>
            </header>

            <div className="flex-1 overflow-auto p-2 sm:p-4 space-y-3">
              {filtered.map(project => {
                const client = project.client || getClient(project.client_id);
                const isExp = expanded === project.id;
                const editorTasks = project.tasks?.filter(t => t.is_editor_task) || [];
                const clientTasks = project.tasks?.filter(t => t.is_client_task) || [];
                const readyToSend = clientTasks.filter(t => t.file_url && !t.sent);
                const completedCount = project.tasks?.filter(t => t.completed).length || 0;
                const totalCount = project.tasks?.length || 0;
                const serviceTypes = project.service_types?.length ? project.service_types : getServiceTypesFromTasks(project.tasks);

                return (
                  <div key={project.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-4 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(isExp ? null : project.id)}>
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${project.status === 'completed' ? 'bg-green-500' : project.status === 'revision' ? 'bg-red-500' : 'bg-yellow-400'}`} />
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-sm sm:text-base">{project.name}</span>
                        <span className="text-gray-500 text-xs ml-2 hidden sm:inline">• {client?.name}</span>
                        <p className="text-xs text-gray-400 truncate">{project.services?.join(', ')}</p>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-500">{completedCount}/{totalCount}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${project.status === 'completed' ? 'bg-green-100 text-green-700' : project.status === 'revision' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {project.status === 'completed' ? 'Completed' : project.status === 'revision' ? 'Revision' : 'Active'}
                        </span>
                        {project.status !== 'completed' && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${isOverdue(project.due_date, project.status) ? 'bg-red-500 text-white' : 'bg-gray-100'}`}>{formatDueDate(project.due_date)}</span>
                        )}
                        <span className={`${isExp ? 'rotate-180' : ''} transition-transform`}>▼</span>
                      </div>
                    </div>

                    {isExp && (
                      <div className="border-t">
                        {/* Info section */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 sm:p-4 bg-gray-50 text-sm">
                          <div>
                            <div className="flex justify-between mb-2"><span className="font-medium text-gray-600">Details</span><button onClick={() => setModal({ type: 'editProject', project })} className="text-purple-600 text-xs">Edit</button></div>
                            <p className="text-gray-500">Client: {client?.name}</p>
                            <p className="text-gray-500">Due: {new Date(project.due_date).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <div className="flex justify-between mb-2"><span className="font-medium text-gray-600">Revisions</span><button onClick={() => setModal({ type: 'addRevision', project, serviceTypes })} className="text-purple-600 text-xs">+ Add</button></div>
                            {project.revisions?.map(r => (
                              <div key={r.id} className="flex items-center gap-1 mb-1">
                                <p className="text-xs flex-1"><span className="text-purple-600">{r.type}:</span> {r.note}</p>
                                <button onClick={() => setModal({ type: 'editRevision', project, revision: r, serviceTypes })} className="text-xs hover:bg-gray-200 p-1 rounded">✏️</button>
                              </div>
                            ))}
                            {!project.revisions?.length && <p className="text-gray-400 text-xs italic">None</p>}
                          </div>
                          <div>
                            <div className="flex justify-between mb-2"><span className="font-medium text-gray-600">Client Notes</span><button onClick={() => setModal({ type: 'editNotes', client })} className="text-purple-600 text-xs">Edit</button></div>
                            <p className="text-xs text-gray-500">{client?.notes || 'No notes'}</p>
                          </div>
                        </div>

                        {/* Editor tasks */}
                        <div className="p-3 sm:p-4 border-t bg-blue-50">
                          <h4 className="font-medium text-sm mb-3">🎬 Editor Tasks</h4>
                          <div className="space-y-2">
                            {editorTasks.map(t => (
                              <label key={t.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border cursor-pointer">
                                <input type="checkbox" checked={t.completed} onChange={() => toggleTask(project.id, t.id, t.completed)} className="w-4 h-4" />
                                <span className={t.completed ? 'line-through text-gray-400' : ''}>{t.text}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Client tasks */}
                        <div className="p-3 sm:p-4 border-t bg-purple-50">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                            <h4 className="font-medium text-sm">📧 Submit to Client</h4>
                            {readyToSend.length > 0 && (
                              <button 
                                onClick={() => setModal({ type: 'sendToClient', project, tasks: readyToSend, client })} 
                                className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs"
                              >
                                📤 Send {readyToSend.length} File{readyToSend.length > 1 ? 's' : ''}
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {clientTasks.map(t => {
                              const label = t.text.replace('Submit ', '').replace(' to client', '');
                              return (
                                <div key={t.id} className={`p-3 rounded-lg border-2 ${t.sent ? 'bg-green-50 border-green-300' : t.file_url ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200'}`}>
                                  <div className="flex justify-between mb-2">
                                    <span className="font-medium text-sm">{label}</span>
                                    {t.sent && <span className="text-green-600 text-xs">✓ Sent</span>}
                                    {t.file_url && !t.sent && <span className="text-yellow-600 text-xs">Ready</span>}
                                  </div>
                                  {t.sent ? (
                                    <p className="text-sm text-green-600">📎 {t.file_name}</p>
                                  ) : t.file_url ? (
                                    <div>
                                      <p className="text-sm text-yellow-700 mb-1">📎 {t.file_name}</p>
                                      <button onClick={() => removeFile(t.id, t.file_url)} className="text-xs text-red-500">Remove</button>
                                    </div>
                                  ) : (
                                    <label className="block border-2 border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:bg-gray-50">
                                      <p className="text-gray-400 text-sm">{saving ? 'Uploading...' : 'Click to upload'}</p>
                                      <input 
                                        type="file" 
                                        className="hidden" 
                                        disabled={saving}
                                        onChange={e => e.target.files?.[0] && handleFileUpload(project.id, t.id, e.target.files[0])} 
                                      />
                                    </label>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Delete */}
                        <div className="p-3 border-t bg-gray-50 flex justify-end">
                          <button onClick={() => setModal({ type: 'deleteProject', project })} className="text-xs text-red-500">🗑️ Delete Project</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-4xl mb-2">📁</p>
                  <p>No projects yet</p>
                  <button onClick={() => setModal({ type: 'addProject' })} className="text-purple-600 mt-2">Create your first project</button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Chat Tab */}
        {tab === 'chat' && (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-4xl mb-2">💬</p>
              <p>Chat coming soon</p>
            </div>
          </div>
        )}

        {/* Database Tab */}
        {tab === 'database' && (
          <Database 
            clients={clients} setClients={setClients}
            services={services} setServices={setServices}
            editors={editors} setEditors={setEditors}
            setSidebarOpen={setSidebarOpen}
            refreshData={refreshData}
          />
        )}
      </main>

      {/* Modals */}
      {modal?.type === 'addProject' && (
        <AddProjectModal 
          clients={clients} 
          services={services} 
          onClose={() => setModal(null)} 
          onCreate={async (projectData, tasks) => {
            try {
              await db.createProject(projectData, tasks);
              await refreshData();
              setModal(null);
            } catch (error) {
              console.error(error);
              alert('Error creating project');
            }
          }} 
        />
      )}

      {modal?.type === 'editProject' && (
        <EditProjectModal 
          project={modal.project} 
          clients={clients} 
          onClose={() => setModal(null)} 
          onSave={async (updates) => {
            try {
              await db.updateProject(modal.project.id, updates);
              await refreshData();
              setModal(null);
            } catch (error) {
              console.error(error);
              alert('Error updating project');
            }
          }} 
        />
      )}

      {modal?.type === 'addRevision' && (
        <AddRevisionModal 
          project={modal.project} 
          serviceTypes={modal.serviceTypes} 
          onClose={() => setModal(null)} 
          onSave={async (revisionData) => {
            await addRevision(modal.project.id, revisionData);
            setModal(null);
          }} 
        />
      )}

      {modal?.type === 'editRevision' && (
        <EditRevisionModal 
          project={modal.project} 
          revision={modal.revision} 
          serviceTypes={modal.serviceTypes} 
          onClose={() => setModal(null)} 
          onSave={async (data) => {
            await updateRevision(modal.revision.id, data);
            setModal(null);
          }}
          onDelete={async () => {
            await deleteRevision(modal.revision.id);
            setModal(null);
          }}
        />
      )}

      {modal?.type === 'editNotes' && (
        <EditNotesModal 
          client={modal.client} 
          onClose={() => setModal(null)} 
          onSave={async (notes) => {
            try {
              await db.updateClient(modal.client.id, { notes });
              await refreshData();
              setModal(null);
            } catch (error) {
              console.error(error);
              alert('Error updating notes');
            }
          }} 
        />
      )}

      {modal?.type === 'deleteProject' && (
        <DeleteProjectModal 
          project={modal.project} 
          onClose={() => setModal(null)} 
          onDelete={async () => {
            try {
              await db.deleteProject(modal.project.id);
              await refreshData();
              setExpanded(null);
              setModal(null);
            } catch (error) {
              console.error(error);
              alert('Error deleting project');
            }
          }} 
        />
      )}

      {modal?.type === 'sendToClient' && (
        <SendToClientModal 
          project={modal.project} 
          tasks={modal.tasks} 
          client={modal.client} 
          onClose={() => setModal(null)} 
          onSend={async (taskIds) => {
            const success = await sendToClient(modal.project, taskIds, modal.client);
            if (success) setModal(null);
          }} 
        />
      )}
    </div>
  );
}

// =============================================
// DATABASE COMPONENT
// =============================================

function Database({ clients, services, editors, setSidebarOpen, refreshData }) {
  const [tab, setTab] = useState('clients');
  const [modal, setModal] = useState(null);

  const handleSave = async (type, item, isEdit) => {
    try {
      if (type === 'clients') {
        if (isEdit) await db.updateClient(item.id, item);
        else await db.createNewClient(item);
      } else if (type === 'services') {
        if (isEdit) await db.updateService(item.id, item);
        else await db.createService(item);
      } else if (type === 'editors') {
        if (isEdit) await db.updateEditor(item.id, item);
        else await db.createEditor(item);
      }
      await refreshData();
      setModal(null);
    } catch (error) {
      console.error(error);
      alert('Error saving: ' + error.message);
    }
  };

  const handleDelete = async (type, id) => {
    if (!confirm('Delete this item?')) return;
    try {
      if (type === 'clients') await db.deleteClient(id);
      else if (type === 'services') await db.deleteService(id);
      else if (type === 'editors') await db.deleteEditor(id);
      await refreshData();
    } catch (error) {
      console.error(error);
      alert('Error deleting');
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
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-lg text-sm capitalize ${tab === t ? 'bg-purple-600 text-white' : 'bg-gray-100'}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="p-3 sm:p-4">
        <div className="flex justify-end mb-4">
          <button onClick={() => setModal({ item: null })} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm">+ Add</button>
        </div>
        <div className="space-y-2">
          {data.map(item => (
            <div key={item.id} className="bg-white rounded-lg border p-3 flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{item.avatar || ''} {item.name}</p>
                <p className="text-xs text-gray-500 truncate">{item.email || item.tasks?.join(', ')}</p>
                {item.notes && <p className="text-xs text-gray-400 mt-1">{item.notes}</p>}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setModal({ item })} className="text-purple-600 text-sm">Edit</button>
                <button onClick={() => handleDelete(tab, item.id)} className="text-red-600 text-sm">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {modal && (
        <DatabaseModal 
          tab={tab} 
          item={modal.item} 
          onClose={() => setModal(null)} 
          onSave={(item) => handleSave(tab, item, !!modal.item)} 
        />
      )}
    </div>
  );
}

// =============================================
// MODALS
// =============================================

function DatabaseModal({ tab, item, onClose, onSave }) {
  const [form, setForm] = useState(item || { name: '', email: '', notes: '', tasks: [] });
  const save = () => {
    if (!form.name?.trim()) { alert('Name required'); return; }
    if (tab !== 'services' && !form.email?.trim()) { alert('Email required'); return; }
    const tasks = typeof form.tasks === 'string' ? form.tasks.split(',').map(t => t.trim()).filter(Boolean) : form.tasks;
    onSave({ ...form, tasks: tab === 'services' ? tasks : undefined, avatar: tab === 'editors' ? (item?.avatar || '👤') : undefined });
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex justify-between"><h2 className="text-lg font-bold">{item ? 'Edit' : 'Add'} {tab.slice(0,-1)}</h2><button onClick={onClose} className="text-2xl text-gray-400">&times;</button></div>
        <div className="p-4 space-y-4">
          <div><label className="block text-sm font-medium mb-1">Name *</label><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
          {tab !== 'services' && <div><label className="block text-sm font-medium mb-1">Email *</label><input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>}
          {tab === 'clients' && <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} /></div>}
          {tab === 'services' && <div><label className="block text-sm font-medium mb-1">Tasks * (comma separated)</label><textarea value={Array.isArray(form.tasks) ? form.tasks.join(', ') : form.tasks || ''} onChange={e => setForm({ ...form, tasks: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={3} /></div>}
          <button onClick={save} className="w-full bg-purple-600 text-white py-2 rounded-lg font-medium">Save</button>
        </div>
      </div>
    </div>
  );
}

function AddProjectModal({ clients, services, onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', client_id: '', due_date: '', selectedServices: [] });
  
  const hasSitePlan = form.selectedServices.some(sn => {
    const srv = services.find(s => s.name === sn);
    return srv?.tasks.some(t => t.toLowerCase().includes('site plan'));
  });
  
  const previewTasks = form.selectedServices.flatMap(sn => services.find(s => s.name === sn)?.tasks || []);
  const filteredTasks = hasSitePlan ? previewTasks.filter(t => !(t.toLowerCase().includes('floor plan') && t.toLowerCase().includes('client'))) : previewTasks;
  
  const create = () => {
    if (!form.name || !form.client_id || !form.due_date || !form.selectedServices.length) { alert('Fill all fields'); return; }
    
    const serviceTypes = [...new Set(filteredTasks.map(t => {
      const match = t.match(/Submit (.+?) to (editor|client)/i);
      return match ? match[1] : null;
    }).filter(Boolean))];
    
    const tasks = filteredTasks.map(tt => ({
      text: tt,
      is_editor_task: tt.toLowerCase().includes('editor'),
      is_client_task: tt.toLowerCase().includes('client')
    }));
    
    onCreate({
      name: form.name,
      client_id: form.client_id,
      due_date: form.due_date,
      services: form.selectedServices,
      service_types: serviceTypes
    }, tasks);
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex justify-between"><h2 className="text-lg font-bold">New Project</h2><button onClick={onClose} className="text-2xl text-gray-400">&times;</button></div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Project Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
            <div><label className="block text-sm font-medium mb-1">Client</label><select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="">Select...</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Due Date</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
          <div>
            <label className="block text-sm font-medium mb-2">Services</label>
            <div className="grid grid-cols-2 gap-2">{services.map(s => (
              <label key={s.id} className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer ${form.selectedServices.includes(s.name) ? 'border-purple-400 bg-purple-50' : 'border-gray-200'}`}>
                <input type="checkbox" checked={form.selectedServices.includes(s.name)} onChange={e => setForm({ ...form, selectedServices: e.target.checked ? [...form.selectedServices, s.name] : form.selectedServices.filter(x => x !== s.name) })} className="w-4 h-4" />
                <span className="text-sm">{s.name}</span>
              </label>
            ))}</div>
          </div>
          {filteredTasks.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-medium text-blue-800 mb-2">📋 This will create:</p>
              <ul className="text-xs text-blue-700 space-y-1 max-h-40 overflow-auto">{filteredTasks.map((t, i) => <li key={i}>• {t}</li>)}</ul>
              {hasSitePlan && <p className="text-xs text-orange-600 mt-2">ℹ️ Floor Plan client upload removed (Site Plan replaces it)</p>}
            </div>
          )}
          <button onClick={create} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Create Project</button>
        </div>
      </div>
    </div>
  );
}

function EditProjectModal({ project, clients, onClose, onSave }) {
  const [form, setForm] = useState({ name: project.name, due_date: project.due_date, client_id: project.client_id });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full">
        <div className="p-4 border-b flex justify-between"><h2 className="text-lg font-bold">Edit Project</h2><button onClick={onClose} className="text-2xl text-gray-400">&times;</button></div>
        <div className="p-4 space-y-4">
          <div><label className="block text-sm font-medium mb-1">Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
          <div><label className="block text-sm font-medium mb-1">Due Date</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
          <div><label className="block text-sm font-medium mb-1">Client</label><select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className="w-full border rounded-lg px-3 py-2">{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <button onClick={() => onSave(form)} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Save</button>
        </div>
      </div>
    </div>
  );
}

function AddRevisionModal({ project, serviceTypes, onClose, onSave }) {
  const [form, setForm] = useState({ type: '', note: '' });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full">
        <div className="p-4 border-b flex justify-between"><h2 className="text-lg font-bold">Add Revision</h2><button onClick={onClose} className="text-2xl text-gray-400">&times;</button></div>
        <div className="p-4 space-y-4">
          <div><label className="block text-sm font-medium mb-1">Service Type</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full border rounded-lg px-3 py-2"><option value="">Select...</option>{serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1">Note</label><textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={3} /></div>
          {form.type && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-medium text-blue-800 mb-2">📋 This will create:</p>
              <ul className="text-xs text-blue-700"><li>• Submit {form.type} Revision to editor</li><li>• Submit {form.type} Revision to client</li></ul>
            </div>
          )}
          <button onClick={() => { if (!form.type) { alert('Select type'); return; } onSave(form); }} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Add Revision</button>
        </div>
      </div>
    </div>
  );
}

function EditRevisionModal({ revision, serviceTypes, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ type: revision.type, note: revision.note });
  const [showDelete, setShowDelete] = useState(false);
  
  if (showDelete) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-md w-full">
          <div className="p-4 border-b bg-red-50"><h2 className="text-lg font-bold text-red-700">🗑️ Delete Revision</h2></div>
          <div className="p-4 space-y-4">
            <p>Delete the <strong>{revision.type}</strong> revision?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDelete(false)} className="flex-1 border py-2 rounded-lg">Cancel</button>
              <button onClick={onDelete} className="flex-1 bg-red-600 text-white py-2 rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full">
        <div className="p-4 border-b flex justify-between"><h2 className="text-lg font-bold">Edit Revision</h2><button onClick={onClose} className="text-2xl text-gray-400">&times;</button></div>
        <div className="p-4 space-y-4">
          <div><label className="block text-sm font-medium mb-1">Service Type</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full border rounded-lg px-3 py-2">{serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1">Note</label><textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={3} /></div>
          <button onClick={() => onSave(form)} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Save</button>
          <button onClick={() => setShowDelete(true)} className="w-full border border-red-300 text-red-600 py-2 rounded-lg text-sm">🗑️ Delete Revision</button>
        </div>
      </div>
    </div>
  );
}

function EditNotesModal({ client, onClose, onSave }) {
  const [notes, setNotes] = useState(client?.notes || '');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full">
        <div className="p-4 border-b flex justify-between"><h2 className="text-lg font-bold">Edit Client Notes</h2><button onClick={onClose} className="text-2xl text-gray-400">&times;</button></div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-500">Client: {client?.name}</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border rounded-lg px-3 py-2" rows={4} />
          <button onClick={() => onSave(notes)} className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium">Save</button>
        </div>
      </div>
    </div>
  );
}

function DeleteProjectModal({ project, onClose, onDelete }) {
  const [confirm, setConfirm] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full">
        <div className="p-4 border-b bg-red-50"><h2 className="text-lg font-bold text-red-700">⚠️ Delete Project</h2></div>
        <div className="p-4 space-y-4">
          <div className="bg-red-100 border border-red-300 rounded-lg p-3 text-sm text-red-800">
            <p className="font-bold mb-2">Permanently delete:</p>
            <p>• "{project.name}"</p>
            <p>• {project.tasks?.length || 0} tasks</p>
            <p>• All uploaded files</p>
          </div>
          <div><label className="block text-sm mb-1">Type "DELETE" to confirm:</label><input value={confirm} onChange={e => setConfirm(e.target.value)} className="w-full border border-red-300 rounded-lg px-3 py-2" /></div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 border py-2 rounded-lg">Cancel</button>
            <button onClick={onDelete} disabled={confirm !== 'DELETE'} className="flex-1 bg-red-600 text-white py-2 rounded-lg disabled:opacity-50">Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SendToClientModal({ project, tasks, client, onClose, onSend }) {
  const [selected, setSelected] = useState(tasks.reduce((a, t) => ({ ...a, [t.id]: true }), {}));
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const ids = tasks.filter(t => selected[t.id]).map(t => t.id);

  const send = async () => {
    setSending(true);
    await onSend(ids);
    setSending(false);
    setSent(true);
  };

  if (sent) return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-8 text-center">
        <p className="text-6xl mb-4">✅</p>
        <p className="text-xl font-bold text-green-700">Email Sent!</p>
        <p className="text-gray-500">Magic link sent to {client?.email}</p>
        <button onClick={onClose} className="mt-4 bg-purple-600 text-white px-6 py-2 rounded-lg">Done</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full">
        <div className="p-4 border-b bg-green-50"><h2 className="text-lg font-bold text-green-700">📤 Send to Client</h2></div>
        <div className="p-4 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm"><p><strong>Project:</strong> {project.name}</p><p><strong>To:</strong> {client?.email}</p></div>
          <div className="space-y-2 max-h-48 overflow-auto">
            {tasks.map(t => (
              <label key={t.id} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer ${selected[t.id] ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
                <input type="checkbox" checked={selected[t.id]} onChange={() => setSelected({ ...selected, [t.id]: !selected[t.id] })} className="w-4 h-4" />
                <div><p className="font-medium text-sm">{t.text.replace('Submit ', '').replace(' to client', '')}</p><p className="text-xs text-gray-500">📎 {t.file_name}</p></div>
              </label>
            ))}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">📧 Real email will be sent with download link</div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 border py-2 rounded-lg">Cancel</button>
            <button onClick={send} disabled={!ids.length || sending} className="flex-1 bg-green-600 text-white py-2 rounded-lg disabled:opacity-50">{sending ? '⏳ Sending...' : `Send ${ids.length} File${ids.length > 1 ? 's' : ''}`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
