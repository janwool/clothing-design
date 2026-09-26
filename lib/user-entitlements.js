const db = require('./db');
const { ensureUserContentTables } = require('./user-content-db');

const TRY_ON_CREDIT_COST = 10;

const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;

const PLAN_ENTITLEMENTS = Object.freeze({
  free: Object.freeze({
    id: 'free',
    name: 'Free',
    projectLimit: 3,
    projectPeriod: 'lifetime',
    tryOnCredits: 0,
    storageBytes: 20 * MEBIBYTE,
    exports: false,
    removeWatermarks: false,
    allModels: false
  }),
  pro: Object.freeze({
    id: 'pro',
    name: 'Pro',
    projectLimit: null,
    projectPeriod: 'month',
    tryOnCredits: 250,
    storageBytes: null,
    exports: true,
    removeWatermarks: true,
    allModels: true
  }),
  // Legacy subscriptions retain their purchased allowances; Max is no longer sold.
  max: Object.freeze({
    id: 'max',
    name: 'Max',
    projectLimit: 99,
    projectPeriod: 'month',
    tryOnCredits: 1000,
    storageBytes: 100 * GIBIBYTE,
    exports: true,
    removeWatermarks: true,
    allModels: true
  }),
  business: Object.freeze({
    id: 'business',
    name: 'Business',
    projectLimit: null,
    projectPeriod: 'month',
    tryOnCredits: null,
    storageBytes: null,
    exports: true,
    removeWatermarks: true,
    allModels: true
  })
});

let readyPromise;

