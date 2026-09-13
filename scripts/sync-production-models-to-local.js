#!/usr/bin/env node

require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { pipeline } = require('stream/promises');
const sqlite3 = require('sqlite3').verbose();

const root = path.resolve(__dirname, '..');
const databasePath = path.join(root, 'database.sqlite');
const apply = process.argv.includes('--apply');
const downloadAssets = process.argv.includes('--download-assets');
const concurrency = 10;

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function remoteQuery(sql) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${required(process.env.CF_ACCOUNT_ID, 'CF_ACCOUNT_ID')}` +
    `/d1/database/${required(process.env.D1_DATABASE_ID, 'D1_DATABASE_ID')}/query`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${required(process.env.CF_API_TOKEN, 'CF_API_TOKEN')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(120000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(payload.errors || payload)}`);
  }
  return payload.result[0].results;
}

function openDatabase() {
  return new sqlite3.Database(databasePath);
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function closeDatabase(db) {
  return new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
}

function assetName(rawUrl, extension) {
  const url = new URL(rawUrl);
  const filename = path.basename(decodeURIComponent(url.pathname));
  if (!filename.toLowerCase().endsWith(extension)) {
    throw new Error(`Unexpected ${extension} URL: ${rawUrl}`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(filename)) {
    throw new Error(`Unsafe asset filename: ${filename}`);
  }
  return filename;
}

async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

async function validateAsset(filePath, type) {
  const handle = await fsp.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (stat.size === 0) throw new Error(`Empty asset: ${filePath}`);
    const probe = Buffer.alloc(Math.min(4096, stat.size));
    await handle.read(probe, 0, probe.length, 0);
    if (type === 'glb' && probe.subarray(0, 4).toString('ascii') !== 'glTF') {
      throw new Error(`Invalid GLB header: ${filePath}`);
    }
    if (type === 'svg' && !probe.toString('utf8').toLowerCase().includes('<svg')) {
      throw new Error(`Invalid SVG document: ${filePath}`);
    }
    return stat.size;
  } finally {
    await handle.close();
  }
}

async function downloadAsset(asset, stagingDir) {
  const destination = path.join(stagingDir, asset.type, asset.filename);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  try {
    const size = await validateAsset(destination, asset.type);
    return { ...asset, stagingPath: destination, size, sha256: await sha256(destination), reused: true };
  } catch {
    // Missing and partial files are replaced by a fresh production download.
  }
  const response = await fetch(asset.url, { signal: AbortSignal.timeout(900000) });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}) ${asset.url}`);
  }
  await pipeline(response.body, fs.createWriteStream(destination));
  const size = await validateAsset(destination, asset.type);
  return { ...asset, stagingPath: destination, size, sha256: await sha256(destination), reused: false };
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function installAssets(downloadedAssets, backupDir) {
  let installed = 0;
  for (const asset of downloadedAssets) {
    const folder = asset.type === 'glb' ? 'glb' : 'texture';
    const destination = path.join(root, 'public', 'uploads', folder, asset.filename);
    try {
      const stat = await fsp.stat(destination);
      if (stat.isFile()) {
        const backupPath = path.join(backupDir, 'replaced-assets', folder, asset.filename);
        await fsp.mkdir(path.dirname(backupPath), { recursive: true });
        await fsp.copyFile(destination, backupPath);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.production-sync.tmp`;
    await fsp.copyFile(asset.stagingPath, temporary);
    await fsp.rename(temporary, destination);
    installed += 1;
    if (installed % 50 === 0 || installed === downloadedAssets.length) {
      console.log(`installed assets ${installed}/${downloadedAssets.length}`);
    }
  }
}

