#!/usr/bin/env node

require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const root = path.resolve(__dirname, '..');
const libraryDir = path.join(root, '已验收通过');
const catalogPath = path.join(libraryDir, 'catalog.json');
const sourceMapPath = path.join(libraryDir, 'source-map.json');
const version = '20260912-approved-v1';
const outputDir = path.join(root, 'artifacts', 'deployments', `catalog-${version}`);
const manifestPath = path.join(outputDir, 'publish-manifest.json');
const sqlPath = path.join(outputDir, 'apply-remote.sql');
const beforePath = path.join(outputDir, 'd1-before.json');
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const bucket = process.env.R2_BUCKET || 'clothing-design';
const args = new Set(process.argv.slice(2));
const shouldPublish = args.has('--publish');
const shouldUpload = shouldPublish || args.has('--upload');
const shouldApply = shouldPublish || args.has('--apply');
const shouldVerifyOnline = shouldPublish || shouldApply || args.has('--verify-online');
const shouldUploadSvgOnly = args.has('--svg-only');

const categorySlugByName = {
  'T-shirt': 't-shirt-mockup',
  Shirt: 'shirt',
  Pants: 'pants',
  Jacket: 'jacket',
  Hoodie: 'hoodie-mockup',
  Dress: 'dress',
  Underwear: 'underwear',
  Skirt: 'skirt',
  Blazer: 'blazer',
  Coat: 'coat',
  Hat: 'hat',
  Top: 'top',
};

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stableSlug(model) {
  const base = slugify(model.name);
  if (!base) throw new Error(`Cannot create slug for ${model.id}`);
  return `${base}-3d-model-${model.id}`;
}

function buildDescription(model) {
  const kind = model.subcategory ? `${model.subcategory} ${model.category}` : model.category;
  return `${model.name} is an approved ${kind} 3D clothing model with a matching packed UV SVG. ` +
    'Use the browser-ready GLB and aligned UV layout for apparel mockups, colorway exploration, artwork placement, ecommerce previews, and design review.';
}

function buildTags(model) {
  return Array.from(new Set([
    model.name,
    model.category,
    model.subcategory,
    '3D clothing model',
    'apparel mockup',
    'GLB model',
    'UV pattern SVG',
    'packed UV',
  ].filter(Boolean))).join(', ');
}

function contentType(field) {
  if (field === 'file_url') return 'model/gltf-binary';
  if (field === 'texture_url') return 'image/svg+xml; charset=utf-8';
  return 'image/webp';
}

