#!/usr/bin/env node

require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const root = path.resolve(__dirname, '..');
const version = '20260926-generated-commercial-v1';
const sourceDir = path.join(root, 'public/images/model-covers/generated-commercial-v1');
const sourceManifest = path.join(root, 'scripts/model-cover-source-manifest.json');
const outputDir = path.join(root, 'artifacts/deployments', version);
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const bucket = process.env.R2_BUCKET || 'clothing-design';
const args = new Set(process.argv.slice(2));
const upload = args.has('--upload') || args.has('--publish');
const apply = args.has('--apply') || args.has('--publish');

function required(name) {
  if (!process.env[name]) throw new Error(`${name} is required`);
  return process.env[name];
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function remoteQuery(sql) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${required('CF_ACCOUNT_ID')}` +
    `/d1/database/${required('D1_DATABASE_ID')}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${required('CF_API_TOKEN')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success || payload.result?.some(item => item.success === false)) {
    throw new Error(`D1 query failed: ${JSON.stringify(payload.errors || payload.result)}`);
  }
  return payload.result?.[0]?.results || [];
}

async function mapConcurrent(items, limit, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  }));
}

async function main() {
  const source = JSON.parse(await fs.readFile(sourceManifest, 'utf8'));
  const slugs = new Set(source.map(item => item.slug));
  if (source.length !== 261 || slugs.size !== 261) throw new Error('Expected 261 unique source models');
  const active = (await remoteQuery('SELECT id,slug,image_url,status FROM models_3d WHERE status=\'active\' ORDER BY id;'));
  if (active.length !== 261 || active.some(row => !slugs.has(row.slug))) {
    throw new Error('Production active models no longer match the 261 cover sources');
  }
  const bySlug = new Map(active.map(row => [row.slug, row]));
  const assets = [];
  for (const item of source) {
    const file = path.join(sourceDir, `${item.slug}.webp`);
    const body = await fs.readFile(file);
    if (body.length === 0) throw new Error(`Empty cover: ${file}`);
    const key = `catalog/${version}/preview/${item.slug}.webp`;
    assets.push({
      id: Number(bySlug.get(item.slug).id),
      slug: item.slug,
      source: file,
      oldUrl: bySlug.get(item.slug).image_url,
      key,
      url: `${publicBaseUrl}/${key}`,
      bytes: body.length,
      sha256: crypto.createHash('sha256').update(body).digest('hex'),
    });
  }
  assets.sort((a, b) => a.id - b.id);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'd1-before.json'), JSON.stringify(active, null, 2) + '\n');
  await fs.writeFile(path.join(outputDir, 'publish-manifest.json'), JSON.stringify({
    version, modelCount: assets.length, bucket, assets,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ version, bucket, models: assets.length, upload, apply }));

  if (upload || apply) {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID || required('CF_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required('R2_ACCESS_KEY_ID'),
        secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
      },
    });
    if (upload) {
      let completed = 0;
      await mapConcurrent(assets, 8, async asset => {
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: asset.key,
          Body: await fs.readFile(asset.source),
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
          Metadata: { sha256: asset.sha256 },
        }));
        completed += 1;
        if (completed % 50 === 0 || completed === assets.length) console.log(`uploaded ${completed}/${assets.length}`);
      });
    }
    let verified = 0;
    await mapConcurrent(assets, 12, async asset => {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.key }));
      if (Number(head.ContentLength) !== asset.bytes || head.Metadata?.sha256 !== asset.sha256) {
        throw new Error(`R2 verification failed: ${asset.key}`);
      }
      verified += 1;
      if (verified % 50 === 0 || verified === assets.length) console.log(`verified ${verified}/${assets.length}`);
    });
  }

  if (apply) {
    const sql = assets.map(asset =>
      `UPDATE models_3d SET image_url=${sqlString(asset.url)},updated_at=CURRENT_TIMESTAMP ` +
      `WHERE id=${asset.id} AND slug=${sqlString(asset.slug)} AND status='active';`
    ).join('\n') + '\n';
    await fs.writeFile(path.join(outputDir, 'apply-remote.sql'), sql);
    for (let offset = 0; offset < assets.length; offset += 40) {
      const statements = sql.trim().split('\n').slice(offset, offset + 40).join('\n');
      await remoteQuery(statements);
      console.log(`updated ${Math.min(offset + 40, assets.length)}/${assets.length}`);
    }
    const after = await remoteQuery('SELECT id,slug,image_url,status FROM models_3d WHERE status=\'active\' ORDER BY id;');
    await fs.writeFile(path.join(outputDir, 'd1-after.json'), JSON.stringify(after, null, 2) + '\n');
    const byId = new Map(after.map(row => [Number(row.id), row]));
    const mismatches = assets.filter(asset => byId.get(asset.id)?.image_url !== asset.url);
    if (mismatches.length) throw new Error(`D1 verification failed for ${mismatches.length} covers`);
    console.log(`D1 verified ${assets.length}/${assets.length}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
