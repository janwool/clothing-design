const express = require('express');
const path = require('path');
const { Buffer } = require('node:buffer');
const { createHmac, timingSafeEqual } = require('node:crypto');
const i18next = require('i18next');
const middleware = require('i18next-http-middleware');
const db = require('./lib/db');
const {
  canonicalUrl,
  getCanonicalRedirect
} = require('./lib/url-policy');

const app = express();
app.set('trust proxy', true);
const isWorkerRuntime = Boolean(globalThis.__WORKER_ENV__) || process.env.CF_WORKER === 'true';
const appRootDir = typeof __dirname === 'string' ? __dirname : '';
const viewsDir = path.join(appRootDir, 'views');
const SESSION_COOKIE_NAME = 'cd_session';
const DEFAULT_SOCIAL_IMAGE = 'https://cdn.cloz-design.com/site/icon.png';
const CDN_BASE_URL = 'https://cdn.cloz-design.com';
const JSON_BODY_LIMIT_BYTES = 14 * 1024 * 1024;

function requireLocalOnly(moduleName) {
  const nodeRequire = eval('require');
  return nodeRequire(moduleName);
}

async function initAppTables() {
  try {
    await db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch (err) {
    console.error('Failed to init app tables:', err.message);
  }
}

function normalizeViewPath(filePath) {
  if (!path.isAbsolute(filePath)) {
    const relPath = filePath.split(/[\\/]/).filter(Boolean).join('/');
    return relPath.endsWith('.ejs') ? relPath : `${relPath}.ejs`;
  }

  let rel = path.relative(viewsDir, path.resolve(filePath));
  if (rel.startsWith('..')) {
    const marker = `${path.sep}views${path.sep}`;
    const markerIndex = filePath.indexOf(marker);
    if (markerIndex !== -1) {
      rel = filePath.slice(markerIndex + marker.length);
    }
  }
  rel = rel.split(path.sep).join('/');
  return rel.endsWith('.ejs') ? rel : `${rel}.ejs`;
}

function configureWorkerViewEngine() {
  const workerTemplates = require('./src/worker-templates.cjs');

  function renderWorkerTemplate(view, options, callback) {
    const renderOptions = {
      ...(options._locals || {}),
      ...options
    };
    if (typeof renderOptions.t !== 'function') {
      renderOptions.t = key => key;
    }
    if (!renderOptions.i18next) {
      renderOptions.i18next = { language: 'en' };
    }
    const html = workerTemplates.render(normalizeViewPath(view), renderOptions);
    callback(null, html);
  }

  app.render = function render(name, options, callback) {
    let renderOptions = options;
    let renderCallback = callback;

    if (typeof renderOptions === 'function') {
      renderCallback = renderOptions;
      renderOptions = {};
    }

    renderWorkerTemplate(name, renderOptions || {}, renderCallback);
  };

  app.engine('ejs', (filePath, options, callback) => {
    try {
      renderWorkerTemplate(filePath, options, callback);
    } catch (err) {
      callback(err);
    }
  });
}

function configureI18n() {
  const i18n = i18next.createInstance();
  if (isWorkerRuntime) {
    const workerAssets = require('./src/worker-assets.cjs');
    i18n
      .use(middleware.LanguageDetector)
      .init({
        lng: 'en',
        fallbackLng: 'en',
        resources: workerAssets.locales,
        defaultNS: 'translation',
        detection: {
          order: ['querystring', 'cookie', 'header'],
          caches: ['cookie']
        }
      });
  } else {
    const Backend = requireLocalOnly('i18next-fs-backend');
    i18n
      .use(Backend)
      .use(middleware.LanguageDetector)
      .init({
        lng: 'en',
        fallbackLng: 'en',
        backend: {
          loadPath: path.join(appRootDir, 'locales/{{lng}}/{{ns}}.json')
        },
        detection: {
          order: ['querystring', 'cookie', 'header'],
          caches: ['cookie']
        }
      });
  }
  return i18n;
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return cookies;
      try {
        cookies[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
      } catch (err) {
        cookies[part.slice(0, eq)] = part.slice(eq + 1);
      }
      return cookies;
    }, {});
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || 'clothing-design-secret-key';
}

function signSessionPayload(payload) {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function isValidSignature(payload, signature) {
  const expected = signSessionPayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature || '');
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function encodeSession(sessionData) {
  const payload = Buffer.from(JSON.stringify(sessionData)).toString('base64url');
  return `${payload}.${signSessionPayload(payload)}`;
}

function decodeSession(rawValue) {
  if (!rawValue) return {};
  const [payload, signature] = rawValue.split('.');
  if (!payload || !signature || !isValidSignature(payload, signature)) return {};
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) || {};
  } catch (err) {
    return {};
  }
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookie);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
  } else {
    res.setHeader('Set-Cookie', [existing, cookie]);
  }
}