function normalizeSvgCanvas(svgText) {
  const svgTag = svgText.match(/<svg\b[^>]*>/i)?.[0];
  if (!svgTag) throw new Error('SVG root element is missing');
  const hasWidth = /\swidth=["'][^"']+["']/i.test(svgTag);
  const hasHeight = /\sheight=["'][^"']+["']/i.test(svgTag);
  const viewBoxMatch = svgTag.match(/\sviewBox=["']([^"']+)["']/i);
  const parts = viewBoxMatch?.[1]?.trim().split(/[\s,]+/).map(Number) || [];
  let width = 1024;
  let height = 1024;
  if (parts.length >= 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
    const aspectRatio = parts[2] / parts[3];
    if (aspectRatio >= 1) height = Math.max(1, Math.round(1024 / aspectRatio));
    else width = Math.max(1, Math.round(1024 * aspectRatio));
  }
  const dimensions = [
    hasWidth ? '' : ` width="${width}"`,
    hasHeight ? '' : ` height="${height}"`,
  ].join('');
  const unlockedStyles = svgText.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (styleBlock, openTag, cssText, closeTag) => {
      const unlockedCss = cssText.replace(
        /(\.uv-boundary\s*\{)([^}]*)(\})/gi,
        (rule, selector, declarations, ruleEnd) => {
          const unlockedDeclarations = declarations.replace(/(?:^|;)\s*fill\s*:\s*none\s*;?/gi, ';');
          return `${selector}${unlockedDeclarations.replace(/^;+|;+$/g, '')}${ruleEnd}`;
        }
      );
      return `${openTag}${unlockedCss}${closeTag}`;
    }
  );
  const defaultTransparentFaces = unlockedStyles.replace(
    /<(path|polygon|rect|circle|ellipse)\b([^>]*)>/gi,
    (element, tagName, attributes) => {
      const classMatch = attributes.match(/\bclass\s*=\s*(["'])(.*?)\1/i);
      const classNames = classMatch?.[2]?.trim().split(/\s+/) || [];
      if (!classNames.includes('uv-boundary') || /\bfill\s*=\s*["']/i.test(attributes)) return element;
      return `<${tagName} fill="none"${attributes}>`;
    }
  );
  const dimensionedSvg = dimensions
    ? defaultTransparentFaces.replace(/<svg\b/i, `<svg${dimensions}`)
    : defaultTransparentFaces;
  const interactionStyle = '<style data-editor-canvas-compat="true">' +
    '.texture-template-path,.texture-template-fill{' +
    'animation:none!important;transition:none!important}' +
    '.texture-template-path.hover-template-path,.texture-template-path.selected-template-path{' +
    'vector-effect:non-scaling-stroke}' +
    '</style>';
  return dimensionedSvg.replace(/(<svg\b[^>]*>)/i, `$1${interactionStyle}`);
}

async function publishedBody(asset) {
  if (asset.field !== 'texture_url') return fs.createReadStream(asset.source);
  const svgText = await fsp.readFile(asset.source, 'utf8');
  return Buffer.from(normalizeSvgCanvas(svgText), 'utf8');
}

async function mapConcurrent(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', chunk => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function validateMagic(asset) {
  const handle = await fsp.open(asset.source, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(asset.size, 512));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);
    if (asset.field === 'file_url' && header.subarray(0, 4).toString('ascii') !== 'glTF') {
      throw new Error(`Invalid GLB header: ${asset.source}`);
    }
    if (asset.field === 'image_url' &&
        (header.subarray(0, 4).toString('ascii') !== 'RIFF' || header.subarray(8, 12).toString('ascii') !== 'WEBP')) {
      throw new Error(`Invalid WebP header: ${asset.source}`);
    }
    if (asset.field === 'texture_url' && !header.toString('utf8').includes('<svg')) {
      throw new Error(`Invalid SVG header: ${asset.source}`);
    }
  } finally {
    await handle.close();
  }
}

async function remoteQuery(sql, params = []) {
  const accountId = required(process.env.CF_ACCOUNT_ID, 'CF_ACCOUNT_ID');
  const databaseId = required(process.env.D1_DATABASE_ID, 'D1_DATABASE_ID');
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${required(process.env.CF_API_TOKEN, 'CF_API_TOKEN')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    }
  );
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(payload.errors || payload)}`);
  }
  return payload.result[0].results;
}

function buildSql(models) {
  const statements = [];
  for (const model of models) {
    statements.push(
      `INSERT INTO models_3d (name,slug,category,description,tags,file_url,image_url,texture_url,status) ` +
      `SELECT ${sqlString(model.name)},${sqlString(model.slug)},${sqlString(model.category)},` +
      `${sqlString(model.description)},${sqlString(model.tags)},${sqlString(model.urls.file_url)},` +
      `${sqlString(model.urls.image_url)},${sqlString(model.urls.texture_url)},'active' ` +
      `WHERE NOT EXISTS (SELECT 1 FROM models_3d WHERE slug=${sqlString(model.slug)});`
    );
    statements.push(
      `UPDATE models_3d SET name=${sqlString(model.name)},category=${sqlString(model.category)},` +
      `description=${sqlString(model.description)},tags=${sqlString(model.tags)},` +
      `file_url=${sqlString(model.urls.file_url)},image_url=${sqlString(model.urls.image_url)},` +
      `texture_url=${sqlString(model.urls.texture_url)},status='active',updated_at=CURRENT_TIMESTAMP ` +
      `WHERE slug=${sqlString(model.slug)};`
    );
    statements.push(
      `DELETE FROM model_3d_categories WHERE model_id IN ` +
      `(SELECT id FROM models_3d WHERE slug=${sqlString(model.slug)});`
    );
    statements.push(
      `INSERT INTO model_3d_categories (model_id,category_id,is_primary) ` +
      `SELECT m.id,c.id,1 FROM models_3d m,categories c ` +
      `WHERE m.slug=${sqlString(model.slug)} AND c.slug=${sqlString(model.categorySlug)} ` +
      `AND c.resource_type='3d-models' AND c.status='active';`
    );
  }
  return `${statements.join('\n')}\n`;
}

async function prepare() {
  const catalog = JSON.parse(await fsp.readFile(catalogPath, 'utf8'));
  const sourceMap = JSON.parse(await fsp.readFile(sourceMapPath, 'utf8'));
  if (!Array.isArray(catalog.models) || catalog.models.length !== 261) {
    throw new Error(`Expected 261 catalog models, found ${catalog.models?.length}`);
  }
  if (catalog.summary?.verifiedHashes !== true || catalog.summary?.copiedFiles !== 783) {
    throw new Error('Catalog does not report a verified 783-file acceptance snapshot');
  }

  const expectedHashByRelativePath = new Map();
  for (const item of sourceMap) {
    const normalized = String(item.output).replace(/\\/g, '/');
    const marker = '/已验收通过/';
    const markerIndex = normalized.lastIndexOf(marker);
    if (markerIndex < 0) throw new Error(`Invalid source-map output: ${item.output}`);
    expectedHashByRelativePath.set(normalized.slice(markerIndex + marker.length), item.sha256);
  }
  if (expectedHashByRelativePath.size !== 783) {
    throw new Error(`Expected 783 source hashes, found ${expectedHashByRelativePath.size}`);
  }

  const modelIds = new Set();
  const slugs = new Set();
  const models = [];
  const assets = [];
  for (const sourceModel of catalog.models) {
    if (sourceModel.acceptanceStatus !== 'passed') throw new Error(`Model is not approved: ${sourceModel.id}`);
    if (modelIds.has(sourceModel.id)) throw new Error(`Duplicate approved model ID: ${sourceModel.id}`);
    modelIds.add(sourceModel.id);
    const slug = stableSlug(sourceModel);
    if (slugs.has(slug)) throw new Error(`Duplicate generated slug: ${slug}`);
    slugs.add(slug);
    const categorySlug = categorySlugByName[sourceModel.category];
    if (!categorySlug) throw new Error(`No online category mapping for ${sourceModel.category}`);
    const sourceByField = {
      file_url: path.join(libraryDir, sourceModel.files.glb),
      texture_url: path.join(libraryDir, sourceModel.files.svg),
      image_url: path.join(libraryDir, sourceModel.files.cover),
    };
    const relativeByField = {
      file_url: sourceModel.files.glb,
      texture_url: sourceModel.files.svg,
      image_url: sourceModel.files.cover,
    };
    const keys = {
      file_url: `catalog/${version}/glb/${slug}.glb`,
      texture_url: `catalog/${version}/texture-canvas-1024-v4/${slug}.svg`,
      image_url: `catalog/${version}/preview/${slug}.webp`,
    };
    const urls = Object.fromEntries(Object.entries(keys).map(([field, key]) => [field, `${publicBaseUrl}/${key}`]));
    for (const field of Object.keys(sourceByField)) {
      const stat = await fsp.stat(sourceByField[field]);
      if (!stat.isFile() || stat.size <= 0) throw new Error(`Missing asset: ${sourceByField[field]}`);
      const expectedSha256 = expectedHashByRelativePath.get(relativeByField[field]);
      if (!expectedSha256) throw new Error(`Missing accepted hash: ${relativeByField[field]}`);
      assets.push({
        modelId: sourceModel.id,
        slug,
        field,
        source: sourceByField[field],
        relativeSource: relativeByField[field],
        key: keys[field],
        url: urls[field],
        size: stat.size,
        contentType: contentType(field),
        sha256: expectedSha256,
      });
    }
    models.push({
      sourceId: sourceModel.id,
      name: sourceModel.name,
      slug,
      category: sourceModel.category,
      subcategory: sourceModel.subcategory || null,
      categorySlug,
      variant: sourceModel.variant,
      uvKind: sourceModel.uvKind,
      acceptedAt: sourceModel.acceptedAt,
      description: buildDescription(sourceModel),
      tags: buildTags(sourceModel),
      urls,
    });
  }

  console.log(`Validating ${assets.length} approved asset files and hashes...`);
  let validated = 0;
  await mapConcurrent(assets, 6, async asset => {
    await validateMagic(asset);
    const actualHash = await sha256(asset.source);
    if (actualHash !== asset.sha256) throw new Error(`Accepted hash mismatch: ${asset.relativeSource}`);
    validated += 1;
    if (validated % 75 === 0 || validated === assets.length) console.log(`validated ${validated}/${assets.length}`);
  });

  await mapConcurrent(assets, 12, async asset => {
    if (asset.field === 'texture_url') {
      const body = await publishedBody(asset);
      asset.publishedSize = body.length;
      asset.publishedSha256 = crypto.createHash('sha256').update(body).digest('hex');
    } else {
      asset.publishedSize = asset.size;
      asset.publishedSha256 = asset.sha256;
    }
  });

  const [remoteModels, remoteCategories, remoteRelations] = await Promise.all([
    remoteQuery('SELECT id,name,slug,category,file_url,image_url,texture_url,status FROM models_3d ORDER BY id'),
    remoteQuery("SELECT id,name,slug,status FROM categories WHERE resource_type='3d-models' ORDER BY id"),
    remoteQuery('SELECT model_id,category_id,is_primary FROM model_3d_categories ORDER BY model_id,category_id'),
  ]);
  const activeCategorySlugs = new Set(remoteCategories.filter(row => row.status === 'active').map(row => row.slug));
  for (const categorySlug of new Set(models.map(model => model.categorySlug))) {
    if (!activeCategorySlugs.has(categorySlug)) throw new Error(`Required online category is missing or inactive: ${categorySlug}`);
  }
  const incomingSlugs = new Set(models.map(model => model.slug));
  const existingMatches = remoteModels.filter(model => incomingSlugs.has(model.slug));

  await fsp.mkdir(outputDir, { recursive: true });
  await fsp.writeFile(beforePath, `${JSON.stringify({ remoteModels, remoteCategories, remoteRelations }, null, 2)}\n`);
  const manifest = {
    createdAt: new Date().toISOString(),
    version,
    acceptanceSnapshotAt: catalog.summary.snapshotAt,
    modelCount: models.length,
    assetCount: assets.length,
    totalBytes: assets.reduce((sum, asset) => sum + asset.publishedSize, 0),
    onlineBefore: remoteModels.length,
    insertCount: models.length - existingMatches.length,
    updateCount: existingMatches.length,
    models,
    assets,
  };
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fsp.writeFile(sqlPath, buildSql(models));
  console.log(JSON.stringify({
    mode: shouldPublish ? 'publish' : shouldUpload ? 'upload' : shouldApply ? 'apply' : 'prepare',
    version,
    modelCount: models.length,
    assetCount: assets.length,
    totalMiB: Number((manifest.totalBytes / 1048576).toFixed(2)),
    onlineBefore: manifest.onlineBefore,
    insertCount: manifest.insertCount,
    updateCount: manifest.updateCount,
    manifestPath,
    sqlPath,
    beforePath,
  }, null, 2));
  return manifest;
}

function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${required(accountId, 'R2_ACCOUNT_ID or CF_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required(process.env.R2_ACCESS_KEY_ID, 'R2_ACCESS_KEY_ID'),
      secretAccessKey: required(process.env.R2_SECRET_ACCESS_KEY, 'R2_SECRET_ACCESS_KEY'),
    },
  });
}

async function uploadAndVerify(assets) {
  const client = r2Client();
  let uploaded = 0;
  await mapConcurrent(assets, 5, async asset => {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: asset.key,
      Body: await publishedBody(asset),
      ContentType: asset.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: { sha256: asset.publishedSha256 },
    }));
    uploaded += 1;
    if (uploaded % 30 === 0 || uploaded === assets.length) console.log(`uploaded ${uploaded}/${assets.length}`);
  });
  let verified = 0;
  await mapConcurrent(assets, 12, async asset => {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.key }));
    if (Number(head.ContentLength) !== asset.publishedSize) {
      throw new Error(`R2 size mismatch for ${asset.key}: ${head.ContentLength} !== ${asset.publishedSize}`);
    }
    if (head.Metadata?.sha256 !== asset.publishedSha256) throw new Error(`R2 hash metadata mismatch for ${asset.key}`);
    verified += 1;
    if (verified % 75 === 0 || verified === assets.length) console.log(`verified ${verified}/${assets.length}`);
  });
}

function applyRemoteSql() {
  console.log('Applying approved model rows to production D1...');
  const npmCacheDir = path.join(root, '.codex-tools', 'wrangler-npx-cache');
  fs.mkdirSync(npmCacheDir, { recursive: true });
  const result = spawnSync(
    'npx',
    ['--yes', 'wrangler', 'd1', 'execute', 'clothing-design', '--remote', `--file=${sqlPath}`, '--config=wrangler.toml'],
    { cwd: root, env: { ...process.env, npm_config_cache: npmCacheDir }, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler D1 apply failed with exit code ${result.status}`);
}

