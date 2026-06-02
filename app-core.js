const express = require('express');
const path = require('path');
const { Buffer } = require('node:buffer');
const { createHmac, timingSafeEqual } = require('node:crypto');
const i18next = require('i18next');
const middleware = require('i18next-http-middleware');
const ejs = require('ejs');
const db = require('./lib/db');

const app = express();
const isWorkerRuntime = process.env.CF_WORKER === 'true';
const viewsDir = path.join(__dirname, 'views');
const SESSION_COOKIE_NAME = 'cd_session';

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
  const workerAssets = require('./src/worker-assets.cjs');

  function resolveTemplate(filePath, fromFile, originalPath) {
    const candidates = [];
    if (filePath) candidates.push(filePath);
    if (fromFile && originalPath) {
      candidates.push(path.resolve(path.dirname(fromFile), originalPath));
      candidates.push(path.resolve(path.dirname(fromFile), `${originalPath}.ejs`));
    }

    for (const candidate of candidates) {
      const rel = normalizeViewPath(candidate);
      if (workerAssets.views[rel]) {
        return {
          filename: path.join(viewsDir, rel),
          template: workerAssets.views[rel]
        };
      }
    }

    throw new Error(`Worker template not found: ${originalPath || filePath}`);
  }

  app.engine('ejs', (filePath, options, callback) => {
    try {
      const resolved = resolveTemplate(filePath);
      const html = ejs.render(
        resolved.template,
        options,
        {
          ...options,
          filename: resolved.filename,
          includer: (originalPath, parsedPath) => {
            const included = resolveTemplate(parsedPath, resolved.filename, originalPath);
            return {
              filename: included.filename,
              template: included.template
            };
          }
        }
      );
      callback(null, html);
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
    const Backend = require('i18next-fs-backend');
    i18n
      .use(Backend)
      .use(middleware.LanguageDetector)
      .init({
        lng: 'en',
        fallbackLng: 'en',
        backend: {
          loadPath: path.join(__dirname, 'locales/{{lng}}/{{ns}}.json')
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

if (!isWorkerRuntime) {
  initAppTables();
}

const i18n = configureI18n();

app.use(middleware.handle(i18n));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
if (isWorkerRuntime) {
  app.use(workerSessionMiddleware);
} else {
  const session = require('express-session');
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
  next();
});

if (!isWorkerRuntime) {
  app.use(express.static(path.join(__dirname, 'public')));
}

if (isWorkerRuntime) {
  configureWorkerViewEngine();
}
app.set('view engine', 'ejs');
app.set('views', viewsDir);

app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found', page: '' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Error', page: '' });
});

module.exports = app;
