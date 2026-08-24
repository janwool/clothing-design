#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const sqlite3 = require('sqlite3');
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const root = path.resolve(__dirname, '..');
const version = '20260825-commercial-uv-v2';
const candidateDir = path.join(root, 'artifacts', 'deployments', 'catalog-20260824-commercial-uv-v2');
const outputDir = path.join(root, 'artifacts', 'deployments', `catalog-${version}`);
const databasePath = path.join(root, 'database.sqlite');
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const bucket = process.env.R2_BUCKET || 'clothing-design';
const shouldUpload = process.argv.includes('--upload');
const shouldVerify = shouldUpload || process.argv.includes('--verify');

const slugs = [
  'long-sleeve-turtleneck-top-3d-model',
  'oversized-utility-shirt-dress-3d-model',
  'puff-sleeve-button-blouse-3d-model',
  'tie-neck-womens-blouse-3d-model',
  'puff-sleeve-v-neck-button-top-3d-model',
  'relaxed-pants-3d-model',
  'classic-pants-alternate-fit-3d-model',
  'relaxed-pants-panel-layout-3d-model',
  'classic-underwear-base-garment-3d-model',
  'tailored-underwear-base-garment-3d-model',
  'utility-underwear-base-garment-3d-model',
  'longline-fashion-bag-3d-model',
];

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
    db.all(sql, params, (error, rows) => {
      db.close();
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function publicSource(rawUrl) {
  const pathname = new URL(rawUrl, 'https://local.invalid').pathname;
  if (!pathname.startsWith('/uploads/')) throw new Error(`Refusing non-local preview: ${rawUrl}`);
  return path.join(root, 'public', pathname);
}

async function mapConcurrent(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  });
  await Promise.all(runners);
}

function buildSql(models) {
  // Wrangler D1 executes uploaded SQL files as a managed batch and rejects
  // explicit BEGIN/COMMIT statements.
  const statements = [];
  for (const model of models) {
    const row = model.row;
    statements.push(
      `INSERT INTO models_3d (name,slug,category,description,tags,file_url,image_url,texture_url,status) ` +
      `SELECT ${sqlString(row.name)},${sqlString(row.slug)},${sqlString(row.category)},${sqlString(row.description)},` +
      `${sqlString(row.tags)},${sqlString(model.urls.file_url)},${sqlString(model.urls.image_url)},` +
      `${sqlString(model.urls.texture_url)},${sqlString(row.status)} ` +
      `WHERE NOT EXISTS (SELECT 1 FROM models_3d WHERE slug=${sqlString(row.slug)});`
    );
    statements.push(
      `UPDATE models_3d SET name=${sqlString(row.name)},category=${sqlString(row.category)},` +
      `description=${sqlString(row.description)},tags=${sqlString(row.tags)},` +
      `file_url=${sqlString(model.urls.file_url)},image_url=${sqlString(model.urls.image_url)},` +
      `texture_url=${sqlString(model.urls.texture_url)},status=${sqlString(row.status)},` +
      `updated_at=CURRENT_TIMESTAMP WHERE slug=${sqlString(row.slug)};`
    );
    statements.push(
      `DELETE FROM model_3d_categories WHERE model_id IN ` +
      `(SELECT id FROM models_3d WHERE slug=${sqlString(row.slug)});`
    );
    for (const relation of model.categories) {
      statements.push(
        `INSERT INTO model_3d_categories (model_id,category_id,is_primary) ` +
        `SELECT m.id,c.id,${relation.is_primary ? 1 : 0} FROM models_3d m,categories c ` +
        `WHERE m.slug=${sqlString(row.slug)} AND c.slug=${sqlString(relation.slug)} ` +
        `AND c.resource_type='3d-models';`
      );
    }
  }
  return `${statements.join('\n')}\n`;
}

