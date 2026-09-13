const express = require('express');
const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');
const router = express.Router();
const db = require('../lib/db');
const {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserProfile,
  getGoogleOAuthConfig,
  oauthStatesMatch
} = require('../lib/google-oauth');
const isWorkerRuntime = Boolean(globalThis.__WORKER_ENV__) || process.env.CF_WORKER === 'true';
const { pageStructuredData } = require('../lib/seo');

// Initialize database
async function initAuthTables() {
  try {
    await db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch (err) {
    console.error('Failed to init auth tables:', err.message);
  }
}
if (!isWorkerRuntime) {
  initAuthTables();
}

function buildAuthPageData(req, page, title) {
  const path = page === 'register' ? '/auth/register' : '/auth/login';
  const description = page === 'register'
    ? 'Create a ClozDesign account for sign-in access while the browser mockup workspace is in public beta.'
    : 'Sign in to ClozDesign, or continue into the public browser mockup workspace without an account.';

  const nextPath = safeReturnPath(req.body?.next || req.query?.next);
  const oauthErrors = {
    cancelled: 'Google sign-in was cancelled.',
    invalid_state: 'That Google sign-in request expired. Please try again.',
    unavailable: 'Google sign-in is temporarily unavailable. Please try again.',
    unverified_email: 'Your Google account must have a verified email address.',
    not_configured: 'Google sign-in is not available yet.'
  };

  return {
    title,
    page,
    next: nextPath,
    googleAuthUrl: `/auth/google${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`,
    oauthError: oauthErrors[String(req.query?.google_error || '')] || '',
    metaDescription: description,
    metaImage: 'https://cdn.cloz-design.com/site/icon.png',
    metaRobots: 'noindex,follow',
    structuredData: pageStructuredData(req, {
      type: 'WebPage',
      name: title,
      description,
      path,
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: title, url: path }
      ]
    })
  };
}

function redirectGoogleError(res, code, nextPath = '') {
  const params = new URLSearchParams({ google_error: code });
  if (nextPath) params.set('next', nextPath);
  return res.redirect(`/auth/login?${params.toString()}`);
}

function safeReturnPath(value) {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.startsWith('//') || /[\r\n]/.test(path)) return '';
  return path.slice(0, 1000);
}

function wantsJson(req) {
  return Boolean(
    req.is?.('application/json') ||
    String(req.get?.('accept') || '').includes('application/json')
  );
}

// Login page
router.get('/login', (req, res) => {
  res.render('auth/login', buildAuthPageData(req, 'login', req.t('auth.login')));
});

// Register page
router.get('/register', (req, res) => {
  res.render('auth/register', buildAuthPageData(req, 'register', req.t('auth.register')));
});

// Google OAuth entry point
router.get('/google', (req, res) => {
  const config = getGoogleOAuthConfig(req);
  const nextPath = safeReturnPath(req.query?.next);
  if (!config.enabled) return redirectGoogleError(res, 'not_configured', nextPath);

  const state = createOAuthState();
  req.session.googleOAuth = {
    state,
    next: nextPath,
    createdAt: Date.now()
  };
  res.set('Cache-Control', 'no-store');
  return res.redirect(buildGoogleAuthorizationUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state
  }));
});

