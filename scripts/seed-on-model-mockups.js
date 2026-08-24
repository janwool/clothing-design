#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const db = require('../lib/db');
const { ensureOnModelMockupTable } = require('../lib/on-model-mockups');

const ASSET_ROOT = '/images/mockups/on-model/generated';
const GENERATED_ASSET_FILE = path.join(__dirname, '..', 'public', 'config', 'on-model-mockup-assets.json');

const profiles = [
  {
    modelSlug: 'classic-crew-neck-t-shirt-3d-model',
    templateSlug: 'crewneck-tee-male-front',
    garmentType: 'crewneck-tee',
    title: 'Crew-neck T-shirt mockup',
    assetName: 'crewneck-tee-male-front',
    artwork: [512, 735, 620, 650],
    render: [205, 405, 820, 1210],
    defaults: [54, 42],
    exportSlug: 'crewneck-tshirt'
  },
  {
    modelSlug: 'short-sleeve-polo-shirt-3d-model',
    templateSlug: 'polo-shirt-male-front',
    garmentType: 'polo-shirt',
    title: 'Polo shirt mockup',
    assetName: 'polo-shirt-male-front',
    artwork: [512, 770, 570, 610],
    render: [220, 470, 805, 1200],
    defaults: [50, 38],
    exportSlug: 'polo-shirt'
  },
  {
    modelSlug: 'long-sleeve-crewneck-shirt-3d-model',
    templateSlug: 'long-sleeve-crewneck-male-front',
    garmentType: 'long-sleeve-crewneck',
    title: 'Long-sleeve crewneck mockup',
    assetName: 'long-sleeve-crewneck-male-front',
    artwork: [512, 735, 600, 650],
    render: [210, 405, 815, 1215],
    defaults: [52, 42],
    exportSlug: 'long-sleeve-crewneck'
  },
  {
    modelSlug: 'classic-pullover-hoodie-3d-model',
    templateSlug: 'pullover-hoodie-male-front',
    garmentType: 'pullover-hoodie',
    title: 'Pullover hoodie mockup',
    assetName: 'pullover-hoodie-male-front',
    artwork: [512, 700, 560, 550],
    render: [220, 430, 805, 1115],
    defaults: [50, 34],
    exportSlug: 'pullover-hoodie'
  },
  {
    modelSlug: 'relaxed-button-shirt-3d-model',
    templateSlug: 'button-shirt-male-front',
    garmentType: 'button-shirt',
    title: 'Button shirt mockup',
    assetName: 'button-shirt-male-front',
    artwork: [512, 750, 540, 640],
    render: [225, 435, 800, 1220],
    defaults: [48, 32],
    exportSlug: 'button-shirt'
  },
  {
    modelSlug: 'classic-one-piece-dress-3d-model',
    templateSlug: 'one-piece-dress-female-front',
    garmentType: 'one-piece-dress',
    title: 'One-piece dress mockup',
    assetName: 'one-piece-dress-female-front',
    artwork: [512, 730, 520, 760],
    render: [255, 340, 770, 1250],
    defaults: [48, 36],
    exportSlug: 'one-piece-dress'
  },
  {
    modelSlug: 'tailored-sleeveless-tank-top-3d-model',
    templateSlug: 'tank-top-female-front',
    garmentType: 'tank-top',
    title: 'Sleeveless tank top mockup',
    assetName: 'tank-top-female-front',
    artwork: [512, 745, 510, 610],
    render: [285, 395, 740, 1105],
    defaults: [48, 38],
    exportSlug: 'tank-top'
  },
  {
    modelSlug: 'fitted-button-front-womens-blouse-3d-model',
    templateSlug: 'womens-blouse-front',
    garmentType: 'womens-blouse',
    title: "Women's blouse mockup",
    assetName: 'womens-blouse-front',
    artwork: [512, 730, 500, 600],
    render: [245, 420, 780, 1185],
    defaults: [46, 32],
    exportSlug: 'womens-blouse'
  },
  {
    modelSlug: 'classic-trench-coat-3d-model',
    templateSlug: 'trench-coat-female-front',
    garmentType: 'trench-coat',
    title: 'Trench coat mockup',
    assetName: 'trench-coat-female-front',
    artwork: [512, 760, 470, 720],
    render: [285, 315, 735, 1165],
    defaults: [44, 28],
    exportSlug: 'trench-coat'
  },
  {
    modelSlug: 'clean-puffer-jacket-3d-model',
    templateSlug: 'puffer-jacket-male-front',
    garmentType: 'puffer-jacket',
    title: 'Puffer jacket mockup',
    assetName: 'puffer-jacket-male-front',
    artwork: [512, 745, 520, 600],
    render: [205, 395, 820, 1225],
    defaults: [46, 24],
    exportSlug: 'puffer-jacket'
  },
  {
    modelSlug: 'tailored-pants-3d-model',
    templateSlug: 'tailored-pants-male-front',
    garmentType: 'tailored-pants',
    title: 'Tailored pants mockup',
    assetName: 'tailored-pants-male-front',
    artwork: [512, 980, 470, 820],
    render: [300, 630, 720, 1385],
    defaults: [44, 30],
    exportSlug: 'tailored-pants'
  },
  {
    modelSlug: 'classic-skirt-3d-model',
    templateSlug: 'classic-skirt-female-front',
    garmentType: 'classic-skirt',
    title: 'Classic skirt mockup',
    assetName: 'classic-skirt-female-front',
    artwork: [512, 850, 480, 720],
    render: [275, 520, 750, 1185],
    defaults: [46, 34],
    exportSlug: 'classic-skirt'
  },
  {
    modelSlug: 'tailored-open-front-blazer-3d-model',
    templateSlug: 'open-front-blazer-female-front',
    garmentType: 'open-front-blazer',
    title: 'Open-front blazer mockup',
    assetName: 'open-front-blazer-female-front',
    artwork: [512, 565, 430, 470],
    render: [285, 300, 735, 790],
    defaults: [42, 24],
    exportSlug: 'open-front-blazer'
  },
  {
    modelSlug: 'classic-leather-jacket-3d-model',
    templateSlug: 'leather-jacket-androgynous-front',
    garmentType: 'leather-jacket',
    title: 'Leather jacket mockup',
    assetName: 'leather-jacket-androgynous-front',
    artwork: [512, 570, 440, 480],
    render: [300, 310, 730, 805],
    defaults: [42, 20],
    exportSlug: 'leather-jacket'
  },
  {
    modelSlug: 'long-sleeve-turtleneck-top-3d-model',
    templateSlug: 'turtleneck-nonbinary-front',
    garmentType: 'turtleneck',
    title: 'Turtleneck top mockup',
    assetName: 'turtleneck-nonbinary-front',
    artwork: [512, 585, 430, 500],
    render: [300, 300, 725, 815],
    defaults: [42, 34],
    exportSlug: 'turtleneck-top'
  },
  {
    modelSlug: 'puff-sleeve-button-blouse-3d-model',
    templateSlug: 'puff-sleeve-blouse-female-front',
    garmentType: 'puff-sleeve-blouse',
    title: 'Puff-sleeve blouse mockup',
    assetName: 'puff-sleeve-blouse-female-front',
    artwork: [512, 570, 480, 500],
    render: [250, 300, 780, 790],
    defaults: [44, 30],
    exportSlug: 'puff-sleeve-blouse'
  },
  {
    modelSlug: 'oversized-utility-shirt-dress-3d-model',
    templateSlug: 'utility-shirt-dress-female-front',
    garmentType: 'utility-shirt-dress',
    title: 'Utility shirt dress mockup',
    assetName: 'utility-shirt-dress-female-front',
    artwork: [512, 685, 440, 720],
    render: [300, 295, 725, 1025],
    defaults: [42, 28],
    exportSlug: 'utility-shirt-dress'
  },
  {
    modelSlug: 'relaxed-pants-3d-model',
    templateSlug: 'relaxed-pants-male-front',
    garmentType: 'relaxed-pants',
    title: 'Relaxed pants mockup',
    assetName: 'relaxed-pants-male-front',
    artwork: [512, 990, 500, 800],
    render: [305, 625, 715, 1430],
    defaults: [46, 30],
    exportSlug: 'relaxed-pants'
  },
  {
    modelSlug: 'quarter-zip-long-sleeve-top-3d-model',
    templateSlug: 'quarter-zip-walking-male-front',
    garmentType: 'quarter-zip-action',
    title: 'Quarter-zip walking mockup',
    assetName: 'quarter-zip-walking-male-front',
    artwork: [505, 555, 450, 510],
    render: [255, 260, 725, 805],
    defaults: [44, 34],
    exportSlug: 'quarter-zip-walking'
  },
  {
    modelSlug: 'henley-roll-sleeve-shirt-3d-garment-model',
    templateSlug: 'henley-wheelchair-male-front',
    garmentType: 'henley-seated',
    title: 'Henley seated mockup',
    assetName: 'henley-wheelchair-male-front',
    artwork: [500, 570, 520, 450],
    render: [145, 320, 820, 825],
    defaults: [48, 36],
    exportSlug: 'henley-seated'
  },
  {
    modelSlug: 'belted-womens-shirt-jacket-3d-model',
    templateSlug: 'belted-shirt-jacket-female-action',
    garmentType: 'belted-shirt-jacket-action',
    title: 'Belted shirt jacket action mockup',
    assetName: 'belted-shirt-jacket-female-action',
    artwork: [510, 555, 420, 590],
    render: [285, 225, 745, 900],
    defaults: [42, 28],
    exportSlug: 'belted-shirt-jacket-action'
  },
  {
    modelSlug: 'layered-skirt-3d-model',
    templateSlug: 'layered-skirt-female-walking',
    garmentType: 'layered-skirt-action',
    title: 'Layered skirt walking mockup',
    assetName: 'layered-skirt-female-walking',
    artwork: [525, 855, 530, 620],
    render: [265, 565, 825, 1210],
    defaults: [48, 36],
    exportSlug: 'layered-skirt-walking'
  },
  {
    modelSlug: 'classic-long-coat-3d-model',
    templateSlug: 'long-coat-male-walking',
    garmentType: 'long-coat-action',
    title: 'Long coat walking mockup',
    assetName: 'long-coat-male-walking',
    artwork: [510, 655, 440, 720],
    render: [275, 280, 740, 1060],
    defaults: [42, 25],
    exportSlug: 'long-coat-walking'
  },
  {
    modelSlug: 'structured-blazer-garment-3d-model',
    templateSlug: 'structured-blazer-female-action',
    garmentType: 'structured-blazer-action',
    title: 'Structured blazer action mockup',
    assetName: 'structured-blazer-female-action',
    artwork: [520, 545, 390, 520],
    render: [325, 280, 750, 865],
    defaults: [40, 22],
    exportSlug: 'structured-blazer-action'
  },
  {
    modelSlug: 'short-sleeve-panel-tee-3d-garment-model',
    templateSlug: 'panel-tee-european-male-candid',
    garmentType: 'panel-tee-candid',
    title: 'European panel tee candid mockup',
    assetName: 'panel-tee-european-male-candid',
    artwork: [510, 540, 430, 470],
    render: [275, 255, 735, 795],
    defaults: [44, 36],
    exportSlug: 'panel-tee-european-candid'
  },
  {
    modelSlug: 'tie-neck-womens-blouse-3d-model',
    templateSlug: 'tie-neck-blouse-european-female',
    garmentType: 'tie-neck-blouse-candid',
    title: 'European tie-neck blouse mockup',
    assetName: 'tie-neck-blouse-european-female',
    artwork: [515, 520, 420, 460],
    render: [315, 230, 755, 735],
    defaults: [42, 28],
    exportSlug: 'tie-neck-blouse-european'
  },
  {
    modelSlug: 'lightweight-trench-coat-3d-model',
    templateSlug: 'lightweight-trench-mediterranean-female',
    garmentType: 'lightweight-trench-candid',
    title: 'Mediterranean lightweight trench mockup',
    assetName: 'lightweight-trench-mediterranean-female',
    artwork: [515, 620, 440, 700],
    render: [275, 225, 785, 1080],
    defaults: [42, 25],
    exportSlug: 'lightweight-trench-mediterranean'
  },
  {
    modelSlug: 'structured-pants-3d-model',
    templateSlug: 'structured-pants-european-male',
    garmentType: 'structured-pants-candid',
    title: 'European structured pants mockup',
    assetName: 'structured-pants-european-male',
    artwork: [525, 990, 460, 800],
    render: [330, 625, 745, 1410],
    defaults: [44, 28],
    exportSlug: 'structured-pants-european'
  },
  {
    modelSlug: 'modern-one-piece-dress-3d-model',
    templateSlug: 'modern-dress-american-female',
    garmentType: 'modern-dress-candid',
    title: 'North American modern dress mockup',
    assetName: 'modern-dress-american-female',
    artwork: [520, 720, 560, 820],
    render: [180, 270, 890, 1240],
    defaults: [48, 34],
    exportSlug: 'modern-dress-american'
  },
  {
    modelSlug: 'longline-blazer-garment-3d-model',
    templateSlug: 'longline-blazer-nordic-male',
    garmentType: 'longline-blazer-candid',
    title: 'Nordic longline blazer mockup',
    assetName: 'longline-blazer-nordic-male',
    artwork: [510, 580, 400, 600],
    render: [265, 235, 735, 950],
    defaults: [40, 22],
    exportSlug: 'longline-blazer-nordic'
  }
];