async function verifyOnline(manifest) {
  const [rows, relations] = await Promise.all([
    remoteQuery('SELECT id,name,slug,category,file_url,image_url,texture_url,status FROM models_3d ORDER BY id'),
    remoteQuery(
      `SELECT m.slug,c.slug AS category_slug,mc.is_primary FROM models_3d m ` +
      `JOIN model_3d_categories mc ON mc.model_id=m.id ` +
      `JOIN categories c ON c.id=mc.category_id ORDER BY m.id,c.id`
    ),
  ]);
  const expectedBySlug = new Map(manifest.models.map(model => [model.slug, model]));
  const published = rows.filter(row => expectedBySlug.has(row.slug));
  if (published.length !== manifest.modelCount) {
    throw new Error(`Expected ${manifest.modelCount} published approved models, found ${published.length}`);
  }
  for (const row of published) {
    const expected = expectedBySlug.get(row.slug);
    if (row.status !== 'active' || row.category !== expected.category ||
        row.file_url !== expected.urls.file_url || row.image_url !== expected.urls.image_url ||
        row.texture_url !== expected.urls.texture_url) {
      throw new Error(`Production row mismatch: ${row.slug}`);
    }
  }
  const publishedRelations = relations.filter(row => expectedBySlug.has(row.slug));
  if (publishedRelations.length !== manifest.modelCount) {
    throw new Error(`Expected ${manifest.modelCount} category relations, found ${publishedRelations.length}`);
  }
  for (const relation of publishedRelations) {
    const expected = expectedBySlug.get(relation.slug);
    if (relation.category_slug !== expected.categorySlug || Number(relation.is_primary) !== 1) {
      throw new Error(`Production category relation mismatch: ${relation.slug}`);
    }
  }
  console.log(JSON.stringify({
    publishedModels: published.length,
    publishedRelations: publishedRelations.length,
    productionModelTotal: rows.length,
    expectedProductionTotal: manifest.onlineBefore + manifest.insertCount,
  }, null, 2));
  if (rows.length !== manifest.onlineBefore + manifest.insertCount) {
    throw new Error(`Unexpected production model total: ${rows.length}`);
  }
}

async function main() {
  const manifest = await prepare();
  const uploadAssets = shouldUploadSvgOnly
    ? manifest.assets.filter(asset => asset.field === 'texture_url')
    : manifest.assets;
  if (shouldUpload) await uploadAndVerify(uploadAssets);
  if (shouldApply) applyRemoteSql();
  if (shouldVerifyOnline) await verifyOnline(manifest);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { normalizeSvgCanvas };
