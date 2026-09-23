CREATE TABLE IF NOT EXISTS project_shares (
  token TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  preview_image_url TEXT NOT NULL,
  model_url TEXT,
  model_storage_key TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES design_projects(id)
);
CREATE INDEX IF NOT EXISTS idx_project_shares_project ON project_shares(project_id, user_id, revoked_at);