async function syncDatabase(data, localAssetUrls, backupDir) {
  const db = openDatabase();
  try {
    await dbRun(db, `VACUUM INTO ${sqlString(path.join(backupDir, 'database.sqlite'))}`);
    const localModels = await dbAll(db, 'SELECT id,slug FROM models_3d');
    const productionSlugs = new Set(data.models.map(model => model.slug));
    const localOnly = localModels.filter(model => !productionSlugs.has(model.slug));
    for (const model of localOnly) {
      const dependencies = await dbAll(db,
        `SELECT
          (SELECT COUNT(*) FROM on_model_mockup_profiles WHERE model_id=?) AS profiles,
          (SELECT COUNT(*) FROM on_model_mockup_assets WHERE model_id=?) AS assets`,
        [model.id, model.id]
      );
      if (dependencies[0].profiles || dependencies[0].assets) {
        throw new Error(`Refusing to remove local-only model with try-on data: ${model.slug}`);
      }
    }

    await dbRun(db, 'BEGIN IMMEDIATE');
    try {
      for (const category of data.categories) {
        const existing = await dbAll(db,
          "SELECT id FROM categories WHERE slug=? AND resource_type='3d-models'",
          [category.slug]
        );
        const values = [category.name, category.description, category.meta_title,
          category.meta_description, category.sort_order, category.status,
          category.created_at, category.updated_at, category.landing_content];
        if (existing.length) {
          await dbRun(db,
            `UPDATE categories SET name=?,description=?,meta_title=?,meta_description=?,sort_order=?,status=?,
              created_at=?,updated_at=?,landing_content=? WHERE id=?`,
            [...values, existing[0].id]
          );
        } else {
          await dbRun(db,
            `INSERT INTO categories
             (name,slug,resource_type,description,meta_title,meta_description,sort_order,status,created_at,updated_at,landing_content)
             VALUES (?,?,'3d-models',?,?,?,?,?,?,?,?)`,
            [category.name, category.slug, category.description, category.meta_title,
              category.meta_description, category.sort_order, category.status,
              category.created_at, category.updated_at, category.landing_content]
          );
        }
      }

      for (const model of data.models) {
        const existing = await dbAll(db, 'SELECT id FROM models_3d WHERE slug=?', [model.slug]);
        const assetUrls = localAssetUrls.get(model.slug);
        const values = [model.name, model.category, model.description, model.tags, model.image_url,
          assetUrls.file_url, assetUrls.texture_url, model.status,
          model.created_at, model.updated_at, model.slug];
        if (existing.length) {
          await dbRun(db,
            `UPDATE models_3d SET name=?,category=?,description=?,tags=?,image_url=?,file_url=?,texture_url=?,
              status=?,created_at=?,updated_at=? WHERE slug=?`,
            values
          );
        } else {
          await dbRun(db,
            `INSERT INTO models_3d
              (name,category,description,tags,image_url,file_url,texture_url,status,created_at,updated_at,slug)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            values
          );
        }
      }

      for (const model of localOnly) {
        await dbRun(db, 'DELETE FROM model_3d_categories WHERE model_id=?', [model.id]);
        await dbRun(db, 'DELETE FROM model_3d_slug_redirects WHERE model_id=?', [model.id]);
        await dbRun(db, 'DELETE FROM models_3d WHERE id=?', [model.id]);
      }

      const onlineCategorySlugs = new Set(data.categories.map(category => category.slug));
      const local3dCategories = await dbAll(db, "SELECT id,slug FROM categories WHERE resource_type='3d-models'");
      for (const category of local3dCategories) {
        if (!onlineCategorySlugs.has(category.slug)) {
          await dbRun(db, 'DELETE FROM model_3d_categories WHERE category_id=?', [category.id]);
          await dbRun(db, 'DELETE FROM categories WHERE id=?', [category.id]);
        }
      }

      await dbRun(db, 'DELETE FROM model_3d_categories');
      for (const relation of data.relations) {
        await dbRun(db,
          `INSERT INTO model_3d_categories (model_id,category_id,is_primary,created_at)
           SELECT m.id,c.id,?,? FROM models_3d m,categories c
           WHERE m.slug=? AND c.slug=? AND c.resource_type='3d-models'`,
          [relation.is_primary, relation.created_at, relation.model_slug, relation.category_slug]
        );
      }

      await dbRun(db, 'DELETE FROM model_3d_slug_redirects');
      for (const redirect of data.redirects) {
        await dbRun(db,
          `INSERT INTO model_3d_slug_redirects (old_slug,model_id,created_at)
           SELECT ?,id,? FROM models_3d WHERE slug=?`,
          [redirect.old_slug, redirect.created_at, redirect.model_slug]
        );
      }
      await dbRun(db, 'COMMIT');
    } catch (error) {
      await dbRun(db, 'ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    await closeDatabase(db);
  }
}

async function loadProductionData() {
  const [models, categories, relations, redirects] = await Promise.all([
    remoteQuery('SELECT id,name,category,description,tags,image_url,file_url,texture_url,status,created_at,updated_at,slug FROM models_3d ORDER BY id'),
    remoteQuery("SELECT id,name,slug,description,meta_title,meta_description,sort_order,status,created_at,updated_at,landing_content FROM categories WHERE resource_type='3d-models' ORDER BY id"),
    remoteQuery(`SELECT m.slug AS model_slug,c.slug AS category_slug,mc.is_primary,mc.created_at
      FROM model_3d_categories mc JOIN models_3d m ON m.id=mc.model_id
      JOIN categories c ON c.id=mc.category_id ORDER BY m.id,mc.is_primary DESC,c.id`),
    remoteQuery(`SELECT r.old_slug,m.slug AS model_slug,r.created_at FROM model_3d_slug_redirects r
      JOIN models_3d m ON m.id=r.model_id ORDER BY r.old_slug`),
  ]);
  if (models.length !== 125) throw new Error(`Expected 125 production models, found ${models.length}`);
  if (categories.length !== 25) throw new Error(`Expected 25 production categories, found ${categories.length}`);
  if (relations.length !== 151) throw new Error(`Expected 151 production relations, found ${relations.length}`);
  if (redirects.length !== 158) throw new Error(`Expected 158 production redirects, found ${redirects.length}`);
  return { models, categories, relations, redirects };
}

async function main() {
  const data = await loadProductionData();
  const assets = [];
  const localAssetUrls = new Map();
  const filenames = new Set();
  for (const model of data.models) {
    const glb = assetName(model.file_url, '.glb');
    const svg = assetName(model.texture_url, '.svg');
    for (const key of [`glb/${glb}`, `svg/${svg}`]) {
      if (filenames.has(key)) throw new Error(`Duplicate production asset filename: ${key}`);
      filenames.add(key);
    }
    assets.push({ slug: model.slug, type: 'glb', filename: glb, url: model.file_url });
    assets.push({ slug: model.slug, type: 'svg', filename: svg, url: model.texture_url });
    localAssetUrls.set(model.slug, downloadAssets ? {
      file_url: `/uploads/glb/${encodeURIComponent(glb)}`,
      texture_url: `/uploads/texture/${encodeURIComponent(svg)}`,
    } : {
      file_url: model.file_url,
      texture_url: model.texture_url,
    });
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    assetMode: downloadAssets ? 'local-mirror' : 'production-cdn',
    models: data.models.length,
    categories: data.categories.length,
    relations: data.relations.length,
    redirects: data.redirects.length,
    assets: assets.length,
  }, null, 2));
  if (!apply) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(root, 'artifacts', 'backups', `production-model-sync-${timestamp}`);
  await fsp.mkdir(backupDir, { recursive: true });
  await fsp.writeFile(path.join(backupDir, 'production-data.json'), `${JSON.stringify(data, null, 2)}\n`);
  if (downloadAssets) {
    const stagingDir = path.join(root, 'artifacts', 'sync-staging', 'production-models');
    const downloaded = await mapConcurrent(assets, concurrency, async (asset, index) => {
      const result = await downloadAsset(asset, stagingDir);
      const completed = index + 1;
      if (completed % 25 === 0 || completed === assets.length) {
        console.log(`downloaded assets ${completed}/${assets.length}`);
      }
      return result;
    });
    await fsp.writeFile(path.join(backupDir, 'asset-manifest.json'), `${JSON.stringify(downloaded.map(asset => ({
      slug: asset.slug,
      type: asset.type,
      filename: asset.filename,
      sourceUrl: asset.url,
      size: asset.size,
      sha256: asset.sha256,
    })), null, 2)}\n`);
    await installAssets(downloaded, backupDir);
  }
  await syncDatabase(data, localAssetUrls, backupDir);

  const db = openDatabase();
  try {
    const counts = await dbAll(db, `SELECT
      (SELECT COUNT(*) FROM models_3d) AS models,
      (SELECT COUNT(*) FROM categories WHERE resource_type='3d-models') AS categories,
      (SELECT COUNT(*) FROM model_3d_categories) AS relations,
      (SELECT COUNT(*) FROM model_3d_slug_redirects) AS redirects,
      (SELECT COUNT(*) FROM models_3d WHERE file_url LIKE '/uploads/glb/%') AS local_glb,
      (SELECT COUNT(*) FROM models_3d WHERE texture_url LIKE '/uploads/texture/%') AS local_svg`);
    console.log(JSON.stringify({ synced: counts[0], backupDir }, null, 2));
  } finally {
    await closeDatabase(db);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
