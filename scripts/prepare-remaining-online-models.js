#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const { patchGlb, sha256 } = require('./neutralize-catalog-glb-materials');

const projectRoot = path.resolve(__dirname, '..');
const deploymentDir = path.join(
  projectRoot,
  'artifacts',
  'deployments',
  'catalog-20260814-neutral-glb-v1',
  'remaining-covers'
);
const sourceManifestPath = path.join(deploymentDir, 'models.json');
const sourceDir = path.join(deploymentDir, 'source');
const neutralDir = path.join(deploymentDir, 'neutral-glb');
const manifestPath = path.join(deploymentDir, 'prepared-models.json');

async function main() {
  const models = JSON.parse(await fs.readFile(sourceManifestPath, 'utf8'));
  if (models.length !== 16) throw new Error(`Expected 16 remaining models, found ${models.length}`);
  await fs.mkdir(neutralDir, { recursive: true });

  const prepared = [];
  for (const model of models) {
    const source = path.join(sourceDir, `${String(model.id).padStart(3, '0')}-${model.slug}.glb`);
    const destination = path.join(neutralDir, `${model.slug}-neutral-v1.glb`);
    const input = await fs.readFile(source);
    const patched = patchGlb(input);
    await fs.writeFile(destination, patched.output);
    prepared.push({
      ...model,
      source,
      neutralGlb: destination,
      inputSha256: sha256(input),
      outputSha256: sha256(patched.output),
      bytes: patched.output.length,
      binarySha256: patched.binarySha256,
      ...patched.changes,
    });
  }

  const payload = {
    standard: 'basic-short-sleeve-tshirt-v1',
    modelCount: prepared.length,
    totals: {
      materials: prepared.reduce((sum, model) => sum + model.materialCount, 0),
      removedBaseColorTextures: prepared.reduce((sum, model) => sum + model.removedBaseColorTextures, 0),
      neutralizedFactors: prepared.reduce((sum, model) => sum + model.neutralizedFactors, 0),
    },
    models: prepared,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ manifestPath, ...payload.totals }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
