const express = require('express');
const db = require('../lib/db');
const {
  createCreemCheckout,
  extractCreemEventData,
  getAccessForProduct,
  verifyCreemSignature
} = require('../lib/creem-billing');
const { ensureEntitlementTables } = require('../lib/user-entitlements');

const router = express.Router();
const ACTIVE_EVENTS = new Set([
  'checkout.completed',
  'subscription.active',
  'subscription.paid',
  'subscription.trialing',
  'subscription.update',
  'subscription.scheduled_cancel',
  'subscription.past_due'
]);
const INACTIVE_EVENTS = new Set([
  'subscription.canceled',
  'subscription.expired',
  'subscription.paused',
  'refund.created',
  'dispute.created'
]);

function requireUser(req, res, next) {
  if (req.session?.user?.id) return next();
  return res.status(401).json({
    success: false,
    error: 'Sign in before starting a subscription.',
    loginUrl: `/auth/login?next=${encodeURIComponent('/pricing')}`
  });
}

function getPublicOrigin(req) {
  const configured = process.env.APP_BASE_URL || (globalThis.__WORKER_ENV__ && globalThis.__WORKER_ENV__.APP_BASE_URL);
  return String(configured || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function statusForEvent(eventType, subscriptionStatus) {
  if (eventType === 'subscription.trialing') return 'trialing';
  if (eventType === 'subscription.past_due') return 'past_due';
  if (eventType === 'subscription.scheduled_cancel') return 'scheduled_cancel';
  if (eventType === 'subscription.canceled') return 'canceled';
  if (eventType === 'subscription.expired') return 'expired';
  if (eventType === 'subscription.paused') return 'paused';
  if (eventType === 'refund.created') return 'refunded';
  if (eventType === 'dispute.created') return 'disputed';
  if (['active', 'trialing', 'past_due', 'scheduled_cancel'].includes(subscriptionStatus)) return subscriptionStatus;
  return 'active';
}

async function findWebhookUser(data) {
  let user = null;
  if (/^\d+$/.test(data.userId)) {
    user = await db.get('SELECT id, email FROM users WHERE id = ?', [data.userId]);
  }
  if (!user && data.customerEmail) {
    user = await db.get('SELECT id, email FROM users WHERE LOWER(email) = ?', [data.customerEmail]);
  }
  if (user && data.customerEmail && String(user.email || '').toLowerCase() !== data.customerEmail) return null;
  return user;
}

router.post('/checkout', requireUser, async (req, res) => {
  try {
    const origin = getPublicOrigin(req);
    const checkout = await createCreemCheckout({
      plan: req.body?.plan,
      billingInterval: req.body?.billingInterval,
      user: req.session.user,
      successUrl: `${origin}/account?checkout=success`
    });
    res.set('Cache-Control', 'private, no-store');
    return res.json({ success: true, checkoutUrl: checkout.checkoutUrl });
  } catch (error) {
    console.error('Creem checkout failed:', error.message);
    return res.status(error.status || 502).json({
      success: false,
      error: error.status === 503 ? error.message : 'Checkout could not be started. Please try again.'
    });
  }
});

router.post('/webhooks/creem', async (req, res) => {
  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body || {});
  if (!verifyCreemSignature(rawBody, req.get('creem-signature'))) {
    return res.status(401).json({ success: false, error: 'Invalid webhook signature.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    return res.status(400).json({ success: false, error: 'Invalid webhook payload.' });
  }

  const data = extractCreemEventData(event);
  if (!data.eventId || !data.eventType) {
    return res.status(400).json({ success: false, error: 'Webhook event identity is required.' });
  }

  try {
    await ensureEntitlementTables();
    const processed = await db.get('SELECT id FROM billing_webhook_events WHERE id = ?', [data.eventId]);
    if (processed) return res.json({ success: true, duplicate: true });

    const access = getAccessForProduct(data.productId);
    let user = await findWebhookUser(data);
    if (!user && data.subscriptionId) {
      const existing = await db.get(
        `SELECT u.id, u.email FROM user_subscriptions s
         JOIN users u ON u.id = s.user_id WHERE s.provider_subscription_id = ?`,
        [data.subscriptionId]
      );
      user = existing || null;
    }

    if (ACTIVE_EVENTS.has(data.eventType) && access && user) {
      await db.run(
        `INSERT INTO user_subscriptions
         (user_id, plan, billing_interval, status, provider, provider_customer_id,
          provider_subscription_id, provider_product_id, current_period_start, current_period_end)
         VALUES (?, ?, ?, ?, 'creem', ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           plan = excluded.plan,
           billing_interval = excluded.billing_interval,
           status = excluded.status,
           provider = 'creem',
           provider_customer_id = COALESCE(excluded.provider_customer_id, provider_customer_id),
           provider_subscription_id = COALESCE(excluded.provider_subscription_id, provider_subscription_id),
           provider_product_id = excluded.provider_product_id,
           current_period_start = COALESCE(excluded.current_period_start, current_period_start),
           current_period_end = COALESCE(excluded.current_period_end, current_period_end),
           updated_at = CURRENT_TIMESTAMP`,
        [
          user.id,
          access.plan,
          access.billingInterval,
          statusForEvent(data.eventType, data.subscriptionStatus),
          data.customerId || null,
          data.subscriptionId || null,
          access.productId,
          data.periodStart,
          data.periodEnd
        ]
      );
    } else if (INACTIVE_EVENTS.has(data.eventType) && user) {
      await db.run(
        `UPDATE user_subscriptions SET status = ?,
         current_period_end = COALESCE(?, current_period_end), updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [statusForEvent(data.eventType, data.subscriptionStatus), data.periodEnd, user.id]
      );
    }

    await db.run(
      'INSERT OR IGNORE INTO billing_webhook_events (id, event_type) VALUES (?, ?)',
      [data.eventId, data.eventType]
    );
    return res.json({ success: true, applied: Boolean(user && (access || INACTIVE_EVENTS.has(data.eventType))) });
  } catch (error) {
    console.error('Creem webhook failed:', error);
    return res.status(500).json({ success: false, error: 'Webhook processing failed.' });
  }
});

module.exports = router;
