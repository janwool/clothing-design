CREATE TABLE IF NOT EXISTS on_model_mockup_svg_masks (
  asset_name TEXT PRIMARY KEY,
  svg_data TEXT NOT NULL,
  canvas_width INTEGER NOT NULL,
  canvas_height INTEGER NOT NULL,
  region_count INTEGER NOT NULL DEFAULT 1,
  node_count INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_name) REFERENCES on_model_mockup_assets(asset_name)
);

CREATE INDEX IF NOT EXISTS idx_on_model_mockup_svg_masks_updated
  ON on_model_mockup_svg_masks(updated_at);
