const db = require('./db');

let tableReady;

const DEFAULT_ASSET_PUBLIC_URL = 'https://cdn.cloz-design.com';
const LOCAL_ASSET_PREFIX = '/images/mockups/on-model/generated/';
const R2_ASSET_PREFIX = '/image/mockups/on-model/generated/';

function getAssetPublicUrl() {
  return String(
    process.env.R2_PUBLIC_URL
    || globalThis.__WORKER_ENV__?.R2_PUBLIC_URL
    || DEFAULT_ASSET_PUBLIC_URL
  ).replace(/\/+$/, '');
}

function publicAssetUrl(value) {
  const url = String(value || '');
  if (!url.startsWith(LOCAL_ASSET_PREFIX)) return url;
  return `${getAssetPublicUrl()}${R2_ASSET_PREFIX}${url.slice(LOCAL_ASSET_PREFIX.length)}`;
}

function withPublicAssetUrls(record) {
  if (!record) return record;
  const result = {
    ...record,
    base_image_url: publicAssetUrl(record.base_image_url),
    mask_image_url: publicAssetUrl(record.mask_image_url),
    depth_image_url: publicAssetUrl(record.depth_image_url)
  };
  if (record.svg_mask_asset_name) {
    const version = String(record.svg_mask_updated_at || '').replace(/\D/g, '') || '1';
    result.svg_mask_url = `/api/on-model-svg-masks/${encodeURIComponent(record.svg_mask_asset_name)}.svg?v=${version}`;
  }
  // The editable SVG is also the production rendering source. Keep the raster
  // URL separately so older records and transient SVG failures can fall back.
  result.live_mask_url = result.svg_mask_url || result.mask_image_url;
  delete result.svg_mask_asset_name;
  delete result.svg_mask_updated_at;
  return result;
}

function ensureOnModelMockupTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await db.run(`CREATE TABLE IF NOT EXISTS on_model_mockup_profiles (
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
      )`);
      await db.run(`CREATE INDEX IF NOT EXISTS idx_on_model_mockup_profiles_status
        ON on_model_mockup_profiles(status)`);
      await db.run(`CREATE TABLE IF NOT EXISTS on_model_mockup_assets (
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
      )`);
      await db.run(`CREATE INDEX IF NOT EXISTS idx_on_model_mockup_assets_model
        ON on_model_mockup_assets(model_id, preferred_for_model, status)`);
      await db.run(`CREATE TABLE IF NOT EXISTS on_model_mockup_svg_masks (
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
      )`);
      await db.run(`CREATE INDEX IF NOT EXISTS idx_on_model_mockup_svg_masks_updated
        ON on_model_mockup_svg_masks(updated_at)`);
    })().catch(error => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

async function findOnModelMockupProfile(modelId) {
  await ensureOnModelMockupTable();
  const profile = await db.get(`
    SELECT
      profile.id,
      profile.model_id,
      profile.template_slug,
      profile.garment_type,
      profile.title,
      profile.base_image_url,
      profile.mask_image_url,
      profile.depth_image_url,
      profile.canvas_width,
      profile.canvas_height,
      profile.artwork_center_x,
      profile.artwork_center_y,
      profile.artwork_base_width,
      profile.artwork_max_height,
      profile.render_left,
      profile.render_top,
      profile.render_right,
      profile.render_bottom,
      profile.default_scale,
      profile.default_warp,
      profile.export_slug,
      svg_mask.asset_name AS svg_mask_asset_name,
      svg_mask.updated_at AS svg_mask_updated_at
    FROM on_model_mockup_profiles profile
    LEFT JOIN on_model_mockup_assets preferred_asset
      ON preferred_asset.id = (
        SELECT candidate.id
        FROM on_model_mockup_assets candidate
        WHERE candidate.model_id = profile.model_id
          AND candidate.status = 'active'
        ORDER BY candidate.preferred_for_model DESC, candidate.id ASC
        LIMIT 1
      )
    LEFT JOIN on_model_mockup_svg_masks svg_mask
      ON svg_mask.asset_name = preferred_asset.asset_name
    WHERE profile.model_id = ? AND profile.status = 'active'
    LIMIT 1
  `, [modelId]);
  return withPublicAssetUrls(profile);
}

async function listOnModelMockupAssets({ garmentType = '', page = 1, pageSize = 30 } = {}) {
  await ensureOnModelMockupTable();
  const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const normalizedPageSize = Math.min(60, Math.max(1, Number.parseInt(pageSize, 10) || 30));
  const filters = ["a.status = 'active'"];
  const params = [];
  if (garmentType) {
    filters.push('a.garment_type = ?');
    params.push(garmentType);
  }

  const countRow = await db.get(`
    SELECT COUNT(*) AS count
    FROM on_model_mockup_assets a
    WHERE ${filters.join(' AND ')}
  `, params);
  const total = Number(countRow?.count || 0);
  const pageCount = Math.max(1, Math.ceil(total / normalizedPageSize));
  const currentPage = Math.min(normalizedPage, pageCount);
  const offset = (currentPage - 1) * normalizedPageSize;

  const assets = await db.all(`
    SELECT
      a.*,
      m.name AS model_name,
      m.slug AS model_slug,
      COALESCE(primary_category.slug, legacy_category.slug) AS model_category_slug
    FROM on_model_mockup_assets a
    LEFT JOIN models_3d m ON m.id = a.model_id
    LEFT JOIN categories legacy_category
      ON m.category = legacy_category.name AND legacy_category.resource_type = '3d-models'
    LEFT JOIN categories primary_category
      ON primary_category.id = (
        SELECT mc.category_id
        FROM model_3d_categories mc
        WHERE mc.model_id = m.id
        ORDER BY mc.is_primary DESC, mc.category_id ASC
        LIMIT 1
      )
    WHERE ${filters.join(' AND ')}
    ORDER BY
      a.preferred_for_model DESC,
      CASE a.garment_type
        WHEN 'upper' THEN 1
        WHEN 'lower' THEN 2
        WHEN 'full' THEN 3
        WHEN 'head' THEN 4
        WHEN 'accessory' THEN 5
        ELSE 6
      END,
      COALESCE(a.model_id, 2147483647),
      a.asset_name ASC
    LIMIT ? OFFSET ?
  `, [...params, normalizedPageSize, offset]);

  return {
    assets: assets.map(withPublicAssetUrls),
    page: currentPage,
    pageCount,
    pageSize: normalizedPageSize,
    total,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + assets.length, total)
  };
}

