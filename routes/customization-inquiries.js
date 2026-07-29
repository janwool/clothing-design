const express = require('express');
const db = require('../lib/db');
const { validateInquiryPayload } = require('../lib/customization-inquiry');
const { ensureCustomizationInquiriesTable } = require('../lib/customization-inquiries-db');
const { deleteObject, uploadImageDataUrl } = require('../lib/object-storage');

const router = express.Router();
const submissionWindows = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 5;

function createReferenceCode() {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const randomPart = uuid.replace(/-/g, '').slice(-8).toUpperCase();
  return `CUSTOM-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
}

function checkRateLimit(req) {
  const key = String(req.ip || req.headers['cf-connecting-ip'] || 'unknown');
  const now = Date.now();
  const active = (submissionWindows.get(key) || []).filter(timestamp => now - timestamp < WINDOW_MS);
  if (active.length >= MAX_SUBMISSIONS_PER_WINDOW) return false;
  active.push(now);
  submissionWindows.set(key, active);
  return true;
}

function getStoragePrefix(referenceCode) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `object-file/customization-inquiries/${year}/${month}/${referenceCode.toLowerCase()}`;
}

router.post('/', async (req, res) => {
  const parsed = validateInquiryPayload(req.body);
  if (parsed.value.website) {
    return res.json({
      success: true,
      referenceCode: 'CUSTOM-RECEIVED',
      message: 'Your request has been received. We will reply within 3 business days.'
    });
  }
  if (!parsed.valid) {
    return res.status(400).json({ success: false, error: parsed.errors[0], errors: parsed.errors });
  }
  if (!checkRateLimit(req)) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please wait a few minutes and try again.'
    });
  }

  const inquiry = parsed.value;
  const referenceCode = createReferenceCode();
  const prefix = getStoragePrefix(referenceCode);
  const uploadedKeys = [];

  try {
    const snapshot3d = await uploadImageDataUrl(inquiry.snapshot3d, {
      keyBase: `${prefix}/design-3d`,
      label: '3D design screenshot'
    });
    uploadedKeys.push(snapshot3d.key);
    const snapshot2d = await uploadImageDataUrl(inquiry.snapshot2d, {
      keyBase: `${prefix}/design-2d`,
      label: '2D design screenshot'
    });
    uploadedKeys.push(snapshot2d.key);

    const schema = await ensureCustomizationInquiriesTable();
    const commonValues = [
      referenceCode,
      inquiry.modelId,
      inquiry.modelSlug,
      inquiry.modelName || inquiry.modelSlug,
      inquiry.name,
      inquiry.email
    ];
    const trailingValues = [
      inquiry.quantity,
      inquiry.notes,
      snapshot3d.url,
      snapshot3d.key,
      snapshot2d.url,
      snapshot2d.key,
      inquiry.sourceUrl,
      'pending'
    ];
    const result = schema.hasLegacyContactColumns
      ? await db.run(
        `INSERT INTO customization_inquiries (
          reference_code, model_id, model_slug, model_name,
          contact_name, email, phone, company, preferred_contact,
          quantity, notes, snapshot_3d_url, snapshot_3d_key,
          snapshot_2d_url, snapshot_2d_key, source_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...commonValues, '', null, 'email', ...trailingValues]
      )
      : await db.run(
        `INSERT INTO customization_inquiries (
          reference_code, model_id, model_slug, model_name,
          contact_name, email, quantity, notes,
          snapshot_3d_url, snapshot_3d_key,
          snapshot_2d_url, snapshot_2d_key, source_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...commonValues, ...trailingValues]
      );

    return res.status(201).json({
      success: true,
      id: result.lastID,
      referenceCode,
      message: 'Your request has been received. We will reply within 3 business days. Please watch your email messages.'
    });
  } catch (error) {
    await Promise.all(uploadedKeys.map(key => deleteObject(key).catch(() => {})));
    console.error('Customization inquiry submission failed:', error);
    return res.status(error.status || 500).json({
      success: false,
      error: error.status ? error.message : 'We could not submit your request. Please try again.'
    });
  }
});

module.exports = router;
