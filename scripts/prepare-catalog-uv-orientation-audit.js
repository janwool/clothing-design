#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const root = path.resolve(__dirname, '..');
const baseManifest = path.join(root, 'artifacts/deployments/catalog-20260817-svg-clean-v2/manifest.json');
const outputDir = path.join(root, 'artifacts/deployments/catalog-20260818-uv-orientation-audit');
const outputPath = path.join(outputDir, 'catalog.json');

async function exists(file) {
  return fsp.access(file).then(() => true, () => false);
}

async function download(url, destination) {
  const response = await fetch(url, { headers: { 'user-agent': 'cloz-uv-orientation-audit/1.0' } });
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.writeFile(destination, buffer);
  return destination;
}

async function locateGlb(model) {
  if (model.slug === 'minimal-long-sleeve-pullover-3d-garment-model') {
    return path.join(root, 'artifacts/deployments/catalog-20260818-upright-uv-v2/glb/minimal-long-sleeve-pullover-3d-garment-model-fabric-v1-upright-v2.glb');
  }
  const basename = path.basename(new URL(model.file_url).pathname);
  const candidates = [
    path.join(root, 'public/uploads/glb', basename),
    path.join(root, 'artifacts/deployments/catalog-20260814-svg-clean-v1/glb', basename),
    path.join(root, 'artifacts/deployments/catalog-20260814-neutral-glb-v1/remaining-covers/neutral-glb', basename),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return download(model.file_url, path.join(outputDir, 'downloaded-glb', basename));
}

async function main() {
  const manifest = JSON.parse(await fsp.readFile(baseManifest, 'utf8'));
  await fsp.mkdir(outputDir, { recursive: true });
  const models = [];
  for (const model of manifest.models) {
    const svg = model.slug === 'minimal-long-sleeve-pullover-3d-garment-model'
      ? path.join(root, 'artifacts/deployments/catalog-20260818-upright-uv-v2/texture', `${model.slug}.svg`)
      : path.join(root, 'artifacts/deployments/catalog-20260817-svg-clean-v2/texture', `${model.slug}.svg`);
    const glb = await locateGlb(model);
    const [glbStat, svgStat] = await Promise.all([fsp.stat(glb), fsp.stat(svg)]);
    models.push({
      id: model.id,
      slug: model.slug,
      category: model.category,
      currentFileUrl: model.slug === 'minimal-long-sleeve-pullover-3d-garment-model'
        ? 'https://cdn.cloz-design.com/catalog/20260818-upright-uv-v2/glb/minimal-long-sleeve-pullover-3d-garment-model-fabric-v1-upright-v2.glb'
        : model.file_url,
      currentTextureUrl: model.slug === 'minimal-long-sleeve-pullover-3d-garment-model'
        ? 'https://cdn.cloz-design.com/catalog/20260818-upright-uv-v2/texture/minimal-long-sleeve-pullover-3d-garment-model.svg'
        : model.texture_url,
      glb,
      svg,
      glbBytes: glbStat.size,
      svgBytes: svgStat.size,
    });
  }
  if (models.length !== 124) throw new Error(`Expected 124 models, found ${models.length}`);
  await fsp.writeFile(outputPath, `${JSON.stringify({ createdAt: new Date().toISOString(), models }, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, models: models.length, totalGlbMiB: Number((models.reduce((sum, model) => sum + model.glbBytes, 0) / 1024 / 1024).toFixed(2)) }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
