require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const db = require('../lib/db');

const sourceRoot = '/Users/chengwuxue/Downloads/6588';
const metadataPath = path.join(sourceRoot, 'seo_geo_models.json');
const bucketName = 'clothing-design';
const version = process.env.PREVIEW_VERSION || 'white-shadow-20260606';

function required(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required`);
  }
  return process.env[name];
}

function publicUrl(key) {
  const base = process.env.R2_PUBLIC_URL;
  if (base) {
    return `${base.replace(/\/+$/, '')}/${key}`;
  }
  return `https://${bucketName}.${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${key}`;
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

async function uploadPreview(client, model) {
  const relativeSource = model.assets.preview.replace('_pale_yellow.webp', '_white.webp');
  const key = `image/6588/${model.slug}.webp`;
  const body = await fs.readFile(path.join(sourceRoot, relativeSource));
  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable'
  }));
  const imageUrl = `${publicUrl(key)}?v=${version}`;
  await db.run(
    'UPDATE models_3d SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?',
    [imageUrl, model.slug]
  );
  return imageUrl;
}

async function main() {
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  const client = s3Client();
  let count = 0;
  for (const model of metadata.models) {
    const url = await uploadPreview(client, model);
    count += 1;
    console.log(`updated preview: ${model.slug} -> ${url}`);
  }
  console.log(`Uploaded ${count} preview images with version ${version}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
