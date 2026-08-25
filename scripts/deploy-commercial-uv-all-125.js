#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const sqlite3 = require('sqlite3');
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const root = path.resolve(__dirname, '..');
const version = '20260825-commercial-uv-all-v1';
const outputDir = path.join(root, 'artifacts', 'deployments', `catalog-${version}`);
const remoteSourceDir = path.join(outputDir, 'remote-source');
const databasePath = path.join(root, 'database.sqlite');
const v1Dir = path.join(root, 'artifacts', 'deployments', 'catalog-20260819-commercial-uv-v1');
const v2Dir = path.join(root, 'artifacts', 'deployments', 'catalog-20260824-commercial-uv-v2');
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const bucket = process.env.R2_BUCKET || 'clothing-design';
const shouldUpload = process.argv.includes('--upload');
const shouldVerify = shouldUpload || process.argv.includes('--verify');

const retainedRemoteIds = new Set([1, 2, 110]);
const localOnlyTargetIds = new Map([
  ['tailored-fashion-bag-3d-model', 109],
  ['structured-fashion-bag-3d-model', 111],
  ['lightweight-fashion-bag-3d-model', 112],
  ['longline-skirt-3d-model', 117],
  ['layered-skirt-3d-model', 118],
  ['utility-loose-woven-top-3d-model', 120],
  ['minimal-loose-woven-top-3d-model', 121],
  ['layered-loose-woven-top-3d-model', 122],
  ['modern-long-coat-3d-model', 123],
  ['modern-underwear-base-garment-3d-model', 124],
]);

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function localQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
    db.all(sql, params, (error, rows) => {
      db.close();
      if (error) reject(error);
      else resolve(rows);
    });
  });
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

function publicSource(rawUrl) {
  const pathname = new URL(rawUrl, 'https://local.invalid').pathname;
  if (!pathname.startsWith('/uploads/')) throw new Error(`Refusing non-local asset: ${rawUrl}`);
  return path.join(root, 'public', pathname);
}

async function isFile(filePath) {
  try {
    return (await fsp.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function download(url, destination) {
  if (await isFile(destination)) return destination;
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length) throw new Error(`Downloaded empty asset: ${url}`);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.writeFile(destination, data);
  return destination;
}

async function localAssetSources(row) {
  const v2Glb = path.join(v2Dir, 'glb', `${row.slug}.glb`);
  const v2Svg = path.join(v2Dir, 'texture', `${row.slug}.svg`);
  const v1Glb = path.join(v1Dir, 'glb', `${row.slug}.glb`);
  const v1Svg = path.join(v1Dir, 'texture', `${row.slug}.svg`);
  let file;
  let texture;
  let sourceTier;
  if (await isFile(v2Glb) && await isFile(v2Svg)) {
    file = v2Glb;
    texture = v2Svg;
    sourceTier = 'commercial-v2';
  } else if (await isFile(v1Glb) && await isFile(v1Svg)) {
    file = v1Glb;
    texture = v1Svg;
    sourceTier = 'commercial-v1';
  } else {
    file = publicSource(row.file_url);
    texture = publicSource(row.texture_url);
    sourceTier = 'local-production';
  }
  const image = publicSource(row.image_url);
  for (const source of [file, texture, image]) {
    if (!await isFile(source)) throw new Error(`Missing local source for ${row.slug}: ${source}`);
  }
  return { file, texture, image, sourceTier };
}

async function remoteAssetSources(row) {
  const extensionByField = { file: 'glb', texture: 'svg', image: 'webp' };
  const urlByField = { file: row.file_url, texture: row.texture_url, image: row.image_url };
  const result = { sourceTier: 'remote-retained' };
  for (const [field, extension] of Object.entries(extensionByField)) {
    result[field] = await download(
      urlByField[field],
      path.join(remoteSourceDir, `${String(row.id).padStart(3, '0')}-${row.slug}.${extension}`)
    );
  }
  return result;
}

async function mapConcurrent(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  });
  await Promise.all(runners);
}

