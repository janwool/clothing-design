require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

process.env.DB_TYPE = 'd1';

const db = require('../lib/db');

const previewDir = path.resolve(__dirname, '..', 'public', 'uploads', 'preview');
const bucketName = process.env.R2_BUCKET || 'clothing-design';
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const version = process.env.COVER_VERSION || '20260607';
const keyPrefix = process.env.COVER_R2_PREFIX || 'image/design3d-covers';
const dryRun = process.argv.includes('--dry-run');

function required(name) {
  if (!process.env[name]) throw new Error(`${name} is required`);
  return process.env[name];
}

function s3Client() {
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

async function getLocalCovers() {
  const files = await fs.readdir(previewDir);
  return files
    .filter(file => file.endsWith('.webp'))
    .map(file => ({
      slug: file.replace(/\.webp$/, ''),
      file,
      path: path.join(previewDir, file)
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

async function main() {
  const localCovers = await getLocalCovers();
  const remoteRows = await db.all('SELECT id, slug, image_url FROM models_3d ORDER BY id');
  const remoteSlugs = new Set(remoteRows.map(row => row.slug));
  const coversToDeploy = localCovers.filter(cover => remoteSlugs.has(cover.slug));
  const unmatchedLocal = localCovers.filter(cover => !remoteSlugs.has(cover.slug)).map(cover => cover.slug);
  const unmatchedRemote = remoteRows
    .filter(row => !localCovers.some(cover => cover.slug === row.slug))
    .map(row => ({ id: row.id, slug: row.slug, image_url: row.image_url }));

  console.log(JSON.stringify({
    dryRun,
    localCoverCount: localCovers.length,
    remoteModelCount: remoteRows.length,
    deployCount: coversToDeploy.length,
    unmatchedLocal,
    unmatchedRemote
  }, null, 2));

  if (dryRun) return;

  const client = s3Client();
  let uploaded = 0;
  let updated = 0;

  for (const cover of coversToDeploy) {
    const key = `${keyPrefix}/${cover.file}`;
    const imageUrl = `${publicBaseUrl}/${key}?v=cover-${version}`;
    const body = await fs.readFile(cover.path);

    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable'
    }));
    uploaded += 1;

    const result = await db.run(
      'UPDATE models_3d SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?',
      [imageUrl, cover.slug]
    );
    updated += result.changes || 0;
    console.log(`deployed ${cover.slug} -> ${imageUrl}`);
  }

  console.log(JSON.stringify({ uploaded, updated }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
