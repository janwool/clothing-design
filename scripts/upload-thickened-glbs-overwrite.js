#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');

process.env.DB_TYPE = 'd1';

const db = require('../lib/db');

const projectRoot = path.resolve(__dirname, '..');
const publicGlbDir = path.join(projectRoot, 'public', 'uploads', 'glb');
const dryRun = process.argv.includes('--dry-run');
const verifyOnly = process.argv.includes('--verify-only');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;
const onlyKeyArg = process.argv.find(arg => arg.startsWith('--only-key='));
const onlyKey = onlyKeyArg ? onlyKeyArg.slice('--only-key='.length) : '';
const onlyFiles = process.argv
  .filter(arg => arg.startsWith('--only-file='))
  .map(arg => path.basename(arg.slice('--only-file='.length)))
  .filter(Boolean);

const bucket = process.env.R2_BUCKET || 'clothing-design';
const accountId = process.env.R2_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

function assertEnv() {
  const missing = [];
  if (!accountId) missing.push('R2_ACCOUNT_ID or CF_ACCOUNT_ID');
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!process.env.D1_DATABASE_ID) missing.push('D1_DATABASE_ID');
  if (!process.env.CF_API_TOKEN) missing.push('CF_API_TOKEN');
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

function keyFromUrl(value) {
  if (!value) return null;
  const raw = String(value).trim();
  let pathname = '';

  try {
    const url = new URL(raw, 'https://placeholder.local');
    pathname = decodeURIComponent(url.pathname || '').replace(/^\/+/, '');
  } catch {
    pathname = raw.split('?')[0].replace(/^\/+/, '');
  }

  if (!pathname.toLowerCase().endsWith('.glb')) return null;
  if (!pathname.startsWith('d3/')) return null;
  return pathname;
}

function isUploadableLocalGlb(filename) {
  return (
    filename.toLowerCase().endsWith('.glb') &&
    !filename.endsWith('.bak-thin.glb') &&
    !filename.endsWith('-thick.glb') &&
    !filename.endsWith('.tmp-thick.glb')
  );
}

async function objectExists(client, key) {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { exists: true, size: head.ContentLength || 0 };
  } catch (error) {
    const status = error && error.$metadata && error.$metadata.httpStatusCode;
    if (status === 404 || error.name === 'NotFound') {
      return { exists: false, size: 0 };
    }
    throw error;
  }
}

async function uploadOne(client, item) {
  const body = fs.createReadStream(item.localPath);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: item.key,
    Body: body,
    ContentType: 'model/gltf-binary',
    CacheControl: 'public, max-age=0, must-revalidate',
  }));
}

async function main() {
  assertEnv();

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const rows = await db.all(`
    SELECT id, slug, name, category, file_url
    FROM models_3d
    WHERE file_url IS NOT NULL
      AND file_url != ''
    ORDER BY category, slug
  `);

  const seenKeys = new Set();
  const candidates = [];
  const skipped = [];

  for (const row of rows) {
    const key = keyFromUrl(row.file_url);
    if (!key) {
      skipped.push({ slug: row.slug, reason: 'non-d3-glb-url', file_url: row.file_url });
      continue;
    }
    if (seenKeys.has(key)) {
      skipped.push({ slug: row.slug, reason: 'duplicate-key', key });
      continue;
    }
    seenKeys.add(key);

    const filename = path.basename(key);
    if (!isUploadableLocalGlb(filename)) {
      skipped.push({ slug: row.slug, reason: 'backup-or-temp-name', filename });
      continue;
    }

    const localPath = path.join(publicGlbDir, filename);
    if (!fs.existsSync(localPath)) {
      skipped.push({ slug: row.slug, reason: 'missing-local-file', filename, key });
      continue;
    }

    const stat = fs.statSync(localPath);
    candidates.push({
      slug: row.slug,
      name: row.name,
      category: row.category,
      key,
      filename,
      localPath,
      localSize: stat.size,
    });
  }

  let selected = candidates;
  if (onlyKey) {
    selected = selected.filter(item => item.key === onlyKey);
  }
  if (onlyFiles.length) {
    const fileSet = new Set(onlyFiles);
    selected = selected.filter(item => fileSet.has(item.filename));
  }
  if (limit > 0) {
    selected = selected.slice(0, limit);
  }
  const uploaded = [];
  const verified = [];
  const mismatched = [];
  const missingRemote = [];
  const errors = [];

  for (const item of selected) {
    try {
      const before = await objectExists(client, item.key);
      if (!before.exists) {
        missingRemote.push(item);
        continue;
      }

      if (verifyOnly) {
        const matches = before.size === item.localSize;
        verified.push(item);
        if (!matches) {
          mismatched.push({ ...item, remoteSize: before.size });
          console.log(`mismatch: ${item.key} (${before.size} != ${item.localSize})`);
        }
        continue;
      }

      if (!dryRun) {
        await uploadOne(client, item);
      }

      const after = dryRun
        ? { size: before.size }
        : await objectExists(client, item.key);

      uploaded.push({
        slug: item.slug,
        key: item.key,
        beforeSize: before.size,
        localSize: item.localSize,
        afterSize: after.size,
      });

      const verb = dryRun ? 'would overwrite' : 'overwrote';
      console.log(`${verb}: ${item.key} (${before.size} -> ${item.localSize})`);
    } catch (error) {
      errors.push({ item, error });
      console.error(`error: ${item.key}: ${error.message}`);
    }
  }

  console.log('\nSummary');
  console.log(`mode: ${verifyOnly ? 'verify-only' : dryRun ? 'dry-run' : 'upload'}`);
  console.log(`remote rows: ${rows.length}`);
  console.log(`local candidates: ${candidates.length}`);
  console.log(`selected: ${selected.length}`);
  if (verifyOnly) {
    console.log(`verified: ${verified.length}`);
    console.log(`mismatched: ${mismatched.length}`);
  } else {
    console.log(`${dryRun ? 'would overwrite' : 'overwritten'}: ${uploaded.length}`);
  }
  console.log(`skipped before upload: ${skipped.length}`);
  console.log(`remote missing, not created: ${missingRemote.length}`);
  console.log(`errors: ${errors.length}`);

  if (skipped.length) {
    console.log('\nSkipped sample');
    for (const item of skipped.slice(0, 12)) {
      console.log(`- ${item.slug || '(unknown)'}: ${item.reason}${item.filename ? ` (${item.filename})` : ''}`);
    }
  }

  if (missingRemote.length) {
    console.log('\nRemote missing sample');
    for (const item of missingRemote.slice(0, 12)) {
      console.log(`- ${item.slug}: ${item.key}`);
    }
  }

  if (mismatched.length) {
    console.log('\nMismatched sample');
    for (const item of mismatched.slice(0, 12)) {
      console.log(`- ${item.slug}: ${item.key} (${item.remoteSize} != ${item.localSize})`);
    }
  }

  if (errors.length) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
