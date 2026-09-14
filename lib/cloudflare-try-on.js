const { Buffer } = require('node:buffer');
const { randomUUID } = require('node:crypto');
const { deleteObject, uploadImageDataUrl } = require('./object-storage');

const TRY_ON_MODEL = 'pruna/p-image-try-on';
const MAX_OUTPUT_BYTES = 14 * 1024 * 1024;

function getEnvValue(name) {
  return globalThis.__WORKER_ENV__?.[name] || process.env[name] || '';
}

function getAiBinding() {
  return globalThis.__WORKER_ENV__?.AI || null;
}

function cloudflareError(payload, fallback) {
  const errors = payload?.errors || payload?.result?.errors;
  if (Array.isArray(errors) && errors.length) {
    return errors.map(error => error?.message || String(error)).filter(Boolean).join('; ');
  }
  return payload?.error?.message || payload?.message || fallback;
}

function normalizeModelResult(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Cloudflare AI returned an empty response.');
  }

  if (payload.success === false) {
    throw new Error(cloudflareError(payload, 'Cloudflare AI rejected the try-on request.'));
  }

  const envelope = Object.prototype.hasOwnProperty.call(payload, 'success')
    ? payload.result
    : payload;
  const state = String(envelope?.state || '').toLowerCase();
  if (state && !['completed', 'complete', 'succeeded', 'success'].includes(state)) {
    throw new Error(cloudflareError(envelope, `Cloudflare AI try-on did not complete (${state}).`));
  }

  const result = envelope?.result || envelope;
  const image = result?.image || result?.url || result?.images?.[0]?.url || result?.images?.[0];
  if (!image || typeof image !== 'string') {
    throw new Error('Cloudflare AI completed without returning a try-on image.');
  }

  return image;
}

async function imageToDataUri(image) {
  if (image.startsWith('data:image/')) return image;
  if (!/^https:\/\//i.test(image)) {
    return `data:image/webp;base64,${image}`;
  }

  const response = await fetch(image);
  if (!response.ok) {
    throw new Error(`Could not retrieve the generated try-on image (${response.status}).`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_OUTPUT_BYTES) {
    throw new Error('The generated try-on image is too large to return.');
  }
  const contentType = response.headers.get('content-type') || 'image/webp';
  return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
}

async function runCloudflareTryOn({ personImage, garmentImage }) {
  const uploadId = randomUUID();
  const day = new Date().toISOString().slice(0, 10);
  const uploadedInputs = [];

  try {
    // Large base64 data URIs can be dropped by the partner-model REST gateway,
    // which reaches Pruna without an `input` object. Short-lived R2 URLs keep
    // the inference envelope small and work for both REST and Worker bindings.
    const storedPerson = await uploadImageDataUrl(personImage, {
      keyBase: `ai-try-on/tmp/${day}/${uploadId}-person`,
      label: 'Try-on person image'
    });
    uploadedInputs.push(storedPerson.key);
    const storedGarment = await uploadImageDataUrl(garmentImage, {
      keyBase: `ai-try-on/tmp/${day}/${uploadId}-garment`,
      label: 'Try-on garment image'
    });
    uploadedInputs.push(storedGarment.key);

    const input = {
      person_image: storedPerson.url,
      garment_images: [storedGarment.url],
      turbo: true,
      output_format: 'webp',
      output_quality: 92,
      preserve_input_size: true
    };

    const ai = getAiBinding();
    let payload;

    if (ai?.run) {
      payload = await ai.run(TRY_ON_MODEL, input);
    } else {
      const accountId = getEnvValue('CF_ACCOUNT_ID') || getEnvValue('R2_ACCOUNT_ID');
      const apiToken = getEnvValue('CF_AI_API_TOKEN') || getEnvValue('CF_API_TOKEN');
      if (!accountId || !apiToken) {
        throw new Error('Cloudflare AI is not configured. Set CF_ACCOUNT_ID and CF_AI_API_TOKEN.');
      }

      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: TRY_ON_MODEL, input })
      });
      payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(cloudflareError(payload, `Cloudflare AI request failed (${response.status}).`));
      }
    }

    const image = normalizeModelResult(payload);
    return {
      image: await imageToDataUri(image),
      model: TRY_ON_MODEL
    };
  } finally {
    await Promise.all(uploadedInputs.map(key => deleteObject(key).catch(() => {})));
  }
}

module.exports = {
  TRY_ON_MODEL,
  normalizeModelResult,
  runCloudflareTryOn
};
