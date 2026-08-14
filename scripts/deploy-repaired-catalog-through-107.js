#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const sqlite3 = require('sqlite3');
const {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

const projectRoot = path.resolve(__dirname, '..');
const deploymentDir = path.join(projectRoot, 'artifacts', 'deployments', 'catalog-20260814');
const remoteModelsPath = path.join(deploymentDir, 'models-before.json');
const localDatabasePath = path.join(projectRoot, 'database.sqlite');
const localBackupPath = path.join(
  projectRoot,
  'artifacts',
  'model-repair',
  '_batch',
  'catalog-replacement-20260808',
  'backup',
  'models_3d.before.json'
);
const manifestPath = path.join(deploymentDir, 'publish-manifest.json');
const sqlPath = path.join(deploymentDir, 'apply-catalog.sql');
const keyPrefix = process.env.CATALOG_R2_PREFIX || 'catalog/20260814-repair-through-107';
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

function queryDatabase(sql, params = []) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(localDatabasePath, sqlite3.OPEN_READONLY);
    database.all(sql, params, (error, rows) => {
      database.close();
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function sourcePath(rawUrl) {
  const pathname = new URL(rawUrl, 'https://local.invalid').pathname;
  if (!pathname.startsWith('/uploads/')) {
    throw new Error(`Refusing non-local catalog asset: ${rawUrl}`);
  }
  return path.join(projectRoot, 'public', pathname);
}

function basenameFromUrl(rawUrl) {
  return path.basename(new URL(rawUrl, 'https://local.invalid').pathname);
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function contentType(field) {
  if (field === 'file_url') return 'model/gltf-binary';
  if (field === 'image_url') return 'image/webp';
  return 'image/svg+xml; charset=utf-8';
}

function assetKind(field) {
  if (field === 'file_url') return 'glb';
  if (field === 'image_url') return 'preview';
  return 'texture';
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

async function uploadAsset(client, asset) {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: asset.key,
    Body: fs.createReadStream(asset.source),
    ContentType: asset.contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

async function verifyAsset(client, asset) {
  const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.key }));
  const remoteSize = Number(response.ContentLength || 0);
  if (remoteSize !== asset.size) {
    throw new Error(`R2 size mismatch for ${asset.key}: ${remoteSize} != ${asset.size}`);
  }
  return { ...asset, remoteSize };
}

function buildSql(models) {
  const statements = ['BEGIN TRANSACTION;'];
  for (const model of models) {
    if (model.remote.slug !== model.local.slug) {
      statements.push(
        `INSERT INTO model_3d_slug_redirects (old_slug, model_id) VALUES (${sqlString(model.remote.slug)}, ${model.remote.id}) ` +
        `ON CONFLICT(old_slug) DO UPDATE SET model_id=excluded.model_id;`
      );
    }
    statements.push(
      `UPDATE models_3d SET name=${sqlString(model.local.name)}, slug=${sqlString(model.local.slug)}, ` +
      `category=${sqlString(model.local.category)}, description=${sqlString(model.local.description)}, ` +
      `tags=${sqlString(model.local.tags)}, file_url=${sqlString(model.urls.file_url)}, ` +
      `image_url=${sqlString(model.urls.image_url)}, texture_url=${sqlString(model.urls.texture_url)}, ` +
      `status=${sqlString(model.local.status)}, updated_at=CURRENT_TIMESTAMP WHERE id=${model.remote.id};`
    );
    statements.push(`DELETE FROM model_3d_categories WHERE model_id=${model.remote.id};`);
    for (const categorySlug of model.categorySlugs) {
      statements.push(
        `INSERT INTO model_3d_categories (model_id, category_id, is_primary) ` +
        `SELECT ${model.remote.id}, id, ${categorySlug === model.primaryCategorySlug ? 1 : 0} FROM categories ` +
        `WHERE slug=${sqlString(categorySlug)} AND resource_type='3d-models';`
      );
    }
  }
  statements.push('COMMIT;');
  return `${statements.join('\n')}\n`;
}

async function main() {
  await fsp.mkdir(deploymentDir, { recursive: true });
  const remotePayload = JSON.parse(await fsp.readFile(remoteModelsPath, 'utf8'));
  const remoteRows = remotePayload[0]?.results || [];
  const remoteById = new Map(remoteRows.map(row => [row.id, row]));
  const backupRows = JSON.parse(await fsp.readFile(localBackupPath, 'utf8'));
  const backupById = new Map(backupRows.map(row => [row.id, row]));
  const localRows = await queryDatabase(
    `SELECT id,name,slug,category,description,tags,file_url,image_url,texture_url,status
     FROM models_3d WHERE id BETWEEN 2 AND 107 ORDER BY id`
  );
  const relationRows = await queryDatabase(
    `SELECT mc.model_id,c.slug,mc.is_primary
     FROM model_3d_categories mc
     JOIN categories c ON c.id=mc.category_id
     WHERE mc.model_id BETWEEN 2 AND 107
     ORDER BY mc.model_id,mc.is_primary DESC,c.slug`
  );
  if (localRows.length !== 106) throw new Error(`Expected 106 local models, found ${localRows.length}`);

  const relationsByModel = new Map();
  for (const relation of relationRows) {
    if (!relationsByModel.has(relation.model_id)) relationsByModel.set(relation.model_id, []);
    relationsByModel.get(relation.model_id).push(relation);
  }

  const models = [];
  const assets = [];
  for (const local of localRows) {
    const remote = remoteById.get(local.id + 1);
    const backup = backupById.get(local.id);
    if (!remote || !backup) throw new Error(`Missing mapping input for local model ${local.id}`);
    const oldFileMatches = basenameFromUrl(backup.file_url) === basenameFromUrl(remote.file_url);
    const sameSlug = local.slug === remote.slug;
    const manualBlazerMatch = local.id === 98 && remote.id === 99 && remote.slug === 'blazer-3d-model-03-fe1aafcd';
    if (!oldFileMatches && !sameSlug && !manualBlazerMatch) {
      throw new Error(`Unsafe mapping ${local.id}:${local.slug} -> ${remote.id}:${remote.slug}`);
    }

    const urls = {};
    for (const field of ['file_url', 'image_url', 'texture_url']) {
      const source = sourcePath(local[field]);
      const stat = await fsp.stat(source);
      if (!stat.isFile() || stat.size <= 0) throw new Error(`Missing asset: ${source}`);
      const key = `${keyPrefix}/${assetKind(field)}/${path.basename(source)}`;
      urls[field] = `${publicBaseUrl}/${key}`;
      assets.push({
        localId: local.id,
        remoteId: remote.id,
        slug: local.slug,
        field,
        source,
        key,
        url: urls[field],
        size: stat.size,
        contentType: contentType(field),
      });
    }
    const relations = relationsByModel.get(local.id) || [];
    const categorySlugs = relations.map(relation => relation.slug);
    const primaryCategorySlug = relations.find(relation => relation.is_primary)?.slug || categorySlugs[0];
    if (!categorySlugs.length || !primaryCategorySlug) {
      throw new Error(`Missing category relation for local model ${local.id}`);
    }
    models.push({ local, remote, urls, categorySlugs, primaryCategorySlug });
  }
  if (assets.length !== 318) throw new Error(`Expected 318 assets, found ${assets.length}`);

  const manifest = {
    createdAt: new Date().toISOString(),
    mode: shouldUpload ? 'upload' : shouldVerify ? 'verify' : 'prepare',
    keyPrefix,
    modelCount: models.length,
    assetCount: assets.length,
    totalBytes: assets.reduce((sum, asset) => sum + asset.size, 0),
    models: models.map(model => ({
      localId: model.local.id,
      remoteId: model.remote.id,
      oldSlug: model.remote.slug,
      slug: model.local.slug,
      categorySlugs: model.categorySlugs,
      urls: model.urls,
    })),
    assets,
  };
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fsp.writeFile(sqlPath, buildSql(models));

  console.log(JSON.stringify({
    mode: manifest.mode,
    modelCount: models.length,
    assetCount: assets.length,
    totalMiB: Number((manifest.totalBytes / 1024 / 1024).toFixed(2)),
    manifestPath,
    sqlPath,
  }, null, 2));

  if (!shouldVerify) return;
  const client = createClient();
  if (shouldUpload) {
    let uploaded = 0;
    await mapWithConcurrency(assets, concurrency, async asset => {
      await uploadAsset(client, asset);
      uploaded += 1;
      if (uploaded % 20 === 0 || uploaded === assets.length) {
        console.log(`uploaded ${uploaded}/${assets.length}`);
      }
    });
  }
  let verified = 0;
  await mapWithConcurrency(assets, concurrency, async asset => {
    const result = await verifyAsset(client, asset);
    verified += 1;
    if (verified % 20 === 0 || verified === assets.length) {
      console.log(`verified ${verified}/${assets.length}`);
    }
    return result;
  });
  console.log(JSON.stringify({ uploaded: shouldUpload ? assets.length : 0, verified }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
