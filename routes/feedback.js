const express = require('express');
const db = require('../lib/db');
const { validateFeedbackPayload } = require('../lib/feedback');
const { ensureFeedbackTable } = require('../lib/feedback-db');

const router = express.Router();
const submissionWindows = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 5;

function checkRateLimit(req) {
  const identity = req.session?.user?.id || req.headers['cf-connecting-ip'] || req.ip || 'unknown';
  const key = String(identity);
  const now = Date.now();
  const active = (submissionWindows.get(key) || []).filter(timestamp => now - timestamp < WINDOW_MS);
  if (active.length >= MAX_SUBMISSIONS_PER_WINDOW) return false;
  active.push(now);
  submissionWindows.set(key, active);
  return true;
}

router.post('/', async (req, res) => {
  const parsed = validateFeedbackPayload(req.body, req.session?.user || null);

  if (parsed.value.website) {
    return res.status(201).json({ success: true, message: 'Thanks — your feedback has been sent.' });
  }
  if (!parsed.valid) {
    return res.status(400).json({ success: false, error: parsed.errors[0], errors: parsed.errors });
  }
  if (!checkRateLimit(req)) {
    return res.status(429).json({ success: false, error: 'Please wait a few minutes before sending more feedback.' });
  }

  try {
    await ensureFeedbackTable();
    const result = await db.run(
      `INSERT INTO feedback_submissions (user_id, email, message, source_url, status)
       VALUES (?, ?, ?, ?, 'new')`,
      [req.session?.user?.id || null, parsed.value.email, parsed.value.message, parsed.value.sourceUrl || null]
    );
    return res.status(201).json({
      success: true,
      id: result.lastID,
      message: 'Thanks — your feedback has been sent.'
    });
  } catch (error) {
    console.error('Feedback submission failed:', error);
    return res.status(500).json({ success: false, error: 'Feedback could not be sent. Please try again.' });
  }
});

module.exports = router;
