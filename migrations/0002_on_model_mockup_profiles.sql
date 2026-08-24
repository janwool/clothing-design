CREATE TABLE IF NOT EXISTS on_model_mockup_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL UNIQUE,
  template_slug TEXT NOT NULL UNIQUE,
  garment_type TEXT NOT NULL,
  title TEXT NOT NULL,
  base_image_url TEXT NOT NULL,
  mask_image_url TEXT NOT NULL,
  depth_image_url TEXT NOT NULL,
  canvas_width INTEGER NOT NULL DEFAULT 1024,
  canvas_height INTEGER NOT NULL DEFAULT 1536,
  artwork_center_x INTEGER NOT NULL DEFAULT 512,
  artwork_center_y INTEGER NOT NULL DEFAULT 720,
  artwork_base_width INTEGER NOT NULL DEFAULT 620,
  artwork_max_height INTEGER NOT NULL DEFAULT 650,
  render_left INTEGER NOT NULL DEFAULT 185,
  render_top INTEGER NOT NULL DEFAULT 370,
  render_right INTEGER NOT NULL DEFAULT 865,
  render_bottom INTEGER NOT NULL DEFAULT 1245,
  default_scale INTEGER NOT NULL DEFAULT 54,
  default_warp INTEGER NOT NULL DEFAULT 42,
  export_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (model_id) REFERENCES models_3d(id)
);

CREATE INDEX IF NOT EXISTS idx_on_model_mockup_profiles_status
  ON on_model_mockup_profiles(status);
