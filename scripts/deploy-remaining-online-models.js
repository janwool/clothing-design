#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const projectRoot = path.resolve(__dirname, '..');
const deploymentDir = path.join(
  projectRoot,
  'artifacts',
  'deployments',
  'catalog-20260814-neutral-glb-v1',
  'remaining-covers'
);
const preparedPath = path.join(deploymentDir, 'prepared-models.json');
const readyDir = path.join(deploymentDir, 'ready');
const publishManifestPath = path.join(deploymentDir, 'publish-manifest.json');
const sqlPath = path.join(deploymentDir, 'apply-remote.sql');
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const glbPrefix = 'catalog/20260814-neutral-glb-v1/glb';
const coverPrefix = 'catalog/20260814-neutral-render-standard-v1/preview';
const bucket = process.env.R2_BUCKET || 'clothing-design';
const accountId = process.env.R2_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const shouldUpload = process.argv.includes('--upload');
const shouldVerify = shouldUpload || process.argv.includes('--verify');
const concurrency = 6;

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function mapWithConcurrency(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) await worker(items[index++]);
  });
  await Promise.all(runners);
}

function createClient() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${required(accountId, 'R2_ACCOUNT_ID or CF_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required(accessKeyId, 'R2_ACCESS_KEY_ID'),
      secretAccessKey: required(secretAccessKey, 'R2_SECRET_ACCESS_KEY'),
    },
  });
}

async function main() {
  const prepared = JSON.parse(await fsp.readFile(preparedPath, 'utf8'));
  if (prepared.modelCount !== 16 || prepared.models.length !== 16) {
    throw new Error(`Expected 16 prepared models, found ${prepared.models.length}`);
  }

  const models = [];
  const assets = [];
  for (const model of prepared.models) {
    const cover = path.join(readyDir, `${model.slug}-neutral-v1.webp`);
    const glb = model.neutralGlb;
    const coverStat = await fsp.stat(cover);
    const glbStat = await fsp.stat(glb);
    const coverKey = `${coverPrefix}/${path.basename(cover)}`;
    const glbKey = `${glbPrefix}/${path.basename(glb)}`;
    const imageUrl = `${publicBaseUrl}/${coverKey}`;
    const fileUrl = `${publicBaseUrl}/${glbKey}`;
    models.push({ id: model.id, name: model.name, slug: model.slug, imageUrl, fileUrl });
    assets.push(
      { source: cover, size: coverStat.size, key: coverKey, contentType: 'image/webp' },
      { source: glb, size: glbStat.size, key: glbKey, contentType: 'model/gltf-binary' },
    );
  }

  const sql = models.map(model =>
    `UPDATE models_3d SET image_url=${sqlString(model.imageUrl)}, file_url=${sqlString(model.fileUrl)}, ` +
    `updated_at=CURRENT_TIMESTAMP WHERE id=${model.id} AND slug=${sqlString(model.slug)};`
  ).join('\n') + '\n';
  await fsp.writeFile(sqlPath, sql);
  await fsp.writeFile(publishManifestPath, `${JSON.stringify({
    standard: prepared.standard,
    modelCount: models.length,
    assetCount: assets.length,
    models,
    assets,
  }, null, 2)}\n`);
  console.log(JSON.stringify({
    mode: shouldUpload ? 'upload' : shouldVerify ? 'verify' : 'prepare',
    modelCount: models.length,
    assetCount: assets.length,
    totalMiB: Number((assets.reduce((sum, asset) => sum + asset.size, 0) / 1024 / 1024).toFixed(2)),
    sqlPath,
  }, null, 2));
  if (!shouldVerify) return;

  const client = createClient();
  if (shouldUpload) {
    let uploaded = 0;
    await mapWithConcurrency(assets, concurrency, async asset => {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: asset.key,
        Body: fs.createReadStream(asset.source),
        ContentType: asset.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      uploaded += 1;
      if (uploaded % 8 === 0 || uploaded === assets.length) console.log(`uploaded ${uploaded}/${assets.length}`);
    });
  }

  let verified = 0;
  await mapWithConcurrency(assets, concurrency, async asset => {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.key }));
    if (Number(result.ContentLength) !== asset.size) {
      throw new Error(`R2 size mismatch for ${asset.key}: ${result.ContentLength} !== ${asset.size}`);
    }
    verified += 1;
    if (verified % 8 === 0 || verified === assets.length) console.log(`verified ${verified}/${assets.length}`);
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
