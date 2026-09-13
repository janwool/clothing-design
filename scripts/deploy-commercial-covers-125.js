#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const root = path.resolve(__dirname, '..');
const version = '20260828-commercial-covers-v1';
const sourceDir = path.join(root, 'artifacts', 'render-qa', 'catalog-20260828-commercial-covers-v1', 'preview-webp');
const catalogManifest = path.join(root, 'artifacts', 'deployments', 'catalog-20260825-commercial-uv-all-v1', 'publish-manifest.json');
const qaReport = path.join(root, 'artifacts', 'render-qa', 'catalog-20260828-commercial-covers-v1', 'qa-report.json');
const outputDir = path.join(root, 'artifacts', 'deployments', `catalog-${version}`);
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const bucket = process.env.R2_BUCKET || 'clothing-design';
const shouldUpload = process.argv.includes('--upload');
const shouldApply = process.argv.includes('--apply');

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function remoteQuery(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${required(process.env.CF_ACCOUNT_ID, 'CF_ACCOUNT_ID')}` +
    `/d1/database/${required(process.env.D1_DATABASE_ID, 'D1_DATABASE_ID')}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${required(process.env.CF_API_TOKEN, 'CF_API_TOKEN')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(`D1 query failed: ${JSON.stringify(payload)}`);
  return payload.result[0].results;
}

async function mapConcurrent(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  });
  await Promise.all(runners);
}

async function main() {
  const qa = JSON.parse(await fsp.readFile(qaReport, 'utf8'));
  if (qa.expected !== 125 || qa.checked !== 125 || qa.missing.length || qa.issueCount) {
    throw new Error(`Refusing unverified covers: ${JSON.stringify({
      expected: qa.expected,
      checked: qa.checked,
      missing: qa.missing.length,
      issueCount: qa.issueCount,
    })}`);
  }

  const previous = JSON.parse(await fsp.readFile(catalogManifest, 'utf8'));
  if (previous.modelCount !== 125 || previous.models.length !== 125) {
    throw new Error(`Expected 125 catalog models, found ${previous.models.length}`);
  }
  const remoteBefore = await remoteQuery('SELECT id,slug,image_url FROM models_3d ORDER BY id;');
  if (remoteBefore.length !== 125) throw new Error(`Expected 125 remote models, found ${remoteBefore.length}`);
  const remoteById = new Map(remoteBefore.map(row => [Number(row.id), row]));

  const assets = [];
  for (const model of previous.models) {
    const remote = remoteById.get(Number(model.remoteId));
    if (!remote || remote.slug !== model.slug) {
      throw new Error(`Remote mapping changed at ${model.remoteId}: expected ${model.slug}, found ${remote?.slug}`);
    }
    const source = path.join(sourceDir, `${model.slug}.webp`);
    const stat = await fsp.stat(source);
    if (!stat.isFile() || stat.size === 0) throw new Error(`Missing cover: ${source}`);
    const key = `catalog/${version}/preview/${model.slug}.webp`;
    assets.push({
      remoteId: Number(model.remoteId),
      slug: model.slug,
      source,
      size: stat.size,
      key,
      url: `${publicBaseUrl}/${key}`,
    });
  }
  assets.sort((a, b) => a.remoteId - b.remoteId);

  await fsp.mkdir(outputDir, { recursive: true });
  const sql = assets.map(asset =>
    `UPDATE models_3d SET image_url=${sqlString(asset.url)},updated_at=CURRENT_TIMESTAMP ` +
    `WHERE id=${asset.remoteId} AND slug=${sqlString(asset.slug)};`
  ).join('\n') + '\n';
  const manifest = {
    createdAt: new Date().toISOString(),
    version,
    modelCount: assets.length,
    assetCount: assets.length,
    totalBytes: assets.reduce((sum, asset) => sum + asset.size, 0),
    qaReport,
    assets,
  };
  await fsp.writeFile(path.join(outputDir, 'publish-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await fsp.writeFile(path.join(outputDir, 'apply-remote.sql'), sql);
  await fsp.writeFile(path.join(outputDir, 'd1-before.json'), `${JSON.stringify(remoteBefore, null, 2)}\n`);

  const accountId = process.env.R2_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${required(accountId, 'R2_ACCOUNT_ID or CF_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required(process.env.R2_ACCESS_KEY_ID, 'R2_ACCESS_KEY_ID'),
      secretAccessKey: required(process.env.R2_SECRET_ACCESS_KEY, 'R2_SECRET_ACCESS_KEY'),
    },
  });

  if (shouldUpload) {
    let uploaded = 0;
    await mapConcurrent(assets, 8, async asset => {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: asset.key,
        Body: fs.createReadStream(asset.source),
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      uploaded += 1;
      if (uploaded % 25 === 0 || uploaded === assets.length) console.log(`uploaded ${uploaded}/${assets.length}`);
    });
  }

  let verified = 0;
  await mapConcurrent(assets, 12, async asset => {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.key }));
    if (Number(head.ContentLength) !== asset.size) {
      throw new Error(`R2 size mismatch for ${asset.key}: ${head.ContentLength} !== ${asset.size}`);
    }
    verified += 1;
    if (verified % 25 === 0 || verified === assets.length) console.log(`verified ${verified}/${assets.length}`);
  });

  if (shouldApply) await remoteQuery(sql);
  const remoteAfter = await remoteQuery('SELECT id,slug,image_url FROM models_3d ORDER BY id;');
  await fsp.writeFile(path.join(outputDir, 'd1-after.json'), `${JSON.stringify(remoteAfter, null, 2)}\n`);
  const mismatches = assets.filter(asset => {
    const row = remoteAfter.find(candidate => Number(candidate.id) === asset.remoteId);
    return !row || row.slug !== asset.slug || row.image_url !== asset.url;
  });
  if (shouldApply && mismatches.length) throw new Error(`D1 verification failed for ${mismatches.length} models`);

  console.log(JSON.stringify({
    version,
    uploaded: shouldUpload ? assets.length : 0,
    verified,
    applied: shouldApply ? assets.length : 0,
    d1Mismatches: mismatches.length,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
