const { Buffer } = require('node:buffer');
const { fetchCloudflareAi } = require('./cloudflare-ai-fetch');

const TRY_ON_MODEL = 'openai/gpt-image-2.5-sunburst';
const MAX_OUTPUT_BYTES = 14 * 1024 * 1024;
const TRY_ON_PROMPT = 'Create a realistic commercial fashion try-on photo. Use the first image as the person and the second image as the exact garment design reference. Dress the person in that garment while preserving their identity, face, hair, body proportions, pose, and the original scene and background. Preserve the garment silhouette, colors, print, logo, text, artwork, placement, and scale exactly. Adapt only the garment fit, folds, fabric texture, lighting, and shadows so it looks naturally worn. Do not add accessories, props, text, graphics, or another person.';

function getEnvValue(name) {
  return globalThis.__WORKER_ENV__?.[name] || process.env[name] || '';
}

function getAiBinding() {
  return globalThis.__WORKER_ENV__?.AI || null;
}

function getGatewayId() {
  return getEnvValue('CF_AI_GATEWAY_ID') || 'default';
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
  const input = {
    prompt: TRY_ON_PROMPT,
    images: [personImage, garmentImage],
    quality: 'high',
    size: 'auto',
    background: 'opaque',
    output_format: 'webp'
  };

  const ai = getAiBinding();
  let payload;

  if (ai?.run) {
    payload = await ai.run(TRY_ON_MODEL, input, { gateway: { id: getGatewayId() } });
  } else {
    const accountId = getEnvValue('CF_ACCOUNT_ID') || getEnvValue('R2_ACCOUNT_ID');
    const apiToken = getEnvValue('CF_AI_API_TOKEN') || getEnvValue('CF_API_TOKEN');
    if (!accountId || !apiToken) {
      throw new Error('Cloudflare AI is not configured. Set CF_ACCOUNT_ID and CF_AI_API_TOKEN.');
    }

    const response = await fetchCloudflareAi(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'cf-aig-gateway-id': getGatewayId()
      },
      body: JSON.stringify({ model: TRY_ON_MODEL, input })
    });
    payload = await response.json().catch(() => null);
    if (!response.ok) {
      const providerError = payload?.errors?.[0];
      const billingUnavailable = response.status === 402 || (response.status === 503 && providerError?.code === 7005);
      const error = new Error(billingUnavailable
        ? 'AI try-on is temporarily unavailable. Please try again later.'
        : cloudflareError(payload, `Cloudflare AI request failed (${response.status}).`));
      error.status = billingUnavailable ? 503 : 502;
      error.requestId = response.headers.get('cf-ray') || undefined;
      console.error('Cloudflare AI try-on request failed:', { status: response.status, code: providerError?.code, message: providerError?.message, requestId: error.requestId });
      throw error;
    }
  }

  const image = normalizeModelResult(payload);
  return {
    image: await imageToDataUri(image),
    model: TRY_ON_MODEL
  };
}

module.exports = {
  TRY_ON_MODEL,
  normalizeModelResult,
  runCloudflareTryOn
};
