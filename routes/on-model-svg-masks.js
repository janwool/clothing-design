const express = require('express');
const {
  getOnModelMockupSvgMask,
  saveOnModelMockupSvgMask
} = require('../lib/on-model-mockups');
const { validateSvgMaskData } = require('../lib/svg-mask-data');

const router = express.Router();
const isWorkerRuntime = Boolean(globalThis.__WORKER_ENV__) || process.env.CF_WORKER === 'true';

function normalizedAssetName(value) {
  const assetName = String(value || '').trim();
  return /^[a-z0-9][a-z0-9-]{1,180}$/i.test(assetName) ? assetName : '';
}

function canApplyMask(req) {
  if (req.session?.user) return true;
  if (isWorkerRuntime) return false;
  return ['localhost', '127.0.0.1', '::1'].includes(String(req.hostname || '').toLowerCase());
}

router.get('/:assetName.svg', async (req, res) => {
  const assetName = normalizedAssetName(req.params.assetName);
  if (!assetName) return res.status(400).type('text/plain').send('Invalid mask asset name.');
  try {
    const record = await getOnModelMockupSvgMask(assetName);
    if (!record) return res.status(404).type('text/plain').send('SVG mask not found.');
    res.set('Content-Type', 'image/svg+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.send(record.svg_data);
  } catch (error) {
    console.error('SVG mask read failed:', error);
    return res.status(500).type('text/plain').send(`SVG mask could not be loaded: ${error?.message || 'Unknown error'}`);
  }
});

router.put('/:assetName', async (req, res) => {
  if (!canApplyMask(req)) {
    return res.status(401).json({ success: false, error: 'Sign in before applying a production mask.' });
  }
  if (String(req.headers['x-requested-with'] || '') !== 'SVGMaskEditor') {
    return res.status(403).json({ success: false, error: 'Invalid mask editor request.' });
  }
  const assetName = normalizedAssetName(req.params.assetName);
  if (!assetName) return res.status(400).json({ success: false, error: 'Invalid mask asset name.' });

  try {
    const mask = validateSvgMaskData(req.body?.svgData);
    const record = await saveOnModelMockupSvgMask({
      assetName,
      svgData: mask.svgData,
      width: mask.width,
      height: mask.height,
      regionCount: mask.regionCount,
      nodeCount: mask.nodeCount,
      updatedBy: req.session?.user?.id || null
    });
    if (!record) return res.status(404).json({ success: false, error: 'Mockup asset not found.' });
    return res.json({
      success: true,
      assetName,
      maskUrl: `/api/on-model-svg-masks/${encodeURIComponent(assetName)}.svg?v=${encodeURIComponent(record.updated_at || Date.now())}`,
      width: record.canvas_width,
      height: record.canvas_height,
      regionCount: record.region_count,
      nodeCount: record.node_count,
      updatedAt: record.updated_at
    });
  } catch (error) {
    console.error('SVG mask apply failed:', error);
    return res.status(error.status || 500).json({
      success: false,
      error: error.status ? error.message : 'SVG mask could not be saved.'
    });
  }
});

module.exports = router;
