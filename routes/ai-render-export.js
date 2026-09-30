const express = require('express');
const { Buffer } = require('node:buffer');
const { randomUUID } = require('node:crypto');
const db = require('../lib/db');
const { uploadImageDataUrl, deleteObject, parseImageDataUrl } = require('../lib/object-storage');
const { fetchCloudflareAi } = require('../lib/cloudflare-ai-fetch');
const { ensureUserContentTables } = require('../lib/user-content-db');
const { canStoreImage, getUserEntitlements, limitError } = require('../lib/user-entitlements');

const router = express.Router();
const MODEL = 'openai/gpt-image-2.5-sunburst';
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const PROMPT = `Create a premium ecommerce studio product photograph by refining the supplied 3D apparel image. Treat the input as the definitive product, composition, and background reference. Keep exactly the same garments, number of views, arrangement, viewpoint, crop, silhouette, proportions, fit, hem, neckline, sleeves, colors, material pattern, stitching, and all user-added artwork. Preserve every printed logo, letter, graphic, and its placement without redrawing or inventing details. Keep the background exactly as supplied, including its color, gradient, or transparency; do not replace it with a scene. Make the garments look physically real and ready for a high-end retail product page: natural fabric grain and drape, precise seams and edges, realistic folds, clean tonal separation, controlled soft studio key and fill light, subtle contact shadows where the background is opaque, accurate whites, and crisp but natural detail. Use neutral product-photography color grading. Avoid a plastic, waxy, airbrushed, illustrated, or oversharpened appearance. Do not add people, mannequins, hangers, props, labels, watermarks, new graphics, or any background objects. If a detail is unclear, retain the input appearance rather than changing the design.`;

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.session?.user?.id) return res.status(401).json({ success: false, error: 'Sign in to view downloads.' });
  try {
    await ensureUserContentTables();
    const rows = await db.all("SELECT id, url, original_name, mime_type, size_bytes, created_at FROM user_images WHERE user_id = ? AND purpose = 'ai-render-export' ORDER BY created_at DESC LIMIT 100", [req.session.user.id]);
    return res.json({ success: true, images: rows.map(row => ({ id: row.id, url: row.url, name: row.original_name, mimeType: row.mime_type, size: Number(row.size_bytes), createdAt: row.created_at, downloadUrl: `/api/ai-render-export/${row.id}/download` })) });
  } catch (error) {
    console.error('AI render list failed:', error.message);
    return res.status(500).json({ success: false, error: 'Downloads could not be loaded.' });
  }
});

