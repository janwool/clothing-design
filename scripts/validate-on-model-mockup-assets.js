#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const db = require('../lib/db');
const { ensureOnModelMockupTable } = require('../lib/on-model-mockups');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'public', 'config', 'on-model-mockup-assets.json');

function readPngSize(filePath) {
  const header = Buffer.alloc(26);
  const descriptor = fs.openSync(filePath, 'r');
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (header.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
    throw new Error(`Invalid PNG signature: ${filePath}`);
  }
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
    colorType: header[25]
  };
}

function localAssetPath(url) {
  return path.join(root, 'public', url.replace(/^\//, '').replace(/^images\//, 'images/'));
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const names = new Set();
  const preferredModels = new Set();
  for (const record of manifest.assets) {
    if (names.has(record.assetName)) throw new Error(`Duplicate asset name: ${record.assetName}`);
    names.add(record.assetName);
    if (record.preferredForModel) {
      if (!record.modelId) throw new Error(`Preferred asset has no model: ${record.assetName}`);
      if (preferredModels.has(record.modelId)) throw new Error(`Multiple preferred assets for model ${record.modelId}`);
      preferredModels.add(record.modelId);
    }
    if (!String(record.method || '').includes('commercial-refine-v3')) {
      throw new Error(`Asset has not passed commercial mask refinement: ${record.assetName}`);
    }
    if (!(Number(record.coverage) > 0 && Number(record.coverage) < 0.85)) {
      throw new Error(`Mask coverage is outside the safe range: ${record.assetName}`);
    }
    for (const [kind, url] of [
      ['base', record.baseImageUrl],
      ['mask', record.maskImageUrl],
      ['depth', record.depthImageUrl]
    ]) {
      const filePath = localAssetPath(url);
      if (!fs.existsSync(filePath)) throw new Error(`Missing ${kind} asset: ${filePath}`);
      const png = readPngSize(filePath);
      if (png.width !== record.canvasWidth || png.height !== record.canvasHeight) {
        throw new Error(`${kind} dimensions do not match manifest: ${record.assetName}`);
      }
      if (kind !== 'base' && ![0, 4].includes(png.colorType)) {
        throw new Error(`${kind} map is not grayscale: ${record.assetName}`);
      }
    }
    const [left, top, right, bottom] = record.render;
    if (left < 0 || top < 0 || right > record.canvasWidth || bottom > record.canvasHeight) {
      throw new Error(`Render bounds leave the canvas: ${record.assetName}`);
    }
    if (right <= left || bottom <= top) {
      throw new Error(`Render bounds are empty: ${record.assetName}`);
    }
  }

  await ensureOnModelMockupTable();
  const assetCount = await db.get('SELECT COUNT(*) AS count FROM on_model_mockup_assets WHERE status = ?', ['active']);
  const refinedAssetCount = await db.get(
    "SELECT COUNT(*) AS count FROM on_model_mockup_assets WHERE status = ? AND generation_method LIKE ?",
    ['active', '%commercial-refine-v3%']
  );
  const profileCount = await db.get('SELECT COUNT(*) AS count FROM on_model_mockup_profiles WHERE status = ?', ['active']);
  if (Number(assetCount.count) !== manifest.assets.length) {
    throw new Error(`Database has ${assetCount.count} assets; manifest has ${manifest.assets.length}`);
  }
  if (Number(refinedAssetCount.count) !== manifest.assets.length) {
    throw new Error(`Database has ${refinedAssetCount.count} commercially refined assets; expected ${manifest.assets.length}`);
  }
  if (Number(profileCount.count) !== preferredModels.size) {
    throw new Error(`Database has ${profileCount.count} profiles; expected ${preferredModels.size}`);
  }
  console.log(
    `Validated ${manifest.assets.length} base/mask/depth sets, `
    + `${preferredModels.size} preferred model mappings, and matching database records.`
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
