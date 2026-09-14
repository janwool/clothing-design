const express = require('express');
const { randomUUID } = require('node:crypto');
const db = require('../lib/db');
const { runCloudflareTryOn } = require('../lib/cloudflare-try-on');
const { deleteObject, uploadImageDataUrl } = require('../lib/object-storage');
const { ensureUserContentTables } = require('../lib/user-content-db');
const { isAiTryOnEnabled } = require('../lib/feature-flags');
const {
  canStoreImage,
  getUserEntitlements,
  imageDataUrlBytes,
  limitError,
  releaseTryOnCredit,
  reserveTryOnCredit
} = require('../lib/user-entitlements');

const router = express.Router();
const MAX_IMAGE_DATA_LENGTH = 6 * 1024 * 1024;
const isWorkerRuntime = Boolean(globalThis.__WORKER_ENV__) || process.env.CF_WORKER === 'true';
const imageData = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\r\n]+$/i;

router.use((req, res, next) => {
  if (isAiTryOnEnabled()) return next();
  res.set('Cache-Control', 'no-store');
  return res.status(503).json({
    success: false,
    error: 'AI try-on is temporarily unavailable.'
  });
});

function validImageData(value) {
  return typeof value === 'string' &&
    value.length <= MAX_IMAGE_DATA_LENGTH &&
    imageData.test(value);
}

function cleanResultLabel(value, fallback) {
  return String(value || fallback).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || fallback;
}

function cleanIdentifier(value, maxLength = 160) {
  return String(value || '').replace(/[^a-z0-9_-]/gi, '').slice(0, maxLength) || null;
}

function cleanProjectId(value) {
  return /^[a-f0-9-]{36}$/i.test(String(value || '')) ? String(value) : null;
}

function resultStorageBase(userId, resultId, now = new Date()) {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `users/${userId}/images/${now.getUTCFullYear()}/${month}/try-on-result/${resultId}`;
}

async function saveTryOnResult(userId, image, metadata = {}) {
  await ensureUserContentTables();
  const storageAccess = await canStoreImage(userId, imageDataUrlBytes(image));
  if (!storageAccess.allowed) {
    const error = new Error(limitError('storage', storageAccess.entitlements).error);
    error.status = 403;
    throw error;
  }

  const resultId = randomUUID();
  const modelName = cleanResultLabel(metadata.modelName, '3D garment');
  const personName = cleanResultLabel(metadata.personModelName, 'Model');
  let uploaded;
  try {
    uploaded = await uploadImageDataUrl(image, {
      keyBase: resultStorageBase(userId, resultId),
      label: 'AI try-on result'
    });
    const originalName = `${modelName} — ${personName} AI Try-on.${uploaded.contentType === 'image/png' ? 'png' : uploaded.contentType === 'image/jpeg' ? 'jpg' : 'webp'}`;
    await db.run(
      `INSERT INTO user_images (id, user_id, storage_key, url, original_name, mime_type, size_bytes, purpose)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'try-on-result')`,
      [resultId, userId, uploaded.key, uploaded.url, originalName, uploaded.contentType, uploaded.size]
    );
    await db.run(
      `INSERT INTO ai_try_on_results
       (id, user_id, image_id, model_id, model_slug, model_name, source_project_id,
        person_model_id, person_model_name, ai_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resultId,
        userId,
        resultId,
        cleanIdentifier(metadata.modelId),
        cleanIdentifier(metadata.modelSlug),
        modelName,
        cleanProjectId(metadata.projectId),
        cleanIdentifier(metadata.personModelId, 80),
        personName,
        metadata.aiModel || 'pruna/p-image-try-on'
      ]
    );
    return {
      id: resultId,
      url: uploaded.url,
      name: originalName,
      mimeType: uploaded.contentType,
      size: uploaded.size,
      purpose: 'try-on-result'
    };
  } catch (error) {
    if (uploaded?.key) {
      await db.run('DELETE FROM user_images WHERE id = ? AND user_id = ?', [resultId, userId]).catch(() => {});
      await deleteObject(uploaded.key).catch(() => {});
    }
    throw error;
  }
}

router.get('/results', async (req, res) => {
  if (!req.session?.user?.id) {
    return res.status(401).json({ success: false, error: 'Sign in to view AI try-on results.' });
  }
  try {
    await ensureUserContentTables();
    const rows = await db.all(
      `SELECT r.id, r.model_id, r.model_slug, r.model_name, r.source_project_id,
              r.person_model_id, r.person_model_name, r.ai_model, r.created_at,
              i.url, i.mime_type, i.size_bytes
       FROM ai_try_on_results r
       JOIN user_images i ON i.id = r.image_id AND i.user_id = r.user_id
       WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 100`,
      [req.session.user.id]
    );
    return res.json({
      success: true,
      results: rows.map(row => ({
        id: row.id,
        imageUrl: row.url,
        mimeType: row.mime_type,
        size: Number(row.size_bytes) || 0,
        modelId: row.model_id,
        modelSlug: row.model_slug,
        modelName: row.model_name,
        sourceProjectId: row.source_project_id,
        personModelId: row.person_model_id,
        personModelName: row.person_model_name,
        aiModel: row.ai_model,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    console.error('AI try-on result list failed:', error.message);
    return res.status(500).json({ success: false, error: 'AI try-on results could not be loaded.' });
  }
});

router.post('/', async (req, res) => {
  if ((isWorkerRuntime || process.env.NODE_ENV === 'production') && !req.session?.user) {
    return res.status(401).json({
      success: false,
      error: 'Sign in to generate an AI try-on.'
    });
  }

  const personImage = req.body?.personImage;
  const garmentImage = req.body?.garmentImage;
  if (!validImageData(personImage) || !validImageData(garmentImage)) {
    return res.status(400).json({
      success: false,
      error: 'A PNG, JPEG, or WebP person photo and 3D garment capture are required.'
    });
  }

  res.set('Cache-Control', 'no-store');
  let creditReservation = null;
  let generationCompleted = false;
  try {
    if (req.session?.user?.id) {
      const creditAccess = await reserveTryOnCredit(req.session.user.id);
      if (!creditAccess.allowed) {
        const entitlements = await getUserEntitlements(req.session.user.id);
        return res.status(403).json(limitError('tryOnCredits', entitlements));
      }
      creditReservation = creditAccess;
    }
    const result = await runCloudflareTryOn({ personImage, garmentImage });
    generationCompleted = true;
    const savedResult = req.session?.user?.id
      ? await saveTryOnResult(req.session.user.id, result.image, {
        modelId: req.body?.modelId,
        modelSlug: req.body?.modelSlug,
        modelName: req.body?.modelName,
        projectId: req.body?.projectId,
        personModelId: req.body?.personModelId,
        personModelName: req.body?.personModelName,
        aiModel: result.model
      })
      : null;
    return res.json({
      success: true,
      ...result,
      image: savedResult?.url || result.image,
      savedResult,
      usage: creditReservation
        ? { tryOnCreditsRemaining: creditReservation.remaining }
        : undefined
    });
  } catch (error) {
    if (!generationCompleted && creditReservation?.reservation) {
      await releaseTryOnCredit(creditReservation.reservation).catch(refundError => {
        console.error('Try-on credit refund failed:', refundError.message);
      });
    }
    console.error('Cloudflare AI try-on failed:', error.message);
    return res.status(error.status || 502).json({
      success: false,
      error: error.message || 'AI try-on failed. Please try again.'
    });
  }
});

module.exports = router;
module.exports.saveTryOnResult = saveTryOnResult;
