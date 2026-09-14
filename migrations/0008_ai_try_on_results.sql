CREATE TABLE IF NOT EXISTS ai_try_on_results (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  image_id TEXT NOT NULL UNIQUE,
  model_id TEXT,
  model_slug TEXT,
  model_name TEXT,
  source_project_id TEXT,
  person_model_id TEXT,
  person_model_name TEXT,
  ai_model TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (image_id) REFERENCES user_images(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_try_on_results_user_created
  ON ai_try_on_results(user_id, created_at DESC);
