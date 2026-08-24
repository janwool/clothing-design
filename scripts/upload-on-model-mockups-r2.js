#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} = require('@aws-sdk/client-s3');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

const rootDir = path.resolve(__dirname, '..');
const assetDir = path.join(rootDir, 'public', 'images', 'mockups', 'on-model', 'generated');
const bucket = process.env.R2_BUCKET || 'clothing-design';
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const dryRun = process.argv.includes('--dry-run');
const verifyOnly = process.argv.includes('--verify-only');
const force = process.argv.includes('--force');
const concurrency = Math.min(12, Math.max(1, Number.parseInt(process.env.R2_UPLOAD_CONCURRENCY, 10) || 6));

function required(name) {
  if (!process.env[name]) throw new Error(`${name} is required`);
  return process.env[name];
}

function createClient() {
  const accountId = required('R2_ACCOUNT_ID');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    maxAttempts: 3,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 10_000,
      socketTimeout: 60_000
    }),
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY')
    }
  });
}

function objectKey(filename) {
  return `image/mockups/on-model/generated/${filename}`;
}

async function loadAssets() {
  const entries = await fs.readdir(assetDir, { withFileTypes: true });
  const files = [];
  const groups = new Map();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(/^(.*)-(base|mask|depth)\.png$/);
    if (!match) throw new Error(`Unexpected file in generated asset directory: ${entry.name}`);
    const stat = await fs.stat(path.join(assetDir, entry.name));
    files.push({
      filename: entry.name,
      filePath: path.join(assetDir, entry.name),
      key: objectKey(entry.name),
      size: stat.size
    });
    const kinds = groups.get(match[1]) || new Set();
    kinds.add(match[2]);
    groups.set(match[1], kinds);
  }

  for (const [name, kinds] of groups) {
    for (const requiredKind of ['base', 'mask', 'depth']) {
      if (!kinds.has(requiredKind)) throw new Error(`Incomplete asset set ${name}: missing ${requiredKind}`);
    }
  }
  if (files.length !== groups.size * 3) {
    throw new Error(`Expected three files per asset set; found ${files.length} files for ${groups.size} sets`);
  }
  return files.sort((left, right) => left.filename.localeCompare(right.filename));
}

async function remoteSize(client, file) {
  try {
    const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: file.key }));
    return Number(response.ContentLength);
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === 'NotFound' || error?.Code === 'NoSuchKey') return null;
    throw error;
  }
}

async function processFile(client, file, summary) {
  const before = await remoteSize(client, file);
  if (verifyOnly) {
    if (before !== file.size) {
      throw new Error(`Remote verification failed for ${file.key}: local=${file.size}, remote=${before ?? 'missing'}`);
    }
    summary.verified += 1;
    return;
  }

  if (!force && before === file.size) {
    summary.skipped += 1;
  } else {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: file.key,
      Body: await fs.readFile(file.filePath),
      ContentLength: file.size,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable'
    }));
    summary.uploaded += 1;
    summary.uploadedBytes += file.size;
  }

  const after = await remoteSize(client, file);
  if (after !== file.size) {
    throw new Error(`Remote verification failed for ${file.key}: local=${file.size}, remote=${after ?? 'missing'}`);
  }
  summary.verified += 1;
}

async function runPool(items, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }));
}

async function main() {
  const files = await loadAssets();
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  console.log(JSON.stringify({
    dryRun,
    verifyOnly,
    force,
    bucket,
    assetSets: files.length / 3,
    fileCount: files.length,
    totalBytes,
    concurrency,
    publicRoot: `${publicBaseUrl}/image/mockups/on-model/generated/`
  }, null, 2));

  if (dryRun) return;

  const client = createClient();
  const summary = { uploaded: 0, uploadedBytes: 0, skipped: 0, verified: 0 };
  let completed = 0;
  let lastReported = 0;
  await runPool(files, async (file) => {
    await processFile(client, file, summary);
    completed += 1;
    if (completed - lastReported >= 50 || completed === files.length) {
      lastReported = completed;
      console.log(`processed ${completed}/${files.length}`);
    }
  });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
