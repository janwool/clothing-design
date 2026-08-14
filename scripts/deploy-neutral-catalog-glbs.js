#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

const projectRoot = path.resolve(__dirname, '..');
const deploymentDir = path.join(projectRoot, 'artifacts', 'deployments', 'catalog-20260814-neutral-glb-v1');
const manifestPath = path.join(deploymentDir, 'manifest.json');
const sqlPath = path.join(deploymentDir, 'apply-remote.sql');
const keyPrefix = process.env.NEUTRAL_GLB_R2_PREFIX || 'catalog/20260814-neutral-glb-v1/glb';
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const bucket = process.env.R2_BUCKET || 'clothing-design';
const accountId = process.env.R2_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const shouldUpload = process.argv.includes('--upload');
const shouldVerify = shouldUpload || process.argv.includes('--verify');
const concurrency = Math.max(1, Number(process.env.CATALOG_UPLOAD_CONCURRENCY || 4));

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function mapWithConcurrency(items, limit, worker) {
  let index = 0;
  const results = new Array(items.length);
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return results;
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
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  if (manifest.modelCount !== 106 || manifest.models.length !== 106) {
    throw new Error(`Expected 106 manifest models, found ${manifest.models.length}`);
  }
  const assets = manifest.models.map(model => {
    const remoteId = model.id + 1;
    const key = `${keyPrefix}/${path.basename(model.destination)}`;
    return {
      localId: model.id,
      remoteId,
      slug: model.slug,
      source: model.destination,
      size: model.bytes,
      key,
      url: `${publicBaseUrl}/${key}`,
    };
  });
  for (const asset of assets) {
    const stat = await fsp.stat(asset.source);
    if (!stat.isFile() || stat.size !== asset.size) {
      throw new Error(`Invalid neutral GLB: ${asset.source}`);
    }
  }
  // Wrangler's remote D1 file executor batches statements itself and does not
  // apply explicit BEGIN/COMMIT wrappers from an input file.
  const statements = [
    ...assets.map(asset =>
      `UPDATE models_3d SET file_url=${sqlString(asset.url)}, updated_at=CURRENT_TIMESTAMP ` +
      `WHERE id=${asset.remoteId} AND slug=${sqlString(asset.slug)};`
    ),
  ];
  await fsp.writeFile(sqlPath, `${statements.join('\n')}\n`);
  console.log(JSON.stringify({
    mode: shouldUpload ? 'upload' : shouldVerify ? 'verify' : 'prepare',
    modelCount: assets.length,
    totalMiB: Number((assets.reduce((sum, asset) => sum + asset.size, 0) / 1024 / 1024).toFixed(2)),
    keyPrefix,
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
        ContentType: 'model/gltf-binary',
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      uploaded += 1;
      if (uploaded % 20 === 0 || uploaded === assets.length) console.log(`uploaded ${uploaded}/${assets.length}`);
    });
  }
  let verified = 0;
  await mapWithConcurrency(assets, concurrency, async asset => {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.key }));
    if (Number(result.ContentLength) !== asset.size) {
      throw new Error(`R2 size mismatch for ${asset.key}: ${result.ContentLength} !== ${asset.size}`);
    }
    verified += 1;
    if (verified % 20 === 0 || verified === assets.length) console.log(`verified ${verified}/${assets.length}`);
  });
  console.log(JSON.stringify({ uploaded: shouldUpload ? assets.length : 0, verified }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
