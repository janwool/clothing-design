#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const sqlite3 = require('sqlite3');
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const projectRoot = path.resolve(__dirname, '..');
const databasePath = path.join(projectRoot, 'database.sqlite');
const deploymentDir = path.join(projectRoot, 'artifacts', 'deployments', 'catalog-20260814-neutral-glb-v1');
const manifestPath = path.join(deploymentDir, 'cover-manifest.json');
const sqlPath = path.join(deploymentDir, 'apply-remote-covers.sql');
const keyPrefix = process.env.NEUTRAL_COVER_R2_PREFIX || 'catalog/20260814-neutral-render-standard-v1/preview';
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const bucket = process.env.R2_BUCKET || 'clothing-design';
const accountId = process.env.R2_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const shouldUpload = process.argv.includes('--upload');
const shouldVerify = shouldUpload || process.argv.includes('--verify');
const concurrency = Math.max(1, Number(process.env.CATALOG_UPLOAD_CONCURRENCY || 6));

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function queryDatabase(sql, params = []) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
    database.all(sql, params, (error, rows) => {
      database.close();
      if (error) reject(error);
      else resolve(rows);
    });
  });
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

function buildSql(assets) {
  const statements = [];
  for (let start = 0; start < assets.length; start += 20) {
    const batch = assets.slice(start, start + 20);
    const imageCases = batch.map(asset => `WHEN ${asset.remoteId} THEN ${sqlString(asset.url)}`).join(' ');
    const slugCases = batch.map(asset => `WHEN ${asset.remoteId} THEN ${sqlString(asset.slug)}`).join(' ');
    statements.push(
      `UPDATE models_3d SET image_url=CASE id ${imageCases} ELSE image_url END, updated_at=CURRENT_TIMESTAMP ` +
      `WHERE id BETWEEN ${batch[0].remoteId} AND ${batch.at(-1).remoteId} ` +
      `AND slug=CASE id ${slugCases} ELSE slug END;`
    );
  }
  return `${statements.join('\n')}\n`;
}

async function main() {
  const rows = await queryDatabase(
    `SELECT id,slug,image_url FROM models_3d WHERE id BETWEEN 2 AND 107 ORDER BY id`
  );
  if (rows.length !== 106) throw new Error(`Expected 106 local models, found ${rows.length}`);

  const assets = [];
  for (const row of rows) {
    const pathname = new URL(row.image_url, 'https://local.invalid').pathname;
    if (!pathname.startsWith('/uploads/preview/') || !pathname.endsWith('-neutral-v1.webp')) {
      throw new Error(`Model ${row.id} has not been rendered with the neutral standard: ${row.image_url}`);
    }
    const source = path.join(projectRoot, 'public', pathname);
    const stat = await fsp.stat(source);
    if (!stat.isFile() || stat.size < 1000) throw new Error(`Invalid rendered cover: ${source}`);
    const key = `${keyPrefix}/${path.basename(source)}`;
    assets.push({
      localId: row.id,
      remoteId: row.id + 1,
      slug: row.slug,
      source,
      size: stat.size,
      key,
      url: `${publicBaseUrl}/${key}`,
    });
  }

  await fsp.mkdir(deploymentDir, { recursive: true });
  await fsp.writeFile(manifestPath, `${JSON.stringify({
    standard: 'basic-short-sleeve-tshirt-v1',
    modelCount: assets.length,
    keyPrefix,
    assets,
  }, null, 2)}\n`);
  await fsp.writeFile(sqlPath, buildSql(assets));
  console.log(JSON.stringify({
    mode: shouldUpload ? 'upload' : shouldVerify ? 'verify' : 'prepare',
    modelCount: assets.length,
    totalMiB: Number((assets.reduce((sum, asset) => sum + asset.size, 0) / 1024 / 1024).toFixed(2)),
    keyPrefix,
    manifestPath,
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
        ContentType: 'image/webp',
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
