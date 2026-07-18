require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const rootDir = path.resolve(__dirname, '..');
const imagesDir = path.join(rootDir, 'public', 'images');
const bucket = process.env.R2_BUCKET || 'clothing-design';
const publicBaseUrl = (process.env.R2_PUBLIC_URL || 'https://cdn.cloz-design.com').replace(/\/+$/, '');
const dryRun = process.argv.includes('--dry-run');

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

async function walk(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'source') files.push(...await walk(fullPath));
    } else if (/\.(?:png|webp|jpe?g)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.webp') return 'image/webp';
  if (extension === '.png') return 'image/png';
  return 'image/jpeg';
}

function objectKey(filePath) {
  const relative = path.relative(imagesDir, filePath).split(path.sep).join('/');
  return relative === 'icon.png' ? 'site/icon.png' : `image/${relative}`;
}

async function main() {
  const files = (await walk(imagesDir)).sort();
  console.log(JSON.stringify({ dryRun, bucket, fileCount: files.length }, null, 2));
  if (dryRun) {
    files.forEach(file => console.log(`${path.relative(rootDir, file)} -> ${publicBaseUrl}/${objectKey(file)}`));
    return;
  }

  const client = createClient();
  for (const file of files) {
    const key = objectKey(file);
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: await fs.readFile(file),
      ContentType: contentType(file),
      CacheControl: 'public, max-age=31536000, immutable'
    }));
    console.log(`uploaded ${path.relative(rootDir, file)} -> ${publicBaseUrl}/${key}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
