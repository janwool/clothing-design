const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../lib/db');
const { generateSlug } = require('../lib/slug');
const isWorkerRuntime = Boolean(globalThis.__WORKER_ENV__) || process.env.CF_WORKER === 'true';

// Cloudflare R2 Configuration
const R2_BUCKET_NAME = 'clothing-design';
const textEncoder = new TextEncoder();

function getEnvValue(key) {
  return process.env[key] || (globalThis.__WORKER_ENV__ && globalThis.__WORKER_ENV__[key]) || '';
}

function getR2Config() {
  return {
    accountId: getEnvValue('R2_ACCOUNT_ID'),
    accessKeyId: getEnvValue('R2_ACCESS_KEY_ID'),
    secretAccessKey: getEnvValue('R2_SECRET_ACCESS_KEY'),
    publicUrl: getEnvValue('R2_PUBLIC_URL')
  };
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function toDateStamp(date) {
  return toAmzDate(date).slice(0, 8);
}

function toHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key, value) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? textEncoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(value)));
}

async function sha256Hex(value) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(value))));
}

async function getSigningKey(secretAccessKey, dateStamp) {
  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, 'auto');
  const kService = await hmacSha256(kRegion, 's3');
  return hmacSha256(kService, 'aws4_request');
}

async function createR2PresignedPutUrl({ key, contentType, expiresIn = 300 }) {
  const config = getR2Config();
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    throw new Error('R2 credentials are not configured');
  }

  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = toDateStamp(now);
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${R2_BUCKET_NAME}/${key.split('/').map(awsEncode).join('/')}`;
  const signedHeaders = 'content-type;host';
  const queryParams = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Content-Sha256', 'UNSIGNED-PAYLOAD'],
    ['X-Amz-Credential', `${config.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', signedHeaders]
  ];
  const canonicalQuery = queryParams
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${awsEncode(name)}=${awsEncode(value)}`)
    .join('&');
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n');
  const signingKey = await getSigningKey(config.secretAccessKey, dateStamp);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// Initialize database tables for admin
async function initAdminTables() {
  try {
    // Categories table (for SEO/GEO landing pages)
    await db.run(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      resource_type TEXT NOT NULL,
      description TEXT,
      meta_title TEXT,
      meta_description TEXT,
      landing_content TEXT,
      sort_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.run('ALTER TABLE categories ADD COLUMN landing_content TEXT').catch(() => {});

    // 3D Models table
    await db.run(`CREATE TABLE IF NOT EXISTS models_3d (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT,
      category TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      image_url TEXT,
      file_url TEXT,
      texture_url TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.run('ALTER TABLE models_3d ADD COLUMN slug TEXT').catch(() => {});

    // 2D Templates table
    await db.run(`CREATE TABLE IF NOT EXISTS models_2d (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      image_url TEXT,
      file_url TEXT,
      format TEXT DEFAULT 'svg',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Sew Patterns table
    await db.run(`CREATE TABLE IF NOT EXISTS patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      image_url TEXT,
      file_url TEXT,
      format TEXT DEFAULT 'zprj',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Gallery items table
    await db.run(`CREATE TABLE IF NOT EXISTS gallery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT,
      category TEXT,
      tags TEXT,
      image_url TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tools table
    await db.run(`CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      url TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch (err) {
    console.error('Failed to init admin tables:', err.message);
  }
}

if (!isWorkerRuntime) {
  initAdminTables();
}

// Middleware to check if user is logged in (for future admin role check)
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
}

// Admin Dashboard
router.get('/', requireAuth, async (req, res) => {
  try {
    const models3d = await db.get('SELECT COUNT(*) as count FROM models_3d');
    const models2d = await db.get('SELECT COUNT(*) as count FROM models_2d');
    const patterns = await db.get('SELECT COUNT(*) as count FROM patterns');
    const gallery = await db.get('SELECT COUNT(*) as count FROM gallery_items');
    const tools = await db.get('SELECT COUNT(*) as count FROM tools');
    const users = await db.get('SELECT COUNT(*) as count FROM users');

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      page: 'admin',
      counts: {
        models3d: models3d ? models3d.count : 0,
        models2d: models2d ? models2d.count : 0,
        patterns: patterns ? patterns.count : 0,
        gallery: gallery ? gallery.count : 0,
        tools: tools ? tools.count : 0,
        users: users ? users.count : 0
      }
    });
  } catch (err) {
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      page: 'admin',
      counts: { models3d: 0, models2d: 0, patterns: 0, gallery: 0, tools: 0, users: 0 }
    });
  }
});