async function upsertProfile(profile) {
  const model = await db.get(
    'SELECT id, name FROM models_3d WHERE slug = ? AND status = ?',
    [profile.modelSlug, 'active']
  );
  if (!model) throw new Error(`Active 3D model not found: ${profile.modelSlug}`);

  const [centerX, centerY, baseWidth, maxHeight] = profile.artwork;
  const [left, top, right, bottom] = profile.render;
  const [defaultScale, defaultWarp] = profile.defaults;
  const assetBase = `${ASSET_ROOT}/${profile.assetName}`;

  await db.run(`
    INSERT INTO on_model_mockup_profiles (
      model_id, template_slug, garment_type, title,
      base_image_url, mask_image_url, depth_image_url,
      canvas_width, canvas_height,
      artwork_center_x, artwork_center_y, artwork_base_width, artwork_max_height,
      render_left, render_top, render_right, render_bottom,
      default_scale, default_warp, export_slug, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1024, 1536, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
    ON CONFLICT(model_id) DO UPDATE SET
      template_slug = excluded.template_slug,
      garment_type = excluded.garment_type,
      title = excluded.title,
      base_image_url = excluded.base_image_url,
      mask_image_url = excluded.mask_image_url,
      depth_image_url = excluded.depth_image_url,
      canvas_width = excluded.canvas_width,
      canvas_height = excluded.canvas_height,
      artwork_center_x = excluded.artwork_center_x,
      artwork_center_y = excluded.artwork_center_y,
      artwork_base_width = excluded.artwork_base_width,
      artwork_max_height = excluded.artwork_max_height,
      render_left = excluded.render_left,
      render_top = excluded.render_top,
      render_right = excluded.render_right,
      render_bottom = excluded.render_bottom,
      default_scale = excluded.default_scale,
      default_warp = excluded.default_warp,
      export_slug = excluded.export_slug,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
  `, [
    model.id,
    profile.templateSlug,
    profile.garmentType,
    profile.title,
    `${assetBase}-base.png`,
    `${assetBase}-mask.png`,
    `${assetBase}-depth.png`,
    centerX,
    centerY,
    baseWidth,
    maxHeight,
    left,
    top,
    right,
    bottom,
    defaultScale,
    defaultWarp,
    profile.exportSlug
  ]);

  return {
    modelId: model.id,
    modelName: model.name,
    templateSlug: profile.templateSlug,
    assetName: profile.assetName
  };
}

