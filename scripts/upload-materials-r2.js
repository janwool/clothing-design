require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} = require('@aws-sdk/client-s3');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'public', 'materials-v2');
const prefix = 'materials-v2/';
const bucket = process.env.R2_BUCKET || 'clothing-design';
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const dryRun = process.argv.includes('--dry-run');
const concurrency = 6;

function required(name) {
  if (!process.env[name]) throw new Error(`${name} is required`);
  return process.env[name];
}

function createClient() {
  const accountId = required('R2_ACCOUNT_ID');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY')
    }
  });
}

async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(filePath));
    else files.push(filePath);
  }
  return files;
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.webp') return 'image/webp';
  if (extension === '.png') return 'image/png';
  if (extension === '.json') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function objectKey(filePath) {
  const relative = path.relative(sourceRoot, filePath).split(path.sep).join('/');
  return `${prefix}${relative}`;
}

function checksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function mapConcurrent(items, limit, callback) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await callback(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function listRemoteKeys(client) {
  const keys = [];
  let continuationToken;
  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken
    }));
    keys.push(...(response.Contents || []).map(item => item.Key));
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  return keys;
}

async function main() {
  const files = (await walk(sourceRoot)).sort();
  const assets = await Promise.all(files.map(async filePath => {
    const body = await fs.readFile(filePath);
    return {
      filePath,
      body,
      key: objectKey(filePath),
      sha256: checksum(body),
      contentType: contentType(filePath)
    };
  }));

  const totalBytes = assets.reduce((sum, asset) => sum + asset.body.length, 0);
  console.log(JSON.stringify({
    dryRun,
    bucket,
    prefix,
    fileCount: assets.length,
    totalBytes,
    publicBaseUrl
  }, null, 2));

  if (dryRun) {
    assets.forEach(asset => console.log(`${path.relative(projectRoot, asset.filePath)} -> ${publicBaseUrl}/${asset.key}`));
    return;
  }

  const client = createClient();
  let uploaded = 0;
  await mapConcurrent(assets, concurrency, async asset => {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: asset.key,
      Body: asset.body,
      ContentType: asset.contentType,
      CacheControl: asset.key.endsWith('/manifest.json')
        ? 'public, max-age=300'
        : 'public, max-age=31536000, immutable',
      Metadata: { sha256: asset.sha256 }
    }));
    uploaded += 1;
    console.log(`uploaded ${uploaded}/${assets.length} ${asset.key}`);
  });

  let verified = 0;
  await mapConcurrent(assets, concurrency, async asset => {
    const remote = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.key }));
    if (Number(remote.ContentLength) !== asset.body.length) {
      throw new Error(`Size mismatch for ${asset.key}`);
    }
    if (remote.Metadata?.sha256 !== asset.sha256) {
      throw new Error(`SHA-256 mismatch for ${asset.key}`);
    }
    if (remote.ContentType !== asset.contentType) {
      throw new Error(`Content-Type mismatch for ${asset.key}: ${remote.ContentType}`);
    }
    verified += 1;
    console.log(`verified ${verified}/${assets.length} ${asset.key}`);
  });

  const expectedKeys = new Set(assets.map(asset => asset.key));
  const remoteKeys = await listRemoteKeys(client);
  const missingKeys = [...expectedKeys].filter(key => !remoteKeys.includes(key));
  if (missingKeys.length > 0) throw new Error(`Missing R2 objects: ${missingKeys.join(', ')}`);

  console.log(JSON.stringify({
    success: true,
    uploaded,
    verified,
    remotePrefixObjectCount: remoteKeys.length,
    manifestUrl: `${publicBaseUrl}/${prefix}manifest.json`
  }, null, 2));
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