// Google redirects here with a short-lived authorization code. This route never
// renders a document, preventing the code from leaking to page resources.
router.get('/google/callback', async (req, res) => {
  const pending = req.session.googleOAuth || null;
  delete req.session.googleOAuth;
  const nextPath = safeReturnPath(pending?.next);
  const stateIsFresh = Number.isFinite(Number(pending?.createdAt)) &&
    Date.now() - Number(pending.createdAt) < 10 * 60 * 1000;

  if (req.query?.error) return redirectGoogleError(res, 'cancelled', nextPath);
  if (!pending || !stateIsFresh || !oauthStatesMatch(pending.state, req.query?.state)) {
    return redirectGoogleError(res, 'invalid_state');
  }

  const code = String(req.query?.code || '').trim();
  const config = getGoogleOAuthConfig(req);
  if (!code || !config.enabled) return redirectGoogleError(res, 'unavailable', nextPath);

  try {
    const tokens = await exchangeGoogleAuthorizationCode({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri
    });
    const profile = await fetchGoogleUserProfile(tokens.access_token);
    let user = await db.get('SELECT id, email, name FROM users WHERE email = ?', [profile.email]);

    if (!user) {
      const unusablePassword = await bcrypt.hash(`google:${profile.subject}:${randomBytes(32).toString('hex')}`, 10);
      try {
        const result = await db.run(
          'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
          [profile.email, unusablePassword, profile.name]
        );
        user = { id: result.lastID, email: profile.email, name: profile.name };
      } catch (error) {
        // A simultaneous first sign-in can win the unique-email insert race.
        user = await db.get('SELECT id, email, name FROM users WHERE email = ?', [profile.email]);
        if (!user) throw error;
      }
    }

    req.session.user = { id: user.id, email: user.email, name: user.name || profile.name };
    res.set('Cache-Control', 'no-store');
    return res.redirect(nextPath || '/tools/t-shirt-mockup-generator');
  } catch (error) {
    console.error('Google sign-in failed:', error.message);
    const errorCode = /verified email/i.test(error.message) ? 'unverified_email' : 'unavailable';
    return redirectGoogleError(res, errorCode, nextPath);
  }
});

// Login POST
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const nextPath = safeReturnPath(req.body.next);
    
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!user) {
      if (wantsJson(req)) {
        return res.status(401).json({ success: false, error: req.t('auth.invalidCredentials') });
      }
      return res.render('auth/login', { 
        ...buildAuthPageData(req, 'login', req.t('auth.login')),
        error: req.t('auth.invalidCredentials'),
      });
    }
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      if (wantsJson(req)) {
        return res.status(401).json({ success: false, error: req.t('auth.invalidCredentials') });
      }
      return res.render('auth/login', {
        ...buildAuthPageData(req, 'login', req.t('auth.login')),
        error: req.t('auth.invalidCredentials')
      });
    }
    req.session.user = { id: user.id, email: user.email, name: user.name };
    if (wantsJson(req)) {
      return res.json({ success: true, next: nextPath || '/tools/t-shirt-mockup-generator' });
    }
    if (nextPath) return res.redirect(nextPath);
    return res.redirect('/tools/t-shirt-mockup-generator');
  } catch (err) {
    if (wantsJson(req)) {
      return res.status(500).json({ success: false, error: req.t('auth.error') });
    }
    res.render('auth/login', { 
      ...buildAuthPageData(req, 'login', req.t('auth.login')),
      error: req.t('auth.error'),
    });
  }
});

// Register POST
router.post('/register', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim();
    const nextPath = safeReturnPath(req.body.next);
    if (String(name || '').trim().length < 2) {
      return res.render('auth/register', {
        ...buildAuthPageData(req, 'register', req.t('auth.register')),
        error: 'Please enter your name.'
      });
    }
    if (String(password || '').length < 8) {
      return res.render('auth/register', {
        ...buildAuthPageData(req, 'register', req.t('auth.register')),
        error: 'Use a password with at least 8 characters.'
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) {
      return res.render('auth/register', {
        ...buildAuthPageData(req, 'register', req.t('auth.register')),
        error: 'Please enter a valid email address.'
      });
    }
    if (password.length > 200) {
      return res.render('auth/register', {
        ...buildAuthPageData(req, 'register', req.t('auth.register')),
        error: 'Password is too long.'
      });
    }
    
    const hash = await bcrypt.hash(password, 10);
    const result = await db.run('INSERT INTO users (email, password, name) VALUES (?, ?, ?)', [email, hash, name]);
    req.session.user = { id: result.lastID, email, name };
    if (nextPath) return res.redirect(nextPath);
    return res.redirect('/tools/t-shirt-mockup-generator');
  } catch (err) {
    res.render('auth/register', { 
      ...buildAuthPageData(req, 'register', req.t('auth.register')),
      error: String(err.message || '').toLowerCase().includes('unique') ? req.t('auth.emailExists') : req.t('auth.error'),
    });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
