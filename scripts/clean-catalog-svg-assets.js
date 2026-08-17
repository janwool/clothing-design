#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const projectRoot = path.resolve(__dirname, '..');
const version = process.env.SVG_CLEAN_VERSION || '20260817-svg-clean-v2';
const deploymentDir = path.join(projectRoot, 'artifacts', 'deployments', `catalog-${version}`);
const textureDir = path.join(deploymentDir, 'texture');
const manifestPath = path.join(deploymentDir, 'manifest.json');
const sqlPath = path.join(deploymentDir, 'apply-remote.sql');
const keyPrefix = `catalog/${version}/texture`;
const glbKeyPrefix = `catalog/${version}/glb`;
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const bucket = process.env.R2_BUCKET || 'clothing-design';
const accountId = process.env.R2_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const shouldUpload = process.argv.includes('--upload');
const reuseExisting = process.argv.includes('--reuse');
const minArea = Number(process.env.SVG_MIN_AREA || 50);
const minSpan = Number(process.env.SVG_MIN_SPAN || 1.5);
const concurrency = Math.max(1, Number(process.env.SVG_CLEAN_CONCURRENCY || 8));

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function queryRemoteModels() {
  const sql = `SELECT id,slug,category,file_url,texture_url FROM models_3d WHERE status='active' ORDER BY id ASC`;
  const env = {
    ...process.env,
    CF_API_TOKEN: '',
    CF_ACCOUNT_ID: '',
    CLOUDFLARE_API_TOKEN: '',
    CLOUDFLARE_ACCOUNT_ID: '',
  };
  const result = spawnSync(
    'npx',
    ['--yes', 'wrangler@4.123.0', 'd1', 'execute', 'clothing-design', '--remote', '--command', sql, '--json'],
    { cwd: projectRoot, env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  if (result.status !== 0) throw new Error(result.stderr || `wrangler exited with ${result.status}`);
  const payload = JSON.parse(result.stdout);
  return payload[0]?.results || [];
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'cloz-svg-cleaner/1.0' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError}`);
}

function parsePath(raw, d) {
  const numbers = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
  const points = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push([numbers[index], numbers[index + 1]]);
  }
  if (points.length < 3) {
    return { raw, d, area: 0, width: 0, height: 0, span: 0, perimeter: 0, effectiveThickness: 0, closed: false };
  }
  let cross = 0;
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    cross += points[index][0] * points[next][1] - points[next][0] * points[index][1];
    perimeter += Math.hypot(
      points[next][0] - points[index][0],
      points[next][1] - points[index][1]
    );
  }
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const first = points[0];
  const last = points.at(-1);
  const closed = /z\s*$/i.test(d) || Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.75;
  const area = Math.abs(cross) / 2;
  const effectiveThickness = perimeter > 0 ? (2 * area) / perimeter : 0;
  return {
    raw,
    d,
    area,
    width,
    height,
    span: Math.min(width, height),
    perimeter,
    effectiveThickness,
    closed,
  };
}

function cleanSvg(svgText) {
  const matches = [...svgText.matchAll(/(<path\b[^>]*\bd="([^"]+)"[^>]*\/?>)/gi)];
  if (!matches.length) throw new Error('SVG contains no path elements');
  const paths = matches.map(match => parsePath(match[1], match[2]));
  const maxArea = Math.max(...paths.map(item => item.area));
  const useAbsoluteThreshold = maxArea >= minArea;
  const effectiveMinArea = useAbsoluteThreshold ? minArea : Math.max(0.05, maxArea * 0.01);
  const effectiveMinSpan = useAbsoluteThreshold ? minSpan : 0.1;
  let kept = paths.filter(item => (
    item.closed
    && item.area >= effectiveMinArea
    && item.span >= effectiveMinSpan
    && item.effectiveThickness >= effectiveMinSpan
  ));
  if (!kept.length) {
    kept = paths.filter(item => item.closed && item.area > 0).sort((left, right) => right.area - left.area).slice(0, 1);
  }
  kept.sort((left, right) => right.area - left.area);
  const output = [
    '<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">',
    '  <g fill="none" stroke="#111" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">',
    ...kept.map(item => `    ${item.raw}`),
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
  return {
    output,
    inputPaths: paths.length,
    outputPaths: kept.length,
    removedPaths: paths.length - kept.length,
    removedTiny: paths.filter(item => item.area < effectiveMinArea).length,
    removedThin: paths.filter(item => (
      item.span < effectiveMinSpan || item.effectiveThickness < effectiveMinSpan
    )).length,
    removedOpen: paths.filter(item => !item.closed).length,
    effectiveMinArea,
    effectiveMinSpan,
    maxArea,
    fallbackThreshold: !useAbsoluteThreshold,
  };
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

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  await fsp.mkdir(textureDir, { recursive: true });
  const rows = queryRemoteModels();
  if (rows.length !== 124) throw new Error(`Expected 124 active models, found ${rows.length}`);

  const models = await mapWithConcurrency(rows, concurrency, async row => {
    const filename = `${row.slug}.svg`;
    const outputPath = path.join(textureDir, filename);
    let cleaned;
    if (reuseExisting) {
      const source = await fsp.readFile(outputPath, 'utf8');
      cleaned = cleanSvg(source);
      if (cleaned.output !== source) await fsp.writeFile(outputPath, cleaned.output);
    } else {
      const source = await fetchText(row.texture_url);
      cleaned = cleanSvg(source);
      await fsp.writeFile(outputPath, cleaned.output);
    }
    const stat = await fsp.stat(outputPath);
    const key = `${keyPrefix}/${filename}`;
    const glbSource = path.join(deploymentDir, 'glb', `${row.slug}.glb`);
    const hasReplacementGlb = await fsp.access(glbSource).then(() => true, () => false);
    const glbKey = hasReplacementGlb ? `${glbKeyPrefix}/${row.slug}.glb` : null;
    const glbStat = hasReplacementGlb ? await fsp.stat(glbSource) : null;
    return {
      ...row,
      old_texture_url: row.texture_url,
      old_file_url: row.file_url,
      texture_url: `${publicBaseUrl}/${key}`,
      file_url: glbKey ? `${publicBaseUrl}/${glbKey}` : row.file_url,
      source: outputPath,
      key,
      size: stat.size,
      glbSource: hasReplacementGlb ? glbSource : null,
      glbKey,
      glbSize: glbStat?.size || null,
      ...cleaned,
      output: undefined,
    };
  });

  const manifest = {
    createdAt: new Date().toISOString(),
    version,
    modelCount: models.length,
    minArea,
    minSpan,
    inputPaths: models.reduce((sum, model) => sum + model.inputPaths, 0),
    outputPaths: models.reduce((sum, model) => sum + model.outputPaths, 0),
    removedPaths: models.reduce((sum, model) => sum + model.removedPaths, 0),
    fallbackModels: models.filter(model => model.fallbackThreshold).map(model => ({ id: model.id, slug: model.slug })),
    replacementGlbs: models.filter(model => model.glbKey).map(model => ({
      id: model.id,
      slug: model.slug,
      old_file_url: model.old_file_url,
      file_url: model.file_url,
      size: model.glbSize,
    })),
    models,
  };
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const sql = [
    ...models.map(model => {
      const fileUpdate = model.glbKey ? `, file_url=${sqlString(model.file_url)}` : '';
      return `UPDATE models_3d SET texture_url=${sqlString(model.texture_url)}${fileUpdate}, updated_at=CURRENT_TIMESTAMP WHERE id=${model.id} AND slug=${sqlString(model.slug)};`;
    }),
    '',
  ].join('\n');
  await fsp.writeFile(sqlPath, sql);

  console.log(JSON.stringify({
    version,
    modelCount: manifest.modelCount,
    inputPaths: manifest.inputPaths,
    outputPaths: manifest.outputPaths,
    removedPaths: manifest.removedPaths,
    fallbackModels: manifest.fallbackModels,
    replacementGlbs: manifest.replacementGlbs.length,
    reuseExisting,
    manifestPath,
    sqlPath,
  }, null, 2));

  if (!shouldUpload) return;
  const client = createClient();
  let uploaded = 0;
  await mapWithConcurrency(models, concurrency, async model => {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: model.key,
      Body: fs.createReadStream(model.source),
      ContentType: 'image/svg+xml; charset=utf-8',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    uploaded += 1;
    if (uploaded % 20 === 0 || uploaded === models.length) console.log(`uploaded ${uploaded}/${models.length}`);
  });
  const replacementGlbs = models.filter(model => model.glbKey);
  await mapWithConcurrency(replacementGlbs, Math.min(concurrency, 4), async model => {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: model.glbKey,
      Body: fs.createReadStream(model.glbSource),
      ContentType: 'model/gltf-binary',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  });
  let verified = 0;
  await mapWithConcurrency(models, concurrency, async model => {
    const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: model.key }));
    const remoteSize = Number(response.ContentLength || 0);
    if (remoteSize !== model.size) throw new Error(`R2 size mismatch for ${model.key}: ${remoteSize} != ${model.size}`);
    verified += 1;
    if (verified % 20 === 0 || verified === models.length) console.log(`verified ${verified}/${models.length}`);
  });
  await mapWithConcurrency(replacementGlbs, Math.min(concurrency, 4), async model => {
    const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: model.glbKey }));
    const remoteSize = Number(response.ContentLength || 0);
    if (remoteSize !== model.glbSize) throw new Error(`R2 size mismatch for ${model.glbKey}: ${remoteSize} != ${model.glbSize}`);
  });
  console.log(`uploaded and verified ${replacementGlbs.length} replacement GLBs`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { cleanSvg, parsePath };
