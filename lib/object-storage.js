const { Buffer } = require('node:buffer');

const DEFAULT_BUCKET = 'clothing-design';
const DEFAULT_PUBLIC_URL = 'https://cdn.cloz-design.com';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const textEncoder = new TextEncoder();

function getEnvValue(key) {
  return process.env[key] || (globalThis.__WORKER_ENV__ && globalThis.__WORKER_ENV__[key]) || '';
}

function getWebCrypto() {
  if (globalThis.crypto?.subtle) return globalThis.crypto;
  const nodeRequire = eval('require');
  return nodeRequire('node:crypto').webcrypto;
}

function getConfig() {
  return {
    accountId: getEnvValue('R2_ACCOUNT_ID') || getEnvValue('CF_ACCOUNT_ID'),
    accessKeyId: getEnvValue('R2_ACCESS_KEY_ID'),
    secretAccessKey: getEnvValue('R2_SECRET_ACCESS_KEY'),
    bucket: getEnvValue('R2_BUCKET') || DEFAULT_BUCKET,
    publicUrl: (getEnvValue('R2_PUBLIC_URL') || DEFAULT_PUBLIC_URL).replace(/\/+$/, '')
  };
}

function getObjectStorageBinding() {
  return globalThis.__WORKER_ENV__ && globalThis.__WORKER_ENV__.OBJECT_FILE;
}

function assertConfigured(config = getConfig()) {
  const missing = [];
  if (!config.accountId) missing.push('R2_ACCOUNT_ID');
  if (!config.accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!config.secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (missing.length) {
    throw new Error(`Object storage is not configured: ${missing.join(', ')}`);
  }
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeObjectKey(key) {
  return String(key || '')
    .split('/')
    .filter(Boolean)
    .map(awsEncode)
    .join('/');
}

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function toHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value;
  const digest = await getWebCrypto().subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

async function hmacSha256(key, value) {
  const cryptoKey = await getWebCrypto().subtle.importKey(
    'raw',
    typeof key === 'string' ? textEncoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await getWebCrypto().subtle.sign('HMAC', cryptoKey, textEncoder.encode(value));
  return new Uint8Array(signature);
}

async function getSigningKey(secretAccessKey, dateStamp) {
  const dateKey = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = await hmacSha256(dateKey, 'auto');
  const serviceKey = await hmacSha256(regionKey, 's3');
  return hmacSha256(serviceKey, 'aws4_request');
}

function parseImageDataUrl(dataUrl, label = 'Image') {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) {
    const error = new Error(`${label} must be a PNG, JPEG, or WebP image`);
    error.status = 400;
    throw error;
  }

  const contentType = match[1];
  const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    const error = new Error(`${label} must be smaller than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
    error.status = 400;
    throw error;
  }

  const hasValidSignature = (
    contentType === 'image/png' &&
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) || (
    contentType === 'image/jpeg' &&
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) || (
    contentType === 'image/webp' &&
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  );
  if (!hasValidSignature) {
    const error = new Error(`${label} has an invalid image signature`);
    error.status = 400;
    throw error;
  }

  const extensions = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp'
  };

  return {
    bytes,
    contentType,
    extension: extensions[contentType],
    size: bytes.length
  };
}

async function signedObjectRequest({ method, key, contentType = '', body }) {
  const config = getConfig();
  assertConfigured(config);

  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const encodedKey = encodeObjectKey(key);
  const canonicalUri = `/${awsEncode(config.bucket)}/${encodedKey}`;
  const payload = body || new Uint8Array();
  const payloadHash = await sha256Hex(payload);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const headerEntries = [
    ['host', host],
    ['x-amz-content-sha256', payloadHash],
    ['x-amz-date', amzDate]
  ];
  if (contentType) headerEntries.push(['content-type', contentType]);
  headerEntries.sort(([left], [right]) => left.localeCompare(right));

  const canonicalHeaders = headerEntries.map(([name, value]) => `${name}:${value}\n`).join('');
  const signedHeaders = headerEntries.map(([name]) => name).join(';');
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n');
  const signingKey = await getSigningKey(config.secretAccessKey, dateStamp);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const headers = {
    Authorization: authorization,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  if (contentType) headers['Content-Type'] = contentType;

  const response = await fetch(`https://${host}${canonicalUri}`, {
    method,
    headers,
    body: method === 'DELETE' ? undefined : payload
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Object storage ${method} failed (${response.status}): ${detail || response.statusText}`);
  }

  return {
    key,
    url: `${config.publicUrl}/${encodedKey}`
  };
}

async function uploadImageDataUrl(dataUrl, { keyBase, label }) {
  const image = parseImageDataUrl(dataUrl, label);
  const key = `${keyBase}.${image.extension}`;
  const binding = getObjectStorageBinding();
  let stored;

  if (binding?.put) {
    await binding.put(key, image.bytes, {
      httpMetadata: {
        contentType: image.contentType
      }
    });
    stored = {
      key,
      url: `${getConfig().publicUrl}/${encodeObjectKey(key)}`
    };
  } else {
    stored = await signedObjectRequest({
      method: 'PUT',
      key,
      contentType: image.contentType,
      body: image.bytes
    });
  }

  return {
    ...stored,
    contentType: image.contentType,
    size: image.size
  };
}

async function deleteObject(key) {
  if (!key) return;
  const binding = getObjectStorageBinding();
  if (binding?.delete) {
    await binding.delete(key);
    return;
  }
  await signedObjectRequest({ method: 'DELETE', key });
}

module.exports = {
  MAX_IMAGE_BYTES,
  deleteObject,
  getConfig,
  parseImageDataUrl,
  uploadImageDataUrl
};