async function upsertAsset(record, modelIdOverride) {
  const [centerX, centerY, baseWidth, maxHeight] = record.artwork;
  const [left, top, right, bottom] = record.render;
  const [defaultScale, defaultWarp] = record.defaults;
  const modelId = modelIdOverride || record.modelId || null;
  await db.run(`
    INSERT INTO on_model_mockup_assets (
      asset_name, model_id, garment_type, title,
      base_image_url, mask_image_url, depth_image_url,
      canvas_width, canvas_height,
      artwork_center_x, artwork_center_y, artwork_base_width, artwork_max_height,
      render_left, render_top, render_right, render_bottom,
      default_scale, default_warp, mask_coverage, generation_method,
      preferred_for_model, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
    ON CONFLICT(asset_name) DO UPDATE SET
      model_id = excluded.model_id,
      garment_type = excluded.garment_type,
      title = excluded.title,
      base_image_url = excluded.base_image_url,
      mask_image_url = excluded.mask_image_url,
      depth_image_url = excluded.depth_image_url,
      canvas_width = excluded.canvas_width,
      canvas_height = excluded.canvas_height,
      artwork_center_x = excluded.artwork_center_x,
      artwork_center_y = excluded.artwork_center_y,
      artwork_base_width = excluded.artwork_base_width,
      artwork_max_height = excluded.artwork_max_height,
      render_left = excluded.render_left,
      render_top = excluded.render_top,
      render_right = excluded.render_right,
      render_bottom = excluded.render_bottom,
      default_scale = excluded.default_scale,
      default_warp = excluded.default_warp,
      mask_coverage = excluded.mask_coverage,
      generation_method = excluded.generation_method,
      preferred_for_model = excluded.preferred_for_model,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
  `, [
    record.assetName,
    modelId,
    record.garmentType,
    record.title,
    record.baseImageUrl,
    record.maskImageUrl,
    record.depthImageUrl,
    record.canvasWidth,
    record.canvasHeight,
    centerX,
    centerY,
    baseWidth,
    maxHeight,
    left,
    top,
    right,
    bottom,
    defaultScale,
    defaultWarp,
    record.coverage,
    record.method,
    record.preferredForModel ? 1 : 0
  ]);
}

