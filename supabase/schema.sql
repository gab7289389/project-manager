-- =============================================
-- PROJECT MANAGER DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

-- Clients table
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Services table (includes packages like "Value Package 2")
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  tasks TEXT[] NOT NULL DEFAULT '{}',
  is_package BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Editors table
CREATE TABLE editors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar TEXT DEFAULT '👤',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  services TEXT[] NOT NULL DEFAULT '{}',
  service_types TEXT[] NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'progress' CHECK (status IN ('progress', 'revision', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  is_editor_task BOOLEAN DEFAULT FALSE,
  is_client_task BOOLEAN DEFAULT FALSE,
  file_name TEXT,
  file_url TEXT,
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP WITH TIME ZONE,
  revision_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Revisions table
CREATE TABLE revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  note TEXT DEFAULT 'Revision requested',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Magic links table (for client file access)
CREATE TABLE magic_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  task_ids UUID[] NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  accessed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email logs table
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  magic_link_id UUID REFERENCES magic_links(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  resend_id TEXT,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_due_date ON projects(due_date);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_revisions_project_id ON revisions(project_id);
CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_magic_links_expires ON magic_links(expires_at);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE editors ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (you can restrict later with auth)
CREATE POLICY "Allow all" ON clients FOR ALL USING (true);
CREATE POLICY "Allow all" ON services FOR ALL USING (true);
CREATE POLICY "Allow all" ON editors FOR ALL USING (true);
CREATE POLICY "Allow all" ON projects FOR ALL USING (true);
CREATE POLICY "Allow all" ON tasks FOR ALL USING (true);
CREATE POLICY "Allow all" ON revisions FOR ALL USING (true);
CREATE POLICY "Allow all" ON magic_links FOR ALL USING (true);
CREATE POLICY "Allow all" ON email_logs FOR ALL USING (true);

-- =============================================
-- STORAGE BUCKET
-- =============================================

-- Run this separately in Supabase Dashboard > Storage
-- Create a bucket called "project-files" with public access

-- =============================================
-- DEFAULT DATA
-- =============================================

-- Insert default services
INSERT INTO services (name, tasks, is_package) VALUES
  ('Social Promo', ARRAY['Submit Social Promo to editor', 'Submit Social Promo to client'], false),
  ('Listing Video', ARRAY['Submit Listing Video to editor', 'Submit Listing Video to client'], false),
  ('Photos', ARRAY['Submit Photos to editor', 'Submit Photos to client'], false),
  ('Floor Plan', ARRAY['Submit Floor Plan to editor', 'Submit Floor Plan to client'], false),
  ('Drone Markers', ARRAY['Submit Drone Markers to editor'], false),
  ('Site Plan', ARRAY['Submit Site Plan to editor', 'Submit Site Plan to client'], false),
  ('Value Package 2', ARRAY[
    'Submit Social Promo to editor', 'Submit Social Promo to client',
    'Submit Listing Video to editor', 'Submit Listing Video to client',
    'Submit Photos to editor', 'Submit Photos to client',
    'Submit Floor Plan to editor', 'Submit Floor Plan to client'
  ], true);

-- Insert sample clients
INSERT INTO clients (name, email, notes) VALUES
  ('Angela Moore', 'angela.moore@plr.net', 'always use the GoBold font, use preset drone markers'),
  ('Dannie Brogan', 'dannie.b@email.com', '');

-- Insert sample editors
INSERT INTO editors (name, email, avatar) VALUES
  ('John Smith', 'john@editor.com', '🎬'),
  ('Sarah Jones', 'sarah@editor.com', '📷');

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to update project status
CREATE OR REPLACE FUNCTION update_project_status()
RETURNS TRIGGER AS $$
DECLARE
  all_complete BOOLEAN;
  has_revisions BOOLEAN;
BEGIN
  -- Check if all tasks are complete
  SELECT COUNT(*) = 0 OR bool_and(completed) INTO all_complete
  FROM tasks WHERE project_id = COALESCE(NEW.project_id, OLD.project_id);
  
  -- Check if there are any revisions
  SELECT COUNT(*) > 0 INTO has_revisions
  FROM revisions WHERE project_id = COALESCE(NEW.project_id, OLD.project_id);
  
  -- Update project status
  UPDATE projects
  SET status = CASE
    WHEN all_complete THEN 'completed'
    WHEN has_revisions THEN 'revision'
    ELSE 'progress'
  END,
  updated_at = NOW()
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update status when tasks change
CREATE TRIGGER task_status_trigger
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION update_project_status();

-- Trigger to auto-update status when revisions change
CREATE TRIGGER revision_status_trigger
AFTER INSERT OR DELETE ON revisions
FOR EACH ROW EXECUTE FUNCTION update_project_status();

-- Function to validate magic link
CREATE OR REPLACE FUNCTION validate_magic_link(link_token TEXT)
RETURNS TABLE (
  valid BOOLEAN,
  project_name TEXT,
  client_name TEXT,
  files JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ml.expires_at > NOW() AS valid,
    p.name AS project_name,
    c.name AS client_name,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.file_name,
        'url', t.file_url,
        'type', REPLACE(REPLACE(t.text, 'Submit ', ''), ' to client', '')
      ))
      FROM tasks t
      WHERE t.id = ANY(ml.task_ids)
    ) AS files
  FROM magic_links ml
  JOIN projects p ON p.id = ml.project_id
  JOIN clients c ON c.id = ml.client_id
  WHERE ml.token = link_token;
END;
$$ LANGUAGE plpgsql;
