const express = require('express');
const { runCloudflareTryOn } = require('../lib/cloudflare-try-on');
const {
  getUserEntitlements,
  limitError,
  releaseTryOnCredit,
  reserveTryOnCredit
} = require('../lib/user-entitlements');

const router = express.Router();
const MAX_IMAGE_DATA_LENGTH = 6 * 1024 * 1024;
const isWorkerRuntime = Boolean(globalThis.__WORKER_ENV__) || process.env.CF_WORKER === 'true';
const imageData = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\r\n]+$/i;

function validImageData(value) {
  return typeof value === 'string' &&
    value.length <= MAX_IMAGE_DATA_LENGTH &&
    imageData.test(value);
}

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
    return res.json({
      success: true,
      ...result,
      usage: creditReservation
        ? { tryOnCreditsRemaining: creditReservation.remaining }
        : undefined
    });
  } catch (error) {
    if (creditReservation?.reservation) {
      await releaseTryOnCredit(creditReservation.reservation).catch(refundError => {
        console.error('Try-on credit refund failed:', refundError.message);
      });
    }
    console.error('Cloudflare AI try-on failed:', error.message);
    return res.status(502).json({
      success: false,
      error: error.message || 'AI try-on failed. Please try again.'
    });
  }
});

module.exports = router;