function ensureEntitlementTables() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.run(`CREATE TABLE IF NOT EXISTS user_subscriptions (
        user_id INTEGER PRIMARY KEY,
        plan TEXT NOT NULL DEFAULT 'free',
        billing_interval TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        provider TEXT,
        provider_customer_id TEXT,
        provider_subscription_id TEXT,
        provider_product_id TEXT,
        current_period_start DATETIME,
        current_period_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);
      const subscriptionColumns = new Set(
        (await db.all('PRAGMA table_info(user_subscriptions)')).map(column => column.name)
      );
      const providerColumns = [
        ['provider', 'TEXT'],
        ['provider_customer_id', 'TEXT'],
        ['provider_subscription_id', 'TEXT'],
        ['provider_product_id', 'TEXT']
      ];
      for (const [column, type] of providerColumns) {
        if (!subscriptionColumns.has(column)) {
          await db.run(`ALTER TABLE user_subscriptions ADD COLUMN ${column} ${type}`);
        }
      }
      await db.run(`CREATE TABLE IF NOT EXISTS user_entitlement_usage (
        user_id INTEGER NOT NULL,
        period_key TEXT NOT NULL,
        try_on_credits_used INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, period_key),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);
      const usageColumns = await db.all('PRAGMA table_info(user_entitlement_usage)');
      if (!usageColumns.some(column => column.name === 'try_on_credits_granted')) {
        await db.run('ALTER TABLE user_entitlement_usage ADD COLUMN try_on_credits_granted INTEGER NOT NULL DEFAULT 0');
      }
      await db.run(`CREATE TABLE IF NOT EXISTS billing_webhook_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
    })().catch(error => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

function normalizePlan(value) {
  const plan = String(value || '').trim().toLowerCase();
  return PLAN_ENTITLEMENTS[plan] ? plan : 'free';
}

function monthWindow(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return {
    key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
    start: start.toISOString().slice(0, 19).replace('T', ' '),
    end: end.toISOString().slice(0, 19).replace('T', ' '),
    resetsAt: end.toISOString()
  };
}

function isActiveSubscription(subscription, now = new Date()) {
  if (!subscription || !['active', 'trialing', 'past_due', 'scheduled_cancel'].includes(String(subscription.status || '').toLowerCase())) return false;
  if (!subscription.current_period_end) return true;
  const periodEnd = new Date(String(subscription.current_period_end).includes('T')
    ? subscription.current_period_end
    : `${subscription.current_period_end}Z`);
  return !Number.isNaN(periodEnd.getTime()) && periodEnd > now;
}

async function getActiveSubscription(userId, now = new Date()) {
  await ensureEntitlementTables();
  const subscription = await db.get('SELECT * FROM user_subscriptions WHERE user_id = ?', [userId]);
  if (!isActiveSubscription(subscription, now)) return null;
  return { ...subscription, plan: normalizePlan(subscription.plan) };
}

function remaining(limit, used) {
  return limit === null ? null : Math.max(0, limit - used);
}

async function getUserEntitlements(userId, now = new Date()) {
  await Promise.all([ensureUserContentTables(), ensureEntitlementTables()]);
  const window = monthWindow(now);
  const subscription = await getActiveSubscription(userId, now);
  const plan = PLAN_ENTITLEMENTS[subscription?.plan || 'free'];
  // Creation allowances include soft-deleted projects; deletion never refunds a creation.
  const [projectUsage, storageUsage, tryOnUsage] = await Promise.all([
    db.get(
      `SELECT COUNT(*) AS total,
       SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS monthly
       FROM design_projects WHERE user_id = ?`,
      [window.start, window.end, userId]
    ),
    db.get('SELECT COALESCE(SUM(size_bytes), 0) AS total FROM user_images WHERE user_id = ?', [userId]),
    db.get('SELECT try_on_credits_used, try_on_credits_granted FROM user_entitlement_usage WHERE user_id = ? AND period_key = ?', [userId, window.key])
  ]);
  const projectsUsed = plan.projectPeriod === 'lifetime'
    ? Number(projectUsage?.total) || 0
    : Number(projectUsage?.monthly) || 0;
  const tryOnCreditsUsed = Number(tryOnUsage?.try_on_credits_used) || 0;
  const grantedCredits = Number(tryOnUsage?.try_on_credits_granted) || 0;
  const creditLimit = plan.tryOnCredits === null ? null : plan.tryOnCredits + grantedCredits;
  const storageBytesUsed = Number(storageUsage?.total) || 0;

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      billingInterval: subscription?.billing_interval || null,
      status: subscription?.status || 'active',
      currentPeriodEnd: subscription?.current_period_end || null
    },
    features: {
      exports: plan.exports,
      removeWatermarks: plan.removeWatermarks,
      allModels: plan.allModels
    },
    projects: {
      period: plan.projectPeriod,
      limit: plan.projectLimit,
      used: projectsUsed,
      remaining: remaining(plan.projectLimit, projectsUsed),
      resetsAt: plan.projectPeriod === 'month' ? window.resetsAt : null
    },
    tryOnCredits: {
      costPerGeneration: TRY_ON_CREDIT_COST,
      period: 'month',
      limit: creditLimit,
      granted: grantedCredits,
      used: tryOnCreditsUsed,
      remaining: remaining(creditLimit, tryOnCreditsUsed),
      resetsAt: window.resetsAt
    },
    storage: {
      limitBytes: plan.storageBytes,
      usedBytes: storageBytesUsed,
      remainingBytes: remaining(plan.storageBytes, storageBytesUsed)
    },
    upgradeUrl: '/pricing'
  };
}

async function canCreateProject(userId, now = new Date()) {
  const entitlements = await getUserEntitlements(userId, now);
  return {
    allowed: entitlements.projects.limit === null || entitlements.projects.remaining > 0,
    entitlements
  };
}

async function canStoreImage(userId, additionalBytes, now = new Date()) {
  const entitlements = await getUserEntitlements(userId, now);
  const bytes = Math.max(0, Number(additionalBytes) || 0);
  return {
    allowed: entitlements.storage.limitBytes === null || entitlements.storage.usedBytes + bytes <= entitlements.storage.limitBytes,
    entitlements
  };
}

async function reserveTryOnCredit(userId, now = new Date()) {
  await ensureEntitlementTables();
  const window = monthWindow(now);
  const subscription = await getActiveSubscription(userId, now);
  const plan = PLAN_ENTITLEMENTS[subscription?.plan || 'free'];
  if (plan.tryOnCredits === null) {
    return { allowed: true, reservation: null, remaining: null, plan: plan.id };
  }
  await db.run(
    `INSERT OR IGNORE INTO user_entitlement_usage (user_id, period_key, try_on_credits_used)
     VALUES (?, ?, 0)`,
    [userId, window.key]
  );
  const result = await db.run(
    `UPDATE user_entitlement_usage
     SET try_on_credits_used = try_on_credits_used + ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND period_key = ? AND try_on_credits_used <= ? + try_on_credits_granted`,
    [TRY_ON_CREDIT_COST, userId, window.key, plan.tryOnCredits - TRY_ON_CREDIT_COST]
  );
  if (!result.changes) {
    return { allowed: false, reservation: null, remaining: 0, plan: plan.id };
  }
  const usage = await db.get(
    'SELECT try_on_credits_used, try_on_credits_granted FROM user_entitlement_usage WHERE user_id = ? AND period_key = ?',
    [userId, window.key]
  );
  const used = Number(usage?.try_on_credits_used) || 0;
  return {
    allowed: true,
    reservation: { userId, periodKey: window.key, amount: TRY_ON_CREDIT_COST },
    remaining: Math.max(0, plan.tryOnCredits + (Number(usage?.try_on_credits_granted) || 0) - used),
    plan: plan.id
  };
}

async function releaseTryOnCredit(reservation) {
  if (!reservation?.userId || !reservation?.periodKey) return;
  await db.run(
    `UPDATE user_entitlement_usage
     SET try_on_credits_used = MAX(0, try_on_credits_used - ?),
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND period_key = ?`,
    [reservation.amount || TRY_ON_CREDIT_COST, reservation.userId, reservation.periodKey]
  );
}

function imageDataUrlBytes(value) {
  if (typeof value !== 'string') return 0;
  const comma = value.indexOf(',');
  if (comma === -1 || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(value.slice(0, comma + 1))) return 0;
  const encoded = value.slice(comma + 1).replace(/[\r\n]/g, '');
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(encoded.length * 3 / 4) - padding);
}

function limitError(resource, entitlements) {
  const labels = {
    projects: 'Your project allowance has been reached.',
    storage: 'Your image storage allowance has been reached.',
    tryOnCredits: `You need ${TRY_ON_CREDIT_COST} credits to generate a Try-on.`
  };
  return {
    success: false,
    code: 'ENTITLEMENT_LIMIT_REACHED',
    resource,
    error: labels[resource] || 'Your plan allowance has been reached.',
    entitlements,
    upgradeUrl: '/pricing'
  };
}

module.exports = {
  TRY_ON_CREDIT_COST,
  PLAN_ENTITLEMENTS,
  canCreateProject,
  canStoreImage,
  ensureEntitlementTables,
  getUserEntitlements,
  imageDataUrlBytes,
  limitError,
  monthWindow,
  normalizePlan,
  releaseTryOnCredit,
  reserveTryOnCredit
};
