CREATE TABLE IF NOT EXISTS on_model_mockup_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_name TEXT NOT NULL UNIQUE,
  model_id INTEGER,
  garment_type TEXT NOT NULL,
  title TEXT NOT NULL,
  base_image_url TEXT NOT NULL,
  mask_image_url TEXT NOT NULL,
  depth_image_url TEXT NOT NULL,
  canvas_width INTEGER NOT NULL,
  canvas_height INTEGER NOT NULL,
  artwork_center_x INTEGER NOT NULL,
  artwork_center_y INTEGER NOT NULL,
  artwork_base_width INTEGER NOT NULL,
  artwork_max_height INTEGER NOT NULL,
  render_left INTEGER NOT NULL,
  render_top INTEGER NOT NULL,
  render_right INTEGER NOT NULL,
  render_bottom INTEGER NOT NULL,
  default_scale INTEGER NOT NULL DEFAULT 48,
  default_warp INTEGER NOT NULL DEFAULT 34,
  mask_coverage REAL NOT NULL DEFAULT 0,
  generation_method TEXT NOT NULL,
  preferred_for_model INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (model_id) REFERENCES models_3d(id)
);

CREATE INDEX IF NOT EXISTS idx_on_model_mockup_assets_model
  ON on_model_mockup_assets(model_id, preferred_for_model, status);
