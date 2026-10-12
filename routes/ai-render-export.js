const express = require('express');
const { Buffer } = require('node:buffer');
const { randomUUID } = require('node:crypto');
const db = require('../lib/db');
const { uploadImageDataUrl, deleteObject, parseImageDataUrl } = require('../lib/object-storage');
const { fetchCloudflareAi } = require('../lib/cloudflare-ai-fetch');
const { ensureUserContentTables } = require('../lib/user-content-db');
const { canStoreImage, getUserEntitlements, limitError, reserveDesignCredits, releaseTryOnCredit, AI_DESIGN_CREDIT_COST } = require('../lib/user-entitlements');

const router = express.Router();
const MODEL = 'openai/gpt-image-2.5-sunburst';
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const PROMPT = `Create a premium ecommerce studio product photograph by refining the supplied 3D apparel image. Treat the input as the definitive product, composition, and background reference. Keep exactly the same garments, number of views, arrangement, viewpoint, crop, silhouette, proportions, fit, hem, neckline, sleeves, colors, material pattern, stitching, and all user-added artwork. Preserve every printed logo, letter, graphic, and its placement without redrawing or inventing details. Keep the background exactly as supplied, including its color, gradient, or transparency; do not replace it with a scene. Make the garments look physically real and ready for a high-end retail product page: natural fabric grain and drape, precise seams and edges, realistic folds, clean tonal separation, controlled soft studio key and fill light, subtle contact shadows where the background is opaque, accurate whites, and crisp but natural detail. Use neutral product-photography color grading. Avoid a plastic, waxy, airbrushed, illustrated, or oversharpened appearance. Do not add people, mannequins, hangers, props, labels, watermarks, new graphics, or any background objects. If a detail is unclear, retain the input appearance rather than changing the design.`;

async function generateImage(input) {
  const model = globalThis.__WORKER_ENV__?.AI_DESIGN_IMAGE_MODEL || process.env.AI_DESIGN_IMAGE_MODEL || MODEL;
  let payload;
  const gatewayId = globalThis.__WORKER_ENV__?.CF_AI_GATEWAY_ID || process.env.CF_AI_GATEWAY_ID || 'default';
  if (globalThis.__WORKER_ENV__?.AI?.run) {
    payload = await globalThis.__WORKER_ENV__.AI.run(model, input, { gateway: { id: gatewayId } });
  } else {
    const accountId = globalThis.__WORKER_ENV__?.CF_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
    const apiToken = globalThis.__WORKER_ENV__?.CF_AI_API_TOKEN || process.env.CF_AI_API_TOKEN || globalThis.__WORKER_ENV__?.CF_API_TOKEN || process.env.CF_API_TOKEN;
    if (!accountId || !apiToken) { const error = new Error('Image rendering is unavailable.'); error.status = 503; throw error; }
    const response = await fetchCloudflareAi(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json', 'cf-aig-gateway-id': gatewayId },
      body: JSON.stringify({ model, input }),
      signal: AbortSignal.timeout(180000)
    });
    payload = await response.json().catch(() => null);
    if (!response.ok) {
      const providerError = payload?.errors?.[0];
      const requestId = response.headers.get('cf-ray') || undefined;
      const billingUnavailable = response.status === 402 || (response.status === 503 && providerError?.code === 7005);
      console.error('Cloudflare AI export failed:', { status: response.status, code: providerError?.code, message: providerError?.message, requestId });
      const error = new Error(billingUnavailable ? 'Image rendering is temporarily unavailable.' : 'Image rendering failed.');
      error.status = billingUnavailable ? 503 : 502;
      throw error;
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

  const parsed = parseImageDataUrl(imageDataUrl, 'Generated image');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(parsed.contentType) || parsed.size > 10 * 1024 * 1024) throw new Error('Invalid generated image.');
  return imageDataUrl;
}