router.get('/:id/download', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.session?.user?.id) return res.status(401).send('Sign in to download images.');
  if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) return res.status(404).send('Image not found.');
  try {
    await ensureUserContentTables();
    const image = await db.get("SELECT url, original_name, mime_type FROM user_images WHERE id = ? AND user_id = ? AND purpose = 'ai-render-export'", [req.params.id, req.session.user.id]);
    if (!image) return res.status(404).send('Image not found.');
    const upstream = await fetch(image.url);
    if (!upstream.ok) throw new Error(`Stored image returned ${upstream.status}`);
    const filename = String(image.original_name || 'render.png').replace(/[\r\n"\\]/g, '').slice(0, 160);
    res.set('Content-Type', image.mime_type);
    res.set('Content-Disposition', `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error('AI render download failed:', error.message);
    return res.status(502).send('Download unavailable. Please try again.');
  }
});

router.post('/', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.session?.user?.id) return res.status(401).json({ success: false, error: 'Sign in to render an image.' });
  try {
    const entitlements = await getUserEntitlements(req.session.user.id);
    if (!entitlements.features.exports) return res.status(403).json({ success: false, code: 'EXPORT_UPGRADE_REQUIRED', error: 'Upgrade to Pro or above to export your designs.', upgradeUrl: '/pricing' });
  } catch (error) {
    return res.status(503).json({ success: false, error: 'Export access could not be verified. Please try again.' });
  }

  let source;
  try { source = parseImageDataUrl(req.body?.image, 'Model screenshot'); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
  if (!['image/png', 'image/jpeg'].includes(source.contentType)) return res.status(400).json({ success: false, error: 'A PNG or JPEG model screenshot is required.' });
  if (source.size > MAX_SOURCE_BYTES) return res.status(413).json({ success: false, error: 'The screenshot is too large. Choose a smaller image size.' });
  try {
    const outputSize = ['1024x1024', '1024x1536', '1536x1024'].includes(req.body?.outputSize) ? req.body.outputSize : 'auto';
    const backgroundMode = source.contentType === 'image/png' && ['transparent', 'auto'].includes(req.body?.backgroundMode) ? req.body.backgroundMode : 'opaque';
    const input = {
      prompt: PROMPT,
      images: [req.body.image],
      quality: 'low',
      size: outputSize,
      background: backgroundMode,
      output_format: 'png'
    };
    let payload;
    const gatewayId = globalThis.__WORKER_ENV__?.CF_AI_GATEWAY_ID || process.env.CF_AI_GATEWAY_ID || 'default';
    if (globalThis.__WORKER_ENV__?.AI?.run) {
      payload = await globalThis.__WORKER_ENV__.AI.run(MODEL, input, { gateway: { id: gatewayId } });
    } else {
      const accountId = globalThis.__WORKER_ENV__?.CF_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
      const apiToken = globalThis.__WORKER_ENV__?.CF_AI_API_TOKEN || process.env.CF_AI_API_TOKEN || globalThis.__WORKER_ENV__?.CF_API_TOKEN || process.env.CF_API_TOKEN;
      if (!accountId || !apiToken) return res.status(503).json({ success: false, error: 'Cloudflare AI is not configured yet.' });
      const response = await fetchCloudflareAi(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json', 'cf-aig-gateway-id': gatewayId },
        body: JSON.stringify({ model: MODEL, input }),
        signal: AbortSignal.timeout(180000)
      });
      payload = await response.json().catch(() => null);
      if (!response.ok) {
        const providerError = payload?.errors?.[0];
        const requestId = response.headers.get('cf-ray') || undefined;
        const billingUnavailable = response.status === 402 || (response.status === 503 && providerError?.code === 7005);
        console.error('Cloudflare AI export failed:', { status: response.status, code: providerError?.code, message: providerError?.message, requestId });
        return res.status(billingUnavailable ? 503 : 502).json({
          success: false,
          code: billingUnavailable ? 'AI_PROVIDER_UNAVAILABLE' : 'AI_RENDER_FAILED',
          error: billingUnavailable ? 'AI rendering is temporarily unavailable. Please try again later.' : 'AI rendering failed. Please try again.',
          requestId
        });
      }
    }
    if (payload?.success === false) throw new Error(payload.errors?.[0]?.message || 'Cloudflare AI rejected the image.');
    const envelope = Object.prototype.hasOwnProperty.call(payload || {}, 'success') ? payload.result : payload;
    if (envelope?.state && !['completed', 'complete', 'succeeded', 'success'].includes(String(envelope.state).toLowerCase())) throw new Error(`AI rendering did not complete (${envelope.state}).`);
    const output = envelope?.result?.image || envelope?.image || envelope?.result?.url;
    if (!output || typeof output !== 'string') throw new Error('Cloudflare AI did not return an image.');
    let imageDataUrl = output;
    if (/^https:\/\//i.test(output)) {
      const imageResponse = await fetch(output, { signal: AbortSignal.timeout(30000) });
      if (!imageResponse.ok) throw new Error(`Rendered image could not be retrieved (${imageResponse.status}).`);
      const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
      if (imageBytes.length > 10 * 1024 * 1024) throw new Error('Rendered image is too large.');
      const contentType = String(imageResponse.headers.get('content-type') || 'image/png').split(';')[0];
      imageDataUrl = `data:${contentType};base64,${imageBytes.toString('base64')}`;
    } else if (!output.startsWith('data:image/')) {
      imageDataUrl = `data:image/png;base64,${output}`;
    }
    const access = await canStoreImage(req.session.user.id, Buffer.from(imageDataUrl.split(',')[1] || '', 'base64').length);
    if (!access.allowed) return res.status(403).json(limitError('storage', access.entitlements));
    await ensureUserContentTables();
    const id = randomUUID();
    const slug = String(req.body?.modelSlug || 'design').replace(/[^a-z0-9_-]/gi, '-').slice(0, 60) || 'design';
    const layout = String(req.body?.layout || 'render').replace(/[^a-z0-9_-]/gi, '-').slice(0, 30) || 'render';
    const now = new Date();
    const keyBase = `users/${req.session.user.id}/images/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/ai-render-export/${id}`;
    const uploaded = await uploadImageDataUrl(imageDataUrl, { keyBase, label: 'AI rendered image' });
    const filename = `${slug}-${layout}-ai.${uploaded.contentType === 'image/jpeg' ? 'jpg' : uploaded.contentType === 'image/webp' ? 'webp' : 'png'}`;
    try {
      await db.run("INSERT INTO user_images (id, user_id, storage_key, url, original_name, mime_type, size_bytes, purpose) VALUES (?, ?, ?, ?, ?, ?, ?, 'ai-render-export')", [id, req.session.user.id, uploaded.key, uploaded.url, filename, uploaded.contentType, uploaded.size]);
    } catch (error) {
      await deleteObject(uploaded.key).catch(() => {});
      throw error;
    }
    return res.json({ success: true, image: { id, url: uploaded.url, name: filename, downloadUrl: `/api/ai-render-export/${id}/download`, createdAt: now.toISOString() } });
  } catch (error) {
    console.error('AI export request failed:', error.message);
    if (error.status === 402 || /payment error|insufficient balance|wholesale billing service unavailable/i.test(error.message)) {
      return res.status(503).json({ success: false, code: 'AI_PROVIDER_UNAVAILABLE', error: 'AI rendering is temporarily unavailable. Please try again later.' });
    }
    return res.status(502).json({ success: false, error: 'AI rendering is unavailable. Please try again.' });
  }
});

module.exports = router;