async function getOnModelMockupAssetSummary() {
  await ensureOnModelMockupTable();
  const [categoryRows, totals] = await Promise.all([
    db.all(`
      SELECT garment_type, COUNT(*) AS count
      FROM on_model_mockup_assets
      WHERE status = 'active'
      GROUP BY garment_type
    `),
    db.get(`
      SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT CASE WHEN model_id IS NOT NULL THEN model_id END) AS mapped_models
      FROM on_model_mockup_assets
      WHERE status = 'active'
    `)
  ]);
  return {
    total: Number(totals?.total || 0),
    mappedModels: Number(totals?.mapped_models || 0),
    counts: Object.fromEntries(categoryRows.map(row => [row.garment_type, Number(row.count || 0)]))
  };
}

async function findOnModelMockupAsset(assetName) {
  await ensureOnModelMockupTable();
  const asset = await db.get(`
    SELECT
      a.*,
      svg_mask.asset_name AS svg_mask_asset_name,
      svg_mask.updated_at AS svg_mask_updated_at,
      m.name AS model_name,
      m.slug AS model_slug
    FROM on_model_mockup_assets a
    LEFT JOIN on_model_mockup_svg_masks svg_mask ON svg_mask.asset_name = a.asset_name
    LEFT JOIN models_3d m ON m.id = a.model_id
    WHERE a.asset_name = ? AND a.status = 'active'
    LIMIT 1
  `, [assetName]);
  return withPublicAssetUrls(asset);
}

async function getOnModelMockupSvgMask(assetName) {
  await ensureOnModelMockupTable();
  return db.get(`
    SELECT asset_name, svg_data, canvas_width, canvas_height, region_count, node_count, updated_at
    FROM on_model_mockup_svg_masks
    WHERE asset_name = ?
    LIMIT 1
  `, [assetName]);
}

async function saveOnModelMockupSvgMask({ assetName, svgData, width, height, regionCount, nodeCount, updatedBy = null }) {
  await ensureOnModelMockupTable();
  const asset = await db.get(`
    SELECT asset_name, canvas_width, canvas_height
    FROM on_model_mockup_assets
    WHERE asset_name = ? AND status = 'active'
    LIMIT 1
  `, [assetName]);
  if (!asset) return null;
  if (Number(asset.canvas_width) !== Number(width) || Number(asset.canvas_height) !== Number(height)) {
    const error = new Error(`SVG dimensions must match ${asset.canvas_width} × ${asset.canvas_height}.`);
    error.status = 400;
    throw error;
  }
  await db.run(`
    INSERT INTO on_model_mockup_svg_masks (
      asset_name, svg_data, canvas_width, canvas_height, region_count, node_count, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_name) DO UPDATE SET
      svg_data = excluded.svg_data,
      canvas_width = excluded.canvas_width,
      canvas_height = excluded.canvas_height,
      region_count = excluded.region_count,
      node_count = excluded.node_count,
      updated_by = excluded.updated_by,
      updated_at = CURRENT_TIMESTAMP
  `, [assetName, svgData, width, height, regionCount, nodeCount, updatedBy]);
  return getOnModelMockupSvgMask(assetName);
}

async function findRelatedOnModelMockupAssets(asset) {
  if (!asset) return [];
  await ensureOnModelMockupTable();
  const assets = await db.all(`
    SELECT
      asset_name,
      garment_type,
      title,
      base_image_url,
      canvas_width,
      canvas_height,
      preferred_for_model
    FROM on_model_mockup_assets
    WHERE status = 'active'
      AND garment_type = ?
      AND asset_name <> ?
    ORDER BY preferred_for_model DESC, COALESCE(model_id, 2147483647), asset_name ASC
    LIMIT 4
  `, [asset.garment_type, asset.asset_name]);
  return assets.map(withPublicAssetUrls);
}

module.exports = {
  ensureOnModelMockupTable,
  findOnModelMockupAsset,
  findOnModelMockupProfile,
  findRelatedOnModelMockupAssets,
  getOnModelMockupAssetSummary,
  getOnModelMockupSvgMask,
  listOnModelMockupAssets,
  saveOnModelMockupSvgMask
};