function getSessionCookieOptions(maxAge) {
  const options = [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (isWorkerRuntime) {
    options.push('Secure');
  }
  return options.join('; ');
}

function workerSessionMiddleware(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  req.session = decodeSession(cookies[SESSION_COOKIE_NAME]);
  const originalSession = JSON.stringify(req.session);
  let destroyed = false;

  Object.defineProperty(req.session, 'destroy', {
    enumerable: false,
    value(callback) {
      destroyed = true;
      Object.keys(req.session).forEach(key => delete req.session[key]);
      if (typeof callback === 'function') callback();
    }
  });

  const originalEnd = res.end;
  res.end = function patchedEnd(...args) {
    if (!res.headersSent) {
      if (destroyed) {
        appendSetCookie(res, `${SESSION_COOKIE_NAME}=; ${getSessionCookieOptions(0)}`);
      } else {
        const nextSession = JSON.stringify(req.session);
        if (nextSession !== originalSession) {
          appendSetCookie(res, `${SESSION_COOKIE_NAME}=${encodeURIComponent(encodeSession(req.session))}; ${getSessionCookieOptions(60 * 60 * 24 * 30)}`);
        }
      }
    }
    return originalEnd.apply(this, args);
  };

  next();
}

function parseUrlEncodedBody(text) {
  const body = {};
  const params = new URLSearchParams(text);
  for (const [key, value] of params.entries()) {
    if (body[key] === undefined) {
      body[key] = value;
    } else if (Array.isArray(body[key])) {
      body[key].push(value);
    } else {
      body[key] = [body[key], value];
    }
  }
  return body;
}

function readRequestBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > limitBytes) {
        const err = new Error('Request body too large');
        err.status = 413;
        reject(err);
        return;
      }
      chunks.push(buffer);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', reject);
  });
}

function workerBodyParser(req, res, next) {
  const method = String(req.method || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || req.body !== undefined) {
    req.body = req.body || {};
    next();
    return;
  }

  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json' && contentType !== 'application/x-www-form-urlencoded') {
    req.body = {};
    next();
    return;
  }

  readRequestBody(req, JSON_BODY_LIMIT_BYTES)
    .then(text => {
      if (contentType === 'application/json') {
        req.body = text.trim() ? JSON.parse(text) : {};
      } else {
        req.body = parseUrlEncodedBody(text);
      }
      next();
    })
    .catch(err => {
      err.status = err.status || 400;
      next(err);
    });
}

if (!isWorkerRuntime) {
  initAppTables();
}

const i18n = configureI18n();

app.use((req, res, next) => {
  const redirectUrl = getCanonicalRedirect(req);
  if (!redirectUrl) return next();
  return res.redirect(301, redirectUrl);
});

app.use(middleware.handle(i18n));
if (isWorkerRuntime) {
  app.use(workerBodyParser);
} else {
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json({ limit: JSON_BODY_LIMIT_BYTES }));
}
if (isWorkerRuntime) {
  app.use(workerSessionMiddleware);
} else {
  const session = requireLocalOnly('express-session');
  app.use(session({
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  }));
}

app.use((req, res, next) => {
  res.locals.i18next = req.i18n;
  res.locals.user = req.session.user || null;
  res.locals.canonicalUrl = canonicalUrl(req.path || '/');
  res.locals.defaultMetaImage = DEFAULT_SOCIAL_IMAGE;
  next();
});

app.use((req, res, next) => {
  const originalEnd = res.end;
  res.end = function patchedSeoEnd(...args) {
    if (!res.headersSent && res.statusCode >= 400) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    return originalEnd.apply(this, args);
  };
  next();
});

if (isWorkerRuntime) {
  const workerAssets = require('./src/worker-assets.cjs');
  const publicAssetRoutes = Object.keys(workerAssets.publicAssets || {});
  if (publicAssetRoutes.length > 0) {
    app.get(publicAssetRoutes, (req, res, next) => {
      const asset = workerAssets.publicAssets && workerAssets.publicAssets[req.path];
      if (!asset) return next();
      res.set('Content-Type', asset.contentType);
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(Buffer.from(asset.base64, 'base64'));
    });
  }

  app.get('/uploads/pattern-previews/:file', (req, res) => {
    const file = path.basename(req.params.file || '');
    if (!/\.(png|jpe?g|webp)$/i.test(file)) {
      return res.status(404).render('404', { title: 'Not Found', page: '' });
    }
    res.redirect(302, `${CDN_BASE_URL}/uploads/pattern-previews/${encodeURIComponent(file)}`);
  });
}

if (!isWorkerRuntime) {
  app.use(express.static(path.join(appRootDir, 'public')));
}

if (isWorkerRuntime) {
  configureWorkerViewEngine();
}
app.set('view engine', 'ejs');
app.set('views', viewsDir);

app.use('/api/customization-inquiries', require('./routes/customization-inquiries'));
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found', page: '' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (String(req.path || '').startsWith('/api/')) {
    return res.status(err.status || 500).json({
      success: false,
      error: err.status === 413 ? 'The attached design screenshots are too large.' : 'Request failed.'
    });
  }
  res.status(err.status || 500).render('error', { title: 'Error', page: '' });
});

module.exports = app;