// ==================== 3D Models CRUD ====================
router.get('/models-3d', requireAuth, async (req, res) => {
  try {
    const items = await db.all('SELECT * FROM models_3d ORDER BY created_at DESC');
    const categories = await db.all('SELECT * FROM categories WHERE resource_type = ? AND status = ? ORDER BY sort_order ASC, name ASC', ['3d-models', 'active']);
    res.render('admin/models-3d', {
      title: '3D Models Management',
      page: 'admin-models-3d',
      items: items || [],
      categories: categories || []
    });
  } catch (err) {
    res.render('admin/models-3d', {
      title: '3D Models Management',
      page: 'admin-models-3d',
      items: [],
      categories: []
    });
  }
});

router.post('/models-3d', requireAuth, async (req, res) => {
  try {
    const { name, slug, category, description, tags, status, file_url, image_url, texture_url } = req.body;
    const modelSlug = generateSlug(slug || name, `model-${Date.now()}`);

    const result = await db.run(
      'INSERT INTO models_3d (name, slug, category, description, tags, file_url, image_url, texture_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, modelSlug, category, description, tags, file_url, image_url, texture_url, status || 'active']
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.put('/models-3d/:id', requireAuth, async (req, res) => {
  try {
    const { name, slug, category, description, tags, status, file_url, image_url, texture_url } = req.body;
    const updates = [];
    const params = [];

    updates.push('name = ?'); params.push(name);
    updates.push('slug = ?'); params.push(generateSlug(slug || name, `model-${req.params.id}`));
    updates.push('category = ?'); params.push(category);
    updates.push('description = ?'); params.push(description);
    updates.push('tags = ?'); params.push(tags);
    updates.push('status = ?'); params.push(status);

    if (file_url !== undefined) {
      updates.push('file_url = ?');
      params.push(file_url);
    }
    if (image_url !== undefined) {
      updates.push('image_url = ?');
      params.push(image_url);
    }
    if (texture_url !== undefined) {
      updates.push('texture_url = ?');
      params.push(texture_url);
    }

    params.push(req.params.id);

    await db.run(
      'UPDATE models_3d SET ' + updates.join(', ') + ', updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      params
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.delete('/models-3d/:id', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM models_3d WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==================== 2D Templates CRUD ====================
router.get('/models-2d', requireAuth, async (req, res) => {
  try {
    const items = await db.all('SELECT * FROM models_2d ORDER BY created_at DESC');
    const categories = await db.all('SELECT * FROM categories WHERE resource_type = ? AND status = ? ORDER BY sort_order ASC, name ASC', ['2d-templates', 'active']);
    res.render('admin/models-2d', { title: '2D Templates Management', page: 'admin-models-2d', items: items || [], categories: categories || [] });
  } catch (err) {
    res.render('admin/models-2d', { title: '2D Templates Management', page: 'admin-models-2d', items: [], categories: [] });
  }
});

router.post('/models-2d', requireAuth, async (req, res) => {
  try {
    const { name, category, description, tags, format, status } = req.body;
    const result = await db.run(
      'INSERT INTO models_2d (name, category, description, tags, format, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, category, description, tags, format || 'svg', status || 'active']
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.put('/models-2d/:id', requireAuth, async (req, res) => {
  try {
    const { name, category, description, tags, format, status } = req.body;
    await db.run(
      'UPDATE models_2d SET name = ?, category = ?, description = ?, tags = ?, format = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, category, description, tags, format, status, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.delete('/models-2d/:id', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM models_2d WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==================== Sew Patterns CRUD ====================
router.get('/patterns', requireAuth, async (req, res) => {
  try {
    const items = await db.all('SELECT * FROM patterns ORDER BY created_at DESC');
    const categories = await db.all('SELECT * FROM categories WHERE resource_type = ? AND status = ? ORDER BY sort_order ASC, name ASC', ['patterns', 'active']);
    res.render('admin/patterns', { title: 'Sew Patterns Management', page: 'admin-patterns', items: items || [], categories: categories || [] });
  } catch (err) {
    res.render('admin/patterns', { title: 'Sew Patterns Management', page: 'admin-patterns', items: [], categories: [] });
  }
});

router.post('/patterns', requireAuth, async (req, res) => {
  try {
    const { name, category, description, tags, format, status, file_url, image_url } = req.body;
    if (!file_url) {
      return res.json({ success: false, error: 'Pattern file is required' });
    }

    const result = await db.run(
      'INSERT INTO patterns (name, category, description, tags, file_url, image_url, format, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, category, description, tags, file_url, image_url, format || 'zprj', status || 'active']
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.put('/patterns/:id', requireAuth, async (req, res) => {
  try {
    const { name, category, description, tags, format, status, file_url, image_url } = req.body;
    const updates = [
      'name = ?',
      'category = ?',
      'description = ?',
      'tags = ?',
      'format = ?',
      'status = ?',
    ];
    const params = [name, category, description, tags, format || 'zprj', status || 'active'];

    if (file_url !== undefined && file_url !== '') {
      updates.push('file_url = ?');
      params.push(file_url);
    }
    if (image_url !== undefined && image_url !== '') {
      updates.push('image_url = ?');
      params.push(image_url);
    }

    params.push(req.params.id);

    await db.run(
      'UPDATE patterns SET ' + updates.join(', ') + ', updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      params
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.delete('/patterns/:id', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM patterns WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==================== Gallery CRUD ====================
router.get('/gallery', requireAuth, async (req, res) => {
  try {
    const items = await db.all('SELECT * FROM gallery_items ORDER BY created_at DESC');
    const categories = await db.all('SELECT * FROM categories WHERE resource_type = ? AND status = ? ORDER BY sort_order ASC, name ASC', ['gallery', 'active']);
    res.render('admin/gallery', { title: 'Gallery Management', page: 'admin-gallery', items: items || [], categories: categories || [] });
  } catch (err) {
    res.render('admin/gallery', { title: 'Gallery Management', page: 'admin-gallery', items: [], categories: [] });
  }
});

router.post('/gallery', requireAuth, async (req, res) => {
  try {
    const { title, author, category, tags, status } = req.body;
    const result = await db.run(
      'INSERT INTO gallery_items (title, author, category, tags, status) VALUES (?, ?, ?, ?, ?)',
      [title, author, category, tags, status || 'active']
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.put('/gallery/:id', requireAuth, async (req, res) => {
  try {
    const { title, author, category, tags, status } = req.body;
    await db.run(
      'UPDATE gallery_items SET title = ?, author = ?, category = ?, tags = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [title, author, category, tags, status, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.delete('/gallery/:id', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM gallery_items WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==================== Tools CRUD ====================
router.get('/tools', requireAuth, async (req, res) => {
  try {
    const items = await db.all('SELECT * FROM tools ORDER BY sort_order ASC, created_at DESC');
    const categories = await db.all('SELECT * FROM categories WHERE resource_type = ? AND status = ? ORDER BY sort_order ASC, name ASC', ['tools', 'active']);
    res.render('admin/tools', { title: 'Tools Management', page: 'admin-tools', items: items || [], categories: categories || [] });
  } catch (err) {
    res.render('admin/tools', { title: 'Tools Management', page: 'admin-tools', items: [], categories: [] });
  }
});

router.post('/tools', requireAuth, async (req, res) => {
  try {
    const { name, category, description, url, icon, sort_order, status } = req.body;
    const result = await db.run(
      'INSERT INTO tools (name, category, description, url, icon, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, category, description, url, icon, sort_order || 0, status || 'active']
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.put('/tools/:id', requireAuth, async (req, res) => {
  try {
    const { name, category, description, url, icon, sort_order, status } = req.body;
    await db.run(
      'UPDATE tools SET name = ?, category = ?, description = ?, url = ?, icon = ?, sort_order = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, category, description, url, icon, sort_order, status, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.delete('/tools/:id', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM tools WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==================== Users Management ====================
router.get('/users', requireAuth, async (req, res) => {
  try {
    const items = await db.all('SELECT id, email, name, status, created_at FROM users ORDER BY created_at DESC');
    res.render('admin/users', { title: 'Users Management', page: 'admin-users', items: items || [] });
  } catch (err) {
    res.render('admin/users', { title: 'Users Management', page: 'admin-users', items: [] });
  }
});

router.delete('/users/:id', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==================== Categories CRUD ====================
router.get('/categories', requireAuth, async (req, res) => {
  try {
    const items = await db.all('SELECT * FROM categories ORDER BY resource_type, sort_order ASC');
    res.render('admin/categories', { title: 'Categories Management', page: 'admin-categories', items: items || [] });
  } catch (err) {
    res.render('admin/categories', { title: 'Categories Management', page: 'admin-categories', items: [] });
  }
});

router.post('/categories', requireAuth, async (req, res) => {
  try {
    const { name, slug, resource_type, description, meta_title, meta_description, landing_content, sort_order, status } = req.body;
    const result = await db.run(
      'INSERT INTO categories (name, slug, resource_type, description, meta_title, meta_description, landing_content, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, slug, resource_type, description, meta_title, meta_description, landing_content, sort_order || 0, status || 'active']
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.put('/categories/:id', requireAuth, async (req, res) => {
  try {
    const { name, slug, resource_type, description, meta_title, meta_description, landing_content, sort_order, status } = req.body;
    await db.run(
      'UPDATE categories SET name = ?, slug = ?, resource_type = ?, description = ?, meta_title = ?, meta_description = ?, landing_content = ?, sort_order = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, slug, resource_type, description, meta_title, meta_description, landing_content, sort_order, status, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.delete('/categories/:id', requireAuth, async (req, res) => {
  try {
    await db.run('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==================== R2 Presigned URL ====================
router.post('/upload-token', requireAuth, async (req, res) => {
  try {
    const { filename, contentType, folder } = req.body;

    if (!filename || !folder) {
      return res.status(400).json({ success: false, error: 'filename and folder are required' });
    }

    const validFolders = ['d3', 'd2', 'image', 'patterns'];
    if (!validFolders.includes(folder)) {
      return res.status(400).json({ success: false, error: 'Invalid folder' });
    }

    if (folder === 'patterns' && path.extname(filename).toLowerCase() !== '.zprj') {
      return res.status(400).json({ success: false, error: 'Only .zprj pattern files are allowed' });
    }

    const key = `${folder}/${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(filename)}`;
    const r2Config = getR2Config();
    const uploadContentType = contentType || 'application/octet-stream';
    const signedUrl = await createR2PresignedPutUrl({
      key,
      contentType: uploadContentType,
      expiresIn: 300
    });

    // R2 public URL format: https://<bucket>.<accountid>.r2.cloudflarestorage.com/<key>
    const publicUrl = r2Config.publicUrl
      ? `${r2Config.publicUrl}/${key}`
      : `https://${R2_BUCKET_NAME}.${r2Config.accountId}.r2.cloudflarestorage.com/${key}`;

    res.json({
      success: true,
      signedUrl,
      publicUrl,
      key,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