async function upsertGeneratedProfile(record) {
  const model = await db.get(
    'SELECT id, name FROM models_3d WHERE id = ? AND status = ?',
    [record.modelId, 'active']
  );
  if (!model) return null;
  const [centerX, centerY, baseWidth, maxHeight] = record.artwork;
  const [left, top, right, bottom] = record.render;
  const [defaultScale, defaultWarp] = record.defaults;
  await db.run(`
    INSERT INTO on_model_mockup_profiles (
      model_id, template_slug, garment_type, title,
      base_image_url, mask_image_url, depth_image_url,
      canvas_width, canvas_height,
      artwork_center_x, artwork_center_y, artwork_base_width, artwork_max_height,
      render_left, render_top, render_right, render_bottom,
      default_scale, default_warp, export_slug, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
    ON CONFLICT(model_id) DO UPDATE SET
      template_slug = excluded.template_slug,
      garment_type = excluded.garment_type,
      title = excluded.title,
      base_image_url = excluded.base_image_url,
      mask_image_url = excluded.mask_image_url,
      depth_image_url = excluded.depth_image_url,
      canvas_width = excluded.canvas_width,
      canvas_height = excluded.canvas_height,
      artwork_center_x = excluded.artwork_center_x,
      artwork_center_y = excluded.artwork_center_y,
      artwork_base_width = excluded.artwork_base_width,
      artwork_max_height = excluded.artwork_max_height,
      render_left = excluded.render_left,
      render_top = excluded.render_top,
      render_right = excluded.render_right,
      render_bottom = excluded.render_bottom,
      default_scale = excluded.default_scale,
      default_warp = excluded.default_warp,
      export_slug = excluded.export_slug,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
  `, [
    model.id,
    record.assetName,
    record.garmentType,
    record.title,
    record.baseImageUrl,
    record.maskImageUrl,
    record.depthImageUrl,
    record.canvasWidth,
    record.canvasHeight,
    centerX,
    centerY,
    baseWidth,
    maxHeight,
    left,
    top,
    right,
    bottom,
    defaultScale,
    defaultWarp,
    record.assetName
  ]);
  return { modelId: model.id, modelName: model.name, templateSlug: record.assetName };
}

async function main() {
  await ensureOnModelMockupTable();
  const curatedAssetModelIds = new Map();
  const curatedModelIds = new Set();
  for (const profile of profiles) {
    const result = await upsertProfile(profile);
    curatedAssetModelIds.set(result.assetName, result.modelId);
    curatedModelIds.add(result.modelId);
    console.log(`${result.modelId}\t${result.templateSlug}\t${result.modelName}`);
  }

  if (!fs.existsSync(GENERATED_ASSET_FILE)) {
    throw new Error(`Generated asset manifest not found: ${GENERATED_ASSET_FILE}`);
  }
  const manifest = JSON.parse(fs.readFileSync(GENERATED_ASSET_FILE, 'utf8'));
  for (const record of manifest.assets) {
    await upsertAsset(record, curatedAssetModelIds.get(record.assetName));
  }

  let generatedProfileCount = 0;
  for (const record of manifest.assets) {
    if (!record.preferredForModel || !record.modelId || curatedModelIds.has(record.modelId)) continue;
    const result = await upsertGeneratedProfile(record);
    if (result) generatedProfileCount += 1;
  }
  console.log(
    `Seeded ${profiles.length + generatedProfileCount} active profiles and `
    + `${manifest.assets.length} complete mockup asset sets.`
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
