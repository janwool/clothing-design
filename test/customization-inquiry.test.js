const test = require('node:test');
const assert = require('node:assert/strict');
const { validateInquiryPayload } = require('../lib/customization-inquiry');
const { deleteObject, parseImageDataUrl, uploadImageDataUrl } = require('../lib/object-storage');

const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webpHeader = Buffer.from('RIFF0000WEBP', 'ascii');

function dataUrl(type, bytes) {
  return `data:${type};base64,${bytes.toString('base64')}`;
}

test('normalizes a valid customization inquiry payload', () => {
  const payload = validateInquiryPayload({
    modelId: '23',
    modelSlug: 'classic-crew-neck-t-shirt-3d-model',
    modelName: 'Classic Crew Neck T-Shirt 3D Model',
    contact: {
      name: '  Jane   Buyer ',
      email: 'JANE@EXAMPLE.COM'
    },
    quantity: '500',
    notes: 'Cotton jersey\nBlack colorway',
    snapshots: {
      threeD: dataUrl('image/webp', webpHeader),
      twoD: dataUrl('image/png', pngHeader)
    }
  });

  assert.equal(payload.valid, true);
  assert.equal(payload.value.modelId, 23);
  assert.equal(payload.value.name, 'Jane Buyer');
  assert.equal(payload.value.email, 'jane@example.com');
  assert.equal(payload.value.quantity, 500);
});

test('rejects incomplete customization contact and quantity data', () => {
  const payload = validateInquiryPayload({
    modelName: 'T-Shirt',
    contact: { name: 'A', email: 'invalid' },
    quantity: '0',
    snapshots: {}
  });

  assert.equal(payload.valid, false);
  assert.match(payload.errors.join(' '), /name/i);
  assert.match(payload.errors.join(' '), /email/i);
  assert.match(payload.errors.join(' '), /quantity/i);
  assert.match(payload.errors.join(' '), /3D design screenshot/i);
  assert.match(payload.errors.join(' '), /2D design screenshot/i);
});

test('accepts PNG and WebP data URLs with matching image signatures', () => {
  const png = parseImageDataUrl(dataUrl('image/png', pngHeader), '2D screenshot');
  const webp = parseImageDataUrl(dataUrl('image/webp', webpHeader), '3D screenshot');

  assert.equal(png.extension, 'png');
  assert.equal(webp.extension, 'webp');
});

test('rejects image data URLs with spoofed content', () => {
  assert.throws(
    () => parseImageDataUrl('data:image/png;base64,aGVsbG8=', 'Screenshot'),
    /invalid image signature/
  );
});

test('uses the Cloudflare R2 binding when it is available', async t => {
  const previousWorkerEnv = globalThis.__WORKER_ENV__;
  const calls = [];
  globalThis.__WORKER_ENV__ = {
    ...(previousWorkerEnv || {}),
    OBJECT_FILE: {
      async put(key, bytes, options) {
        calls.push({ action: 'put', key, size: bytes.length, contentType: options.httpMetadata.contentType });
      },
      async delete(key) {
        calls.push({ action: 'delete', key });
      }
    }
  };
  t.after(() => {
    globalThis.__WORKER_ENV__ = previousWorkerEnv;
  });

  const uploaded = await uploadImageDataUrl(dataUrl('image/png', pngHeader), {
    keyBase: 'object-file/test/design-2d',
    label: '2D screenshot'
  });
  await deleteObject(uploaded.key);

  assert.equal(uploaded.key, 'object-file/test/design-2d.png');
  assert.match(uploaded.url, /object-file\/test\/design-2d\.png$/);
  assert.deepEqual(calls, [
    {
      action: 'put',
      key: 'object-file/test/design-2d.png',
      size: pngHeader.length,
      contentType: 'image/png'
    },
    {
      action: 'delete',
      key: 'object-file/test/design-2d.png'
    }
  ]);
});
