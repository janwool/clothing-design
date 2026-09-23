CREATE TABLE IF NOT EXISTS model_asset_reviews (
  model_id INTEGER PRIMARY KEY REFERENCES models_3d(id),
  review_status TEXT NOT NULL CHECK (review_status IN ('qualified', 'needs_review')),
  skip_processing INTEGER NOT NULL DEFAULT 0 CHECK (skip_processing IN (0, 1)),
  approved_file_url TEXT NOT NULL,
  approved_texture_url TEXT NOT NULL,
  glb_sha256 TEXT NOT NULL,
  svg_sha256 TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT NOT NULL,
  review_notes TEXT NOT NULL,
  verification_json TEXT NOT NULL
);

-- A future repair must explicitly clear skip_processing before replacing assets.
CREATE TRIGGER IF NOT EXISTS protect_qualified_model_asset_urls
BEFORE UPDATE OF file_url, texture_url ON models_3d
WHEN EXISTS (
  SELECT 1 FROM model_asset_reviews r
  WHERE r.model_id = OLD.id AND r.review_status = 'qualified' AND r.skip_processing = 1
) AND (NEW.file_url IS NOT OLD.file_url OR NEW.texture_url IS NOT OLD.texture_url)
BEGIN
  SELECT RAISE(ABORT, 'Model is qualified and excluded from processing; clear model_asset_reviews.skip_processing only after explicit re-review authorization');
END;