function buildSql(models) {
  const statements = [];
  for (const model of models) {
    const row = model.data;
    statements.push(
      `UPDATE models_3d SET name=${sqlString(row.name)},slug=${sqlString(row.slug)},` +
      `category=${sqlString(row.category)},description=${sqlString(row.description)},tags=${sqlString(row.tags)},` +
      `file_url=${sqlString(model.urls.file_url)},image_url=${sqlString(model.urls.image_url)},` +
      `texture_url=${sqlString(model.urls.texture_url)},status=${sqlString(row.status || 'active')},` +
      `updated_at=CURRENT_TIMESTAMP WHERE id=${model.remoteId};`
    );
    statements.push(`DELETE FROM model_3d_categories WHERE model_id=${model.remoteId};`);
    for (const relation of model.categories) {
      statements.push(
        `INSERT INTO model_3d_categories (model_id,category_id,is_primary) ` +
        `SELECT ${model.remoteId},id,${relation.is_primary ? 1 : 0} FROM categories ` +
        `WHERE slug=${sqlString(relation.slug)} AND resource_type='3d-models';`
      );
    }
  }
  return `${statements.join('\n')}\n`;
}

async function main() {
  await fsp.mkdir(outputDir, { recursive: true });
  const [localRows, localRelations, remoteRows, remoteRelations] = await Promise.all([
    localQuery(`SELECT id,name,slug,category,description,tags,file_url,image_url,texture_url,status ` +
      `FROM models_3d WHERE id>=2 ORDER BY id`),
    localQuery(`SELECT m.slug,c.slug AS category_slug,mc.is_primary FROM models_3d m ` +
      `JOIN model_3d_categories mc ON mc.model_id=m.id JOIN categories c ON c.id=mc.category_id ` +
      `WHERE m.id>=2 ORDER BY m.id,mc.is_primary DESC,c.slug`),
    remoteQuery(`SELECT id,name,slug,category,description,tags,file_url,image_url,texture_url,status ` +
      `FROM models_3d ORDER BY id`),
    remoteQuery(`SELECT mc.model_id,c.slug AS category_slug,mc.is_primary FROM model_3d_categories mc ` +
      `JOIN categories c ON c.id=mc.category_id ORDER BY mc.model_id,mc.is_primary DESC,c.slug`),
  ]);
  if (localRows.length !== 122) throw new Error(`Expected 122 local production models, found ${localRows.length}`);
  if (remoteRows.length !== 125) throw new Error(`Expected 125 remote models, found ${remoteRows.length}`);
  await fsp.writeFile(path.join(outputDir, 'd1-before.json'), `${JSON.stringify({ remoteRows, remoteRelations }, null, 2)}\n`);

  const localBySlug = new Map(localRows.map(row => [row.slug, row]));
  const remoteBySlug = new Map(remoteRows.map(row => [row.slug, row]));
  const localCategories = new Map();
  for (const relation of localRelations) {
    if (!localCategories.has(relation.slug)) localCategories.set(relation.slug, []);
    localCategories.get(relation.slug).push({ slug: relation.category_slug, is_primary: Boolean(relation.is_primary) });
  }
  const remoteCategories = new Map();
  for (const relation of remoteRelations) {
    if (!remoteCategories.has(relation.model_id)) remoteCategories.set(relation.model_id, []);
    remoteCategories.get(relation.model_id).push({ slug: relation.category_slug, is_primary: Boolean(relation.is_primary) });
  }

  const mapping = [];
  const usedRemoteIds = new Set();
  for (const local of localRows) {
    const matchingRemote = remoteBySlug.get(local.slug);
    const remoteId = matchingRemote ? matchingRemote.id : localOnlyTargetIds.get(local.slug);
    if (!remoteId) throw new Error(`No safe remote target for ${local.id}:${local.slug}`);
    if (usedRemoteIds.has(remoteId)) throw new Error(`Duplicate remote target ${remoteId}`);
    usedRemoteIds.add(remoteId);
    mapping.push({ remoteId, data: local, categories: localCategories.get(local.slug) || [], sourceKind: 'local' });
  }
  for (const remoteId of retainedRemoteIds) {
    const remote = remoteRows.find(row => row.id === remoteId);
    if (!remote) throw new Error(`Missing retained remote model ${remoteId}`);
    if (usedRemoteIds.has(remoteId)) throw new Error(`Retained remote target already used: ${remoteId}`);
    usedRemoteIds.add(remoteId);
    mapping.push({ remoteId, data: remote, categories: remoteCategories.get(remoteId) || [], sourceKind: 'remote' });
  }
  mapping.sort((a, b) => a.remoteId - b.remoteId);
  if (mapping.length !== 125 || usedRemoteIds.size !== 125 || mapping.some((entry, index) => entry.remoteId !== index + 1)) {
    throw new Error(`Unsafe full mapping: models=${mapping.length}, uniqueIds=${usedRemoteIds.size}`);
  }
  const mappedSlugs = new Set(mapping.map(entry => entry.data.slug));
  if (mappedSlugs.size !== 125) throw new Error(`Mapped slugs are not unique: ${mappedSlugs.size}`);

  const models = [];
  const assets = [];
  let prepared = 0;
  for (const entry of mapping) {
    const sources = entry.sourceKind === 'local'
      ? await localAssetSources(entry.data)
      : await remoteAssetSources(entry.data);
    const keys = {
      file_url: `catalog/${version}/glb/${entry.data.slug}.glb`,
      texture_url: `catalog/${version}/texture/${entry.data.slug}.svg`,
      image_url: `catalog/${version}/preview/${entry.data.slug}.webp`,
    };
    const urls = Object.fromEntries(Object.entries(keys).map(([field, key]) => [field, `${publicBaseUrl}/${key}`]));
    const sourceByField = { file_url: sources.file, texture_url: sources.texture, image_url: sources.image };
    for (const [field, source] of Object.entries(sourceByField)) {
      const stat = await fsp.stat(source);
      assets.push({
        remoteId: entry.remoteId,
        slug: entry.data.slug,
        field,
        source,
        sourceTier: sources.sourceTier,
        key: keys[field],
        url: urls[field],
        size: stat.size,
        contentType: field === 'file_url' ? 'model/gltf-binary' : field === 'texture_url' ? 'image/svg+xml; charset=utf-8' : 'image/webp',
      });
    }
    if (!entry.categories.length || !entry.categories.some(category => category.is_primary)) {
      throw new Error(`Missing primary category for ${entry.remoteId}:${entry.data.slug}`);
    }
    models.push({ ...entry, urls, sourceTier: sources.sourceTier });
    prepared += 1;
    if (prepared % 25 === 0 || prepared === mapping.length) console.log(`prepared ${prepared}/${mapping.length}`);
  }
  if (assets.length !== 375) throw new Error(`Expected 375 assets, found ${assets.length}`);

  const manifest = {
    createdAt: new Date().toISOString(),
    version,
    modelCount: models.length,
    assetCount: assets.length,
    totalBytes: assets.reduce((sum, asset) => sum + asset.size, 0),
    sourceTiers: models.reduce((counts, model) => {
      counts[model.sourceTier] = (counts[model.sourceTier] || 0) + 1;
      return counts;
    }, {}),
    replacements: models.filter(model => {
      const before = remoteRows.find(row => row.id === model.remoteId);
      return before.slug !== model.data.slug;
    }).map(model => ({ remoteId: model.remoteId, oldSlug: remoteRows.find(row => row.id === model.remoteId).slug, newSlug: model.data.slug })),
    models: models.map(model => ({
      remoteId: model.remoteId,
      slug: model.data.slug,
      sourceTier: model.sourceTier,
      categories: model.categories,
      urls: model.urls,
    })),
    assets,
  };
  const manifestPath = path.join(outputDir, 'publish-manifest.json');
  const sqlPath = path.join(outputDir, 'apply-remote.sql');
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fsp.writeFile(sqlPath, buildSql(models));
  console.log(JSON.stringify({
    mode: shouldUpload ? 'upload' : shouldVerify ? 'verify' : 'prepare',
    version,
    modelCount: manifest.modelCount,
    assetCount: manifest.assetCount,
    totalMiB: Number((manifest.totalBytes / 1048576).toFixed(2)),
    sourceTiers: manifest.sourceTiers,
    replacements: manifest.replacements,
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
    await mapConcurrent(assets, 6, async asset => {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: asset.key,
        Body: fs.createReadStream(asset.source),
        ContentType: asset.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      uploaded += 1;
      if (uploaded % 20 === 0 || uploaded === assets.length) console.log(`uploaded ${uploaded}/${assets.length}`);
    });
  }
  let verified = 0;
  await mapConcurrent(assets, 12, async asset => {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.key }));
    if (Number(head.ContentLength) !== asset.size) {
      throw new Error(`R2 size mismatch for ${asset.key}: ${head.ContentLength} !== ${asset.size}`);
    }
    verified += 1;
    if (verified % 50 === 0 || verified === assets.length) console.log(`verified ${verified}/${assets.length}`);
  });
  console.log(JSON.stringify({ uploaded: shouldUpload ? assets.length : 0, verified }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