const displayName = name => String(name || 'render.png').replace(/-ai(?=\.(?:png|jpe?g|webp)$)/i, '-render');

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.session?.user?.id) return res.status(401).json({ success: false, error: 'Sign in to view downloads.' });
  try {
    await ensureUserContentTables();
    const rows = await db.all("SELECT id, url, original_name, mime_type, size_bytes, created_at FROM user_images WHERE user_id = ? AND purpose = 'ai-render-export' ORDER BY created_at DESC LIMIT 100", [req.session.user.id]);
    return res.json({ success: true, images: rows.map(row => ({ id: row.id, url: row.url, name: displayName(row.original_name), mimeType: row.mime_type, size: Number(row.size_bytes), createdAt: row.created_at, downloadUrl: `/api/ai-render-export/${row.id}/download` })) });
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
    const filename = displayName(image.original_name).replace(/[\r\n"\\]/g, '').slice(0, 160);
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
  const designMode = req.body?.mode === 'design';
  try {
    const entitlements = await getUserEntitlements(req.session.user.id);
    if (!designMode && !entitlements.features.exports) return res.status(403).json({ success: false, code: 'EXPORT_UPGRADE_REQUIRED', error: 'Upgrade to Pro or above to export your designs.', upgradeUrl: '/pricing' });
  } catch (error) {
    return res.status(503).json({ success: false, error: 'Export access could not be verified. Please try again.' });
  }

  const designPrompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (designMode && (!designPrompt || designPrompt.length > 1000)) {
    return res.status(400).json({ success: false, error: 'Describe your design in 1–1,000 characters.' });
  }

  let source;
  try { source = parseImageDataUrl(req.body?.image, 'Model screenshot'); }
  catch (error) { return res.status(400).json({ success: false, error: error.message }); }
  if (!['image/png', 'image/jpeg'].includes(source.contentType)) return res.status(400).json({ success: false, error: 'A PNG or JPEG model screenshot is required.' });
  if (source.size > MAX_SOURCE_BYTES) return res.status(413).json({ success: false, error: 'The screenshot is too large. Choose a smaller image size.' });
  const referenceImages = designMode ? (req.body?.referenceImages ?? []) : [];
  if (!Array.isArray(referenceImages) || referenceImages.length > 4) {
    return res.status(400).json({ success: false, error: 'Attach up to 4 reference images.' });
  }
  const textureMode = designMode && req.body?.target === 'texture';
  let uvTemplate;
  let context;
  let totalBytes = source.size;
  if (textureMode) {
    try {
      const template = parseImageDataUrl(req.body.uvTemplate, 'Garment template');
      uvTemplate = req.body.uvTemplate;
      totalBytes += template.size;
      context = req.body.designContext;
      if (!context || !Array.isArray(context.panels) || !context.panels.length || context.panels.length > 512 || !Array.isArray(context.colorViews) || context.colorViews.length !== 4) throw new Error('Current garment mapping context is required.');
      const directions = ['front', 'back', 'left', 'right'];
      if (context.colorViews.some((view, index) => view.view !== directions[index])) throw new Error('Four garment mapping views are required.');
      if (context.panels.some(panel => !Number.isInteger(panel.id) || !/^#[a-f0-9]{6}$/i.test(panel.color)) || new Set(context.panels.map(panel => panel.id)).size !== context.panels.length || new Set(context.panels.map(panel => panel.color)).size !== context.panels.length) throw new Error('Invalid garment panel colors.');
      context = { panels: context.panels.map(({id, color}) => ({id, color})), whiteViews: context.whiteViews, colorViews: context.colorViews };
      for (const image of [context.whiteViews?.front, context.whiteViews?.back, ...context.colorViews.map(view => view.image)]) {
        const parsed = parseImageDataUrl(image, 'Garment view');
        if (!['image/png', 'image/jpeg'].includes(parsed.contentType)) throw new Error('Garment views must be PNG or JPEG.');
        totalBytes += parsed.size;
      }
      if (template.contentType !== 'image/png') throw new Error('Garment mapping atlas must be PNG.');
    } catch (error) { return res.status(400).json({ success: false, error: error.message }); }
  }
  try {
    for (const image of referenceImages) {
      const reference = parseImageDataUrl(image, 'Reference image');
      if (reference.size > 5 * 1024 * 1024) return res.status(413).json({ success: false, error: 'Each reference image must be no larger than 5 MB.' });
      totalBytes += reference.size;
    }
    if (totalBytes > 9 * 1024 * 1024) return res.status(413).json({ success: false, error: 'The combined images are too large. Choose smaller reference images.' });
  } catch (error) { return res.status(400).json({ success: false, error: error.message }); }
  let creditReservation;
  let generationCompleted = false;
  try {
    if (designMode) {
      creditReservation = await reserveDesignCredits(req.session.user.id);
      if (!creditReservation.allowed) return res.status(403).json({ success: false, code: 'INSUFFICIENT_CREDITS', error: `You need ${AI_DESIGN_CREDIT_COST} credits to generate a design.`, creditsRequired: AI_DESIGN_CREDIT_COST, upgradeUrl: '/pricing' });
    }
    const backgroundMode = source.contentType === 'image/png' && ['transparent', 'auto'].includes(req.body?.backgroundMode) ? req.body.backgroundMode : 'opaque';
    const input = {
      prompt: designMode
        ? `Create a realistic apparel design concept using image 1 as the garment reference. ${referenceImages.length ? "Images 2 onward are design references, numbered Reference 1 onward in the brief. Use their artwork, palettes or finishes as directed by the brief, while retaining the garment silhouette and viewpoint from image 1. Do not copy their backgrounds or change the garment type." : ""} Keep the same garment type, silhouette, proportions, viewpoint and studio background. Change colors, prints, materials and finishes according to the following design brief. Do not add people, props or extra garments. Preserve any existing watermark. The output is a product concept photograph, not a sewing pattern. Design brief: ${designPrompt}`
        : PROMPT,
      images: [req.body.image, ...referenceImages],
      quality: 'low',
      size: '1024x1024',
      background: backgroundMode,
      output_format: 'png'
    };
    let conceptDataUrl;
    let imageDataUrl;
    if (textureMode) {
      conceptDataUrl = await generateImage({ ...input, prompt: `Design the garment shown in the first two images (front and back white model), keeping its exact geometry, fit, construction and both viewpoints. Image 3 shows the current design; retain its unspecified elements when the brief requests an edit. Images 4 onward are user references, numbered Reference 1 onward. Render matching front and back designs together on a plain studio background. Keep typography integrated with artwork, including the exact requested wording. Keep chest graphics clear of pockets and seams. Do not add garment parts, people or props. User brief: ${designPrompt}`, images: [context.whiteViews.front, context.whiteViews.back, req.body.image, ...referenceImages] });
      imageDataUrl = await generateImage({ ...input, images: [conceptDataUrl, uvTemplate, ...context.colorViews.map(view => view.image)], prompt: `Reconstruct the design in image 1 as a flat garment UV color atlas. Image 2 is the exact color-coded UV layout. Subsequent images show that same color-coded garment from these directions: ${context.colorViews.map(view => view.view).join(', ')}. Infer each island's garment part AND print rotation from its color in those actual 3D views; never assume a standard UV layout or assign parts by atlas location. Arrows indicate local template direction. Compare the SAME arrows in the atlas and on the 3D views to determine print rotation. Remove all guide arrows and guide colors from the final design. Any gaps, bands or edges in the mapping guide are technical references, not garment artwork: do not copy them as stripes or borders unless the user explicitly requests that design. Panel color legend: ${JSON.stringify(context.panels)}. Preserve image 2 canvas aspect, panel outlines, sizes, placement and empty areas exactly. Transfer ALL garment parts, including any front/back, sleeves, pocket, collar, hood or trim present, from the concept. Place text and artwork as a single integrated design, oriented correctly after UV mapping. Keep artwork away from physical pockets and seam occlusion. Do not add labels, color codes, shadows, perspective garments or lighting. Fill all islands and allow a small matching-color bleed at their edges. Produce ONLY the full flat texture atlas. User brief: ${designPrompt}` });
    } else {
      imageDataUrl = await generateImage(input);
    }
    const access = await canStoreImage(req.session.user.id, Buffer.from(imageDataUrl.split(',')[1] || '', 'base64').length);
    if (!access.allowed) return res.status(403).json(limitError('storage', access.entitlements));
    await ensureUserContentTables();
    const id = randomUUID();
    const slug = String(req.body?.modelSlug || 'design').replace(/[^a-z0-9_-]/gi, '-').slice(0, 60) || 'design';
    const layout = String((textureMode ? 'design-texture' : designMode ? 'design-concept' : req.body?.layout) || 'render').replace(/[^a-z0-9_-]/gi, '-').slice(0, 30) || 'render';
    const now = new Date();
    const keyBase = `users/${req.session.user.id}/images/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/ai-render-export/${id}`;
    const uploaded = await uploadImageDataUrl(imageDataUrl, { keyBase, label: 'Rendered product image' });
    const filename = `${slug}-${layout}-render.${uploaded.contentType === 'image/jpeg' ? 'jpg' : uploaded.contentType === 'image/webp' ? 'webp' : 'png'}`;
    try {
      await db.run("INSERT INTO user_images (id, user_id, storage_key, url, original_name, mime_type, size_bytes, purpose) VALUES (?, ?, ?, ?, ?, ?, ?, 'ai-render-export')", [id, req.session.user.id, uploaded.key, uploaded.url, filename, uploaded.contentType, uploaded.size]);
    } catch (error) {
      await deleteObject(uploaded.key).catch(() => {});
      throw error;
    }
    generationCompleted = true;
    return res.json({ success: true, ...(designMode ? { usage: { creditsCharged: AI_DESIGN_CREDIT_COST, creditsRemaining: creditReservation.remaining } } : {}), image: { id, url: uploaded.url, name: filename, downloadUrl: `/api/ai-render-export/${id}/download`, createdAt: now.toISOString(), ...(textureMode ? { textureUrl: uploaded.url, textureDataUrl: imageDataUrl, conceptDataUrl, workflow: 'concept-to-uv' } : {}) } });
  } catch (error) {
    console.error('AI export request failed:', error.message);
    if (error.status === 503 || error.status === 402 || /payment error|insufficient balance|wholesale billing service unavailable/i.test(error.message)) {
      return res.status(503).json({ success: false, code: 'AI_PROVIDER_UNAVAILABLE', error: 'Image rendering is temporarily unavailable. Please try again later.' });
    }
    return res.status(502).json({ success: false, error: 'Image rendering is unavailable. Please try again.' });
  } finally {
    if (!generationCompleted && creditReservation?.reservation) {
      await releaseTryOnCredit(creditReservation.reservation).catch(error => {
        console.error('AI design credit refund failed:', error.message);
      });
    }
  }
});

module.exports = router;
