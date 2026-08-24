#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const root = path.resolve(__dirname, '..');
const version = process.env.ORIENTATION_VERSION || '20260818-panel-orientation-v1';
const outputDir = path.join(root, 'artifacts', 'deployments', `catalog-${version}`);
const baseCatalogPath = path.join(root, 'artifacts', 'deployments', 'catalog-20260818-uv-orientation-audit', 'catalog.json');
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

async function mapConcurrent(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

function applyRemoteSql(sqlPath) {
  const env = {
    ...process.env,
    CF_API_TOKEN: '',
    CF_ACCOUNT_ID: '',
    CLOUDFLARE_API_TOKEN: '',
    CLOUDFLARE_ACCOUNT_ID: '',
  };
  const result = spawnSync(
    'npx',
    ['--yes', 'wrangler@4.123.0', 'd1', 'execute', 'clothing-design', '--remote', '--file', sqlPath],
    { cwd: root, env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  if (result.status !== 0) throw new Error(result.stderr || `wrangler exited with ${result.status}`);
  process.stdout.write(result.stdout);
}

async function main() {
  const catalog = JSON.parse(await fsp.readFile(baseCatalogPath, 'utf8'));
  const glbDir = path.join(outputDir, 'glb');
  const svgDir = path.join(outputDir, 'texture');
  const glbNames = (await fsp.readdir(glbDir)).filter(name => name.endsWith('.glb')).sort();
  const models = [];
  for (const glbName of glbNames) {
    const slug = glbName.slice(0, -4);
    const base = catalog.models.find(model => model.slug === slug);
    if (!base) throw new Error(`Unknown output slug: ${slug}`);
    const glb = path.join(glbDir, glbName);
    const svg = path.join(svgDir, `${slug}.svg`);
    const [glbStat, svgStat] = await Promise.all([fsp.stat(glb), fsp.stat(svg)]);
    const glbKey = `catalog/${version}/glb/${glbName}`;
    const svgKey = `catalog/${version}/texture/${slug}.svg`;
    models.push({
      ...base,
      glb,
      svg,
      glbBytes: glbStat.size,
      svgBytes: svgStat.size,
      glbKey,
      svgKey,
      oldFileUrl: base.currentFileUrl,
      oldTextureUrl: base.currentTextureUrl,
      fileUrl: `${publicBaseUrl}/${glbKey}`,
      textureUrl: `${publicBaseUrl}/${svgKey}`,
    });
  }
  if (models.length !== 12) throw new Error(`Expected 12 repaired models, found ${models.length}`);

  const manifestPath = path.join(outputDir, 'manifest.json');
  const auditCatalogPath = path.join(outputDir, 'audit-catalog.json');
  const sqlPath = path.join(outputDir, 'apply-remote.sql');
  await fsp.writeFile(manifestPath, `${JSON.stringify({ createdAt: new Date().toISOString(), version, modelCount: models.length, models }, null, 2)}\n`);
  await fsp.writeFile(auditCatalogPath, `${JSON.stringify({ createdAt: new Date().toISOString(), models }, null, 2)}\n`);
  await fsp.writeFile(sqlPath, `${models.map(model => (
    `UPDATE models_3d SET file_url=${sqlString(model.fileUrl)}, texture_url=${sqlString(model.textureUrl)}, updated_at=CURRENT_TIMESTAMP WHERE id=${model.id} AND slug=${sqlString(model.slug)};`
  )).join('\n')}\n`);
  console.log(JSON.stringify({ version, models: models.length, manifestPath, auditCatalogPath, sqlPath, shouldUpload, shouldApply }, null, 2));

  if (shouldUpload) {
    const accountId = process.env.R2_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${required(accountId, 'R2_ACCOUNT_ID or CF_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required(process.env.R2_ACCESS_KEY_ID, 'R2_ACCESS_KEY_ID'),
        secretAccessKey: required(process.env.R2_SECRET_ACCESS_KEY, 'R2_SECRET_ACCESS_KEY'),
      },
    });
    await mapConcurrent(models, 4, async model => {
      await Promise.all([
        client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: model.glbKey,
          Body: fs.createReadStream(model.glb),
          ContentType: 'model/gltf-binary',
          CacheControl: 'public, max-age=31536000, immutable',
        })),
        client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: model.svgKey,
          Body: fs.createReadStream(model.svg),
          ContentType: 'image/svg+xml; charset=utf-8',
          CacheControl: 'public, max-age=31536000, immutable',
        })),
      ]);
    });
    await mapConcurrent(models, 8, async model => {
      const [glbHead, svgHead] = await Promise.all([
        client.send(new HeadObjectCommand({ Bucket: bucket, Key: model.glbKey })),
        client.send(new HeadObjectCommand({ Bucket: bucket, Key: model.svgKey })),
      ]);
      if (Number(glbHead.ContentLength) !== model.glbBytes) throw new Error(`GLB size mismatch: ${model.slug}`);
      if (Number(svgHead.ContentLength) !== model.svgBytes) throw new Error(`SVG size mismatch: ${model.slug}`);
    });
    console.log(`uploaded and verified ${models.length * 2} assets`);
  }
  if (shouldApply) applyRemoteSql(sqlPath);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
