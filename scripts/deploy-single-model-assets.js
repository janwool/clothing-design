#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { HeadObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

function parseArgs(argv) {
  const result = { upload: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--upload') result.upload = true;
    else if (arg.startsWith('--')) result[arg.slice(2)] = argv[++index];
  }
  return result;
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slug = required(args.slug, '--slug');
  const version = required(args.version, '--version');
  const modelId = Number(required(args['model-id'], '--model-id'));
  const glbPath = path.resolve(required(args.glb, '--glb'));
  const svgPath = path.resolve(required(args.svg, '--svg'));
  const outputDir = path.resolve(args.output || path.dirname(path.dirname(svgPath)));
  const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
  const bucket = process.env.R2_BUCKET || 'clothing-design';
  const glbKey = `catalog/${version}/glb/${path.basename(glbPath)}`;
  const svgKey = `catalog/${version}/texture/${path.basename(svgPath)}`;
  const glbUrl = `${publicBaseUrl}/${glbKey}`;
  const svgUrl = `${publicBaseUrl}/${svgKey}`;
  const glbStat = await fsp.stat(glbPath);
  const svgStat = await fsp.stat(svgPath);
  const manifest = {
    createdAt: new Date().toISOString(),
    version,
    modelId,
    slug,
    glb: { source: glbPath, key: glbKey, url: glbUrl, size: glbStat.size },
    svg: { source: svgPath, key: svgKey, url: svgUrl, size: svgStat.size },
  };
  await fsp.mkdir(outputDir, { recursive: true });
  const manifestPath = path.join(outputDir, 'deploy-manifest.json');
  const sqlPath = path.join(outputDir, 'apply-remote.sql');
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fsp.writeFile(
    sqlPath,
    `UPDATE models_3d SET file_url=${sqlString(glbUrl)}, texture_url=${sqlString(svgUrl)}, updated_at=CURRENT_TIMESTAMP WHERE id=${modelId} AND slug=${sqlString(slug)};\n`
  );
  console.log(JSON.stringify({ mode: args.upload ? 'upload' : 'prepare', manifestPath, sqlPath, ...manifest }, null, 2));
  if (!args.upload) return;

  const accountId = process.env.R2_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${required(accountId, 'R2_ACCOUNT_ID or CF_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required(process.env.R2_ACCESS_KEY_ID, 'R2_ACCESS_KEY_ID'),
      secretAccessKey: required(process.env.R2_SECRET_ACCESS_KEY, 'R2_SECRET_ACCESS_KEY'),
    },
  });
  await Promise.all([
    client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: glbKey,
      Body: fs.createReadStream(glbPath),
      ContentType: 'model/gltf-binary',
      CacheControl: 'public, max-age=31536000, immutable',
    })),
    client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: svgKey,
      Body: fs.createReadStream(svgPath),
      ContentType: 'image/svg+xml; charset=utf-8',
      CacheControl: 'public, max-age=31536000, immutable',
    })),
  ]);
  const [glbHead, svgHead] = await Promise.all([
    client.send(new HeadObjectCommand({ Bucket: bucket, Key: glbKey })),
    client.send(new HeadObjectCommand({ Bucket: bucket, Key: svgKey })),
  ]);
  if (Number(glbHead.ContentLength) !== glbStat.size) throw new Error('Uploaded GLB size mismatch');
  if (Number(svgHead.ContentLength) !== svgStat.size) throw new Error('Uploaded SVG size mismatch');
  console.log(JSON.stringify({ uploaded: 2, verified: 2 }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
