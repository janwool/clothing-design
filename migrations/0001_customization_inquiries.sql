CREATE TABLE IF NOT EXISTS customization_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_code TEXT UNIQUE NOT NULL,
  model_id INTEGER,
  model_slug TEXT,
  model_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  notes TEXT,
  snapshot_3d_url TEXT NOT NULL,
  snapshot_3d_key TEXT NOT NULL,
  snapshot_2d_url TEXT NOT NULL,
  snapshot_2d_key TEXT NOT NULL,
  source_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customization_inquiries_status_created
ON customization_inquiries (status, created_at);