async function main() {
  const placeholders = slugs.map(() => '?').join(',');
  const rows = await query(
    `SELECT id,name,slug,category,description,tags,image_url,status FROM models_3d ` +
    `WHERE slug IN (${placeholders}) ORDER BY id`,
    slugs
  );
  if (rows.length !== slugs.length) throw new Error(`Expected ${slugs.length} local models, found ${rows.length}`);
  const relations = await query(
    `SELECT m.slug,c.slug AS category_slug,mc.is_primary FROM models_3d m ` +
    `JOIN model_3d_categories mc ON mc.model_id=m.id ` +
    `JOIN categories c ON c.id=mc.category_id WHERE m.slug IN (${placeholders}) ` +
    `ORDER BY m.id,mc.is_primary DESC,c.slug`,
    slugs
  );
  const relationsBySlug = new Map();
  for (const relation of relations) {
    if (!relationsBySlug.has(relation.slug)) relationsBySlug.set(relation.slug, []);
    relationsBySlug.get(relation.slug).push({ slug: relation.category_slug, is_primary: Boolean(relation.is_primary) });
  }

  const models = [];
  const assets = [];
  for (const row of rows) {
    const glb = path.join(candidateDir, 'glb', `${row.slug}.glb`);
    const svg = path.join(candidateDir, 'texture', `${row.slug}.svg`);
    const preview = publicSource(row.image_url);
    const sources = { file_url: glb, texture_url: svg, image_url: preview };
    const keys = {
      file_url: `catalog/${version}/glb/${row.slug}.glb`,
      texture_url: `catalog/${version}/texture/${row.slug}.svg`,
      image_url: `catalog/${version}/preview/${row.slug}.webp`,
    };
    const urls = Object.fromEntries(Object.entries(keys).map(([field, key]) => [field, `${publicBaseUrl}/${key}`]));
    for (const [field, source] of Object.entries(sources)) {
      const stat = await fsp.stat(source);
      if (!stat.isFile() || stat.size <= 0) throw new Error(`Missing asset: ${source}`);
      assets.push({
        slug: row.slug,
        field,
        source,
        key: keys[field],
        url: urls[field],
        size: stat.size,
        contentType: field === 'file_url' ? 'model/gltf-binary' : field === 'texture_url' ? 'image/svg+xml; charset=utf-8' : 'image/webp',
      });
    }
    const categories = relationsBySlug.get(row.slug) || [];
    if (!categories.length || !categories.some(category => category.is_primary)) {
      throw new Error(`Missing primary category for ${row.slug}`);
    }
    models.push({ row, categories, urls });
  }
  if (assets.length !== 36) throw new Error(`Expected 36 assets, found ${assets.length}`);

  await fsp.mkdir(outputDir, { recursive: true });
  const manifestPath = path.join(outputDir, 'publish-manifest.json');
  const sqlPath = path.join(outputDir, 'apply-remote.sql');
  const manifest = {
    createdAt: new Date().toISOString(),
    version,
    modelCount: models.length,
    assetCount: assets.length,
    totalBytes: assets.reduce((sum, asset) => sum + asset.size, 0),
    models: models.map(model => ({
      localId: model.row.id,
      slug: model.row.slug,
      categories: model.categories,
      urls: model.urls,
    })),
    assets,
  };
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fsp.writeFile(sqlPath, buildSql(models));
  console.log(JSON.stringify({
    mode: shouldUpload ? 'upload' : shouldVerify ? 'verify' : 'prepare',
    version,
    modelCount: manifest.modelCount,
    assetCount: manifest.assetCount,
    totalMiB: Number((manifest.totalBytes / 1024 / 1024).toFixed(2)),
    manifestPath,
    sqlPath,
  }, null, 2));
  if (!shouldVerify) return;

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
    await mapConcurrent(assets, 4, async asset => {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: asset.key,
        Body: fs.createReadStream(asset.source),
        ContentType: asset.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      uploaded += 1;
      if (uploaded % 6 === 0 || uploaded === assets.length) console.log(`uploaded ${uploaded}/${assets.length}`);
    });
  }
  let verified = 0;
  await mapConcurrent(assets, 8, async asset => {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.key }));
    if (Number(head.ContentLength) !== asset.size) {
      throw new Error(`R2 size mismatch for ${asset.key}: ${head.ContentLength} !== ${asset.size}`);
    }
    verified += 1;
  });
  console.log(JSON.stringify({ uploaded: shouldUpload ? assets.length : 0, verified }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
