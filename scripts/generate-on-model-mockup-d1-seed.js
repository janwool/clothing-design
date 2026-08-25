#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3');

const rootDir = path.resolve(__dirname, '..');
const databasePath = path.join(rootDir, 'database.sqlite');
const manifestPath = path.join(rootDir, 'public', 'config', 'on-model-mockup-assets.json');
const defaultOutputPath = path.join(rootDir, 'artifacts', 'deployments', 'on-model-mockups-d1-seed.sql');

function outputPathFromArguments() {
  const index = process.argv.indexOf('--output');
  if (index === -1) return defaultOutputPath;
  if (!process.argv[index + 1]) throw new Error('--output requires a file path');
  return path.resolve(process.argv[index + 1]);
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Cannot serialize non-finite number: ${value}`);
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function queryModels() {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
    database.all('SELECT id, slug FROM models_3d WHERE slug IS NOT NULL AND slug <> ?', [''], (error, rows) => {
      database.close();
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function modelIdExpression(record, slugsById) {
  if (!record.modelId) return 'NULL';
  const slug = slugsById.get(Number(record.modelId));
  if (!slug) throw new Error(`No local model slug for model ${record.modelId} (${record.assetName})`);
  return `(SELECT id FROM models_3d WHERE slug=${sqlValue(slug)} AND status='active' LIMIT 1)`;
}

function assetStatement(record, slugsById) {
  const [centerX, centerY, baseWidth, maxHeight] = record.artwork;
  const [left, top, right, bottom] = record.render;
  const [defaultScale, defaultWarp] = record.defaults;
  return `INSERT INTO on_model_mockup_assets (
  asset_name,model_id,garment_type,title,base_image_url,mask_image_url,depth_image_url,
  canvas_width,canvas_height,artwork_center_x,artwork_center_y,artwork_base_width,artwork_max_height,
  render_left,render_top,render_right,render_bottom,default_scale,default_warp,mask_coverage,
  generation_method,preferred_for_model,status,updated_at
) VALUES (
  ${sqlValue(record.assetName)},${modelIdExpression(record, slugsById)},${sqlValue(record.garmentType)},${sqlValue(record.title)},
  ${sqlValue(record.baseImageUrl)},${sqlValue(record.maskImageUrl)},${sqlValue(record.depthImageUrl)},
  ${record.canvasWidth},${record.canvasHeight},${centerX},${centerY},${baseWidth},${maxHeight},
  ${left},${top},${right},${bottom},${defaultScale},${defaultWarp},${record.coverage},
  ${sqlValue(record.method)},${record.preferredForModel ? 1 : 0},'active',CURRENT_TIMESTAMP
) ON CONFLICT(asset_name) DO UPDATE SET
  model_id=excluded.model_id,garment_type=excluded.garment_type,title=excluded.title,
  base_image_url=excluded.base_image_url,mask_image_url=excluded.mask_image_url,depth_image_url=excluded.depth_image_url,
  canvas_width=excluded.canvas_width,canvas_height=excluded.canvas_height,
  artwork_center_x=excluded.artwork_center_x,artwork_center_y=excluded.artwork_center_y,
  artwork_base_width=excluded.artwork_base_width,artwork_max_height=excluded.artwork_max_height,
  render_left=excluded.render_left,render_top=excluded.render_top,render_right=excluded.render_right,render_bottom=excluded.render_bottom,
  default_scale=excluded.default_scale,default_warp=excluded.default_warp,mask_coverage=excluded.mask_coverage,
  generation_method=excluded.generation_method,preferred_for_model=excluded.preferred_for_model,
  status='active',updated_at=CURRENT_TIMESTAMP;`;
}

function profileStatement(record, slugsById) {
  const modelId = modelIdExpression(record, slugsById);
  const [centerX, centerY, baseWidth, maxHeight] = record.artwork;
  const [left, top, right, bottom] = record.render;
  const [defaultScale, defaultWarp] = record.defaults;
  return `INSERT INTO on_model_mockup_profiles (
  model_id,template_slug,garment_type,title,base_image_url,mask_image_url,depth_image_url,
  canvas_width,canvas_height,artwork_center_x,artwork_center_y,artwork_base_width,artwork_max_height,
  render_left,render_top,render_right,render_bottom,default_scale,default_warp,export_slug,status,updated_at
) SELECT
  ${modelId},${sqlValue(record.assetName)},${sqlValue(record.garmentType)},${sqlValue(record.title)},
  ${sqlValue(record.baseImageUrl)},${sqlValue(record.maskImageUrl)},${sqlValue(record.depthImageUrl)},
  ${record.canvasWidth},${record.canvasHeight},${centerX},${centerY},${baseWidth},${maxHeight},
  ${left},${top},${right},${bottom},${defaultScale},${defaultWarp},${sqlValue(record.assetName)},'active',CURRENT_TIMESTAMP
WHERE ${modelId} IS NOT NULL
ON CONFLICT(model_id) DO UPDATE SET
  template_slug=excluded.template_slug,garment_type=excluded.garment_type,title=excluded.title,
  base_image_url=excluded.base_image_url,mask_image_url=excluded.mask_image_url,depth_image_url=excluded.depth_image_url,
  canvas_width=excluded.canvas_width,canvas_height=excluded.canvas_height,
  artwork_center_x=excluded.artwork_center_x,artwork_center_y=excluded.artwork_center_y,
  artwork_base_width=excluded.artwork_base_width,artwork_max_height=excluded.artwork_max_height,
  render_left=excluded.render_left,render_top=excluded.render_top,render_right=excluded.render_right,render_bottom=excluded.render_bottom,
  default_scale=excluded.default_scale,default_warp=excluded.default_warp,export_slug=excluded.export_slug,
  status='active',updated_at=CURRENT_TIMESTAMP;`;
}

async function main() {
  const outputPath = outputPathFromArguments();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const slugsById = new Map((await queryModels()).map(model => [Number(model.id), model.slug]));
  const preferred = manifest.assets.filter(record => record.preferredForModel);
  const statements = [
    fs.readFileSync(path.join(rootDir, 'migrations', '0002_on_model_mockup_profiles.sql'), 'utf8').trim(),
    fs.readFileSync(path.join(rootDir, 'migrations', '0003_on_model_mockup_assets.sql'), 'utf8').trim(),
    ...manifest.assets.map(record => assetStatement(record, slugsById)),
    ...preferred.map(record => profileStatement(record, slugsById))
  ];

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${statements.join('\n\n')}\n`);
  console.log(JSON.stringify({
    outputPath,
    assetCount: manifest.assets.length,
    profileCount: preferred.length,
    statementCount: statements.length,
    bytes: fs.statSync(outputPath).size
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
