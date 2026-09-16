const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../lib/db');
const { generateSlug } = require('../lib/slug');
const { ensureCustomizationInquiriesTable } = require('../lib/customization-inquiries-db');
const { ensureFeedbackTable } = require('../lib/feedback-db');
const { ensureUserContentTables } = require('../lib/user-content-db');
const {
  ensureEntitlementTables,
  getUserEntitlements,
  normalizePlan
} = require('../lib/user-entitlements');
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

function hasUploadValue(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function normalizeCategoryIds(value, fallbackValue) {
  const raw = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  const ids = raw
    .map(item => Number(item))
    .filter(item => Number.isInteger(item) && item > 0);
  if (ids.length > 0) {
    return Array.from(new Set(ids));
  }
  const fallback = Number(fallbackValue);
  return Number.isInteger(fallback) && fallback > 0 ? [fallback] : [];
}

async function ensureModel3dCategoryTable() {
  await db.run(`CREATE TABLE IF NOT EXISTS model_3d_categories (
    model_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    is_primary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (model_id, category_id)
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS model_3d_slug_redirects (
    old_slug TEXT PRIMARY KEY,
    model_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function getCategoriesByIds(categoryIds) {
  const categories = [];
  for (const categoryId of categoryIds) {
    const category = await db.get(
      'SELECT * FROM categories WHERE id = ? AND resource_type = ? AND status = ?',
      [categoryId, '3d-models', 'active']
    );
    if (category) categories.push(category);
  }
  return categories;
}

async function syncModel3dCategories(modelId, categoryIds) {
  await ensureModel3dCategoryTable();
  await db.run('DELETE FROM model_3d_categories WHERE model_id = ?', [modelId]);
  for (const [index, categoryId] of categoryIds.entries()) {
    await db.run(
      'INSERT INTO model_3d_categories (model_id, category_id, is_primary) VALUES (?, ?, ?)',
      [modelId, categoryId, index === 0 ? 1 : 0]
    );
  }
}

function getAdminModel3dSelect() {
  return `
    SELECT
      m.*,
      COALESCE(primary_category.name, m.category) as category,
      COALESCE(primary_category.slug, legacy_category.slug) as category_slug,
      GROUP_CONCAT(DISTINCT linked_category.id) as category_ids,
      GROUP_CONCAT(DISTINCT linked_category.name) as category_names,
      GROUP_CONCAT(DISTINCT linked_category.slug) as category_slugs
    FROM models_3d m
    LEFT JOIN categories legacy_category
      ON m.category = legacy_category.name AND legacy_category.resource_type = '3d-models'
    LEFT JOIN model_3d_categories mc
      ON mc.model_id = m.id
    LEFT JOIN categories linked_category
      ON linked_category.id = mc.category_id AND linked_category.resource_type = '3d-models'
    LEFT JOIN categories primary_category
      ON primary_category.id = (
        SELECT mc_primary.category_id
        FROM model_3d_categories mc_primary
        WHERE mc_primary.model_id = m.id
        ORDER BY mc_primary.is_primary DESC, mc_primary.category_id ASC
        LIMIT 1
      )
  `;
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
    await ensureModel3dCategoryTable();

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

const INQUIRY_PAGE_SIZE = 30;
const INQUIRY_STATUSES = new Set(['all', 'pending', 'contacted', 'completed', 'closed']);
const FEEDBACK_PAGE_SIZE = 30;
const FEEDBACK_STATUSES = new Set(['all', 'new', 'reviewed', 'resolved', 'archived']);
const PROJECT_PAGE_SIZE = 24;
const PROJECT_TYPES = new Set(['all', '3d', 'white_mockup']);
const IMAGE_PAGE_SIZE = 30;
const IMAGE_PURPOSES = new Set(['all', 'artwork', 'project-preview', 'project-texture', 'try-on-result']);

function normalizeInquiryStatus(value) {
  const status = String(value || 'all').trim().toLowerCase();
  return INQUIRY_STATUSES.has(status) ? status : 'all';
}

function normalizeFeedbackStatus(value) {
  const status = String(value || 'all').trim().toLowerCase();
  return FEEDBACK_STATUSES.has(status) ? status : 'all';
}

function normalizeInquiryPage(value) {
  const page = Number.parseInt(value, 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeProjectType(value) {
  const type = String(value || 'all').trim().toLowerCase();
  return PROJECT_TYPES.has(type) ? type : 'all';
}

function normalizeImagePurpose(value) {
  const purpose = String(value || 'all').trim().toLowerCase();
  return IMAGE_PURPOSES.has(purpose) ? purpose : 'all';
}

function formatImageBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / (1024 ** unitIndex);
  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
}

function imagePurposeLabel(value) {
  return ({
    artwork: 'Artwork',
    'project-preview': 'Project preview',
    'project-texture': 'Project texture',
    'try-on-result': 'AI try-on'
  })[value] || 'Other';
}

function formatInquiryDate(value) {
  if (!value) return '—';
  const raw = String(value);
  const isoValue = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (error) {
    return '';
  }
}

function safeProjectPreviewUrl(value) {
  const url = String(value || '').trim();
  if (/^\/(?!\/)[^\s]*$/.test(url)) return url;
  return safeHttpUrl(url);
}

function safeProjectSourceUrl(value) {
  const url = String(value || '').trim();
  if (!/^\/(?:3d-models|white-mockups)\/(?!\/)[^\s]*$/.test(url)) return '';
  return url;
}

function safeFeedbackSourceUrl(value) {
  const url = String(value || '').trim();
  if (/^\/(?!\/)[^\s]*$/.test(url)) return url;
  return safeHttpUrl(url);
}

// Admin Dashboard
router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureCustomizationInquiriesTable();
    const models3d = await db.get('SELECT COUNT(*) as count FROM models_3d');
    const models2d = await db.get('SELECT COUNT(*) as count FROM models_2d');
    const gallery = await db.get('SELECT COUNT(*) as count FROM gallery_items');
    const tools = await db.get('SELECT COUNT(*) as count FROM tools');
    const users = await db.get('SELECT COUNT(*) as count FROM users');
    const inquiries = await db.get('SELECT COUNT(*) as count FROM customization_inquiries');
    await ensureFeedbackTable();
    const feedback = await db.get('SELECT COUNT(*) as count FROM feedback_submissions');
    await ensureUserContentTables();
    const projects = await db.get('SELECT COUNT(*) as count FROM design_projects');
    const images = await db.get('SELECT COUNT(*) as count FROM user_images');

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      page: 'admin',
      counts: {
        models3d: models3d ? models3d.count : 0,
        models2d: models2d ? models2d.count : 0,
        gallery: gallery ? gallery.count : 0,
        tools: tools ? tools.count : 0,
        users: users ? users.count : 0,
        inquiries: inquiries ? inquiries.count : 0,
        feedback: feedback ? feedback.count : 0,
        projects: projects ? projects.count : 0,
        images: images ? images.count : 0
      }
    });
  } catch (err) {
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      page: 'admin',
      counts: { models3d: 0, models2d: 0, gallery: 0, tools: 0, users: 0, inquiries: 0, feedback: 0, projects: 0, images: 0 }
    });
  }
});

// ==================== Customization Inquiries ====================
router.get('/inquiries', requireAuth, async (req, res) => {
  const status = normalizeInquiryStatus(req.query.status);
  const search = String(req.query.q || '').trim().slice(0, 100);
  const requestedPage = normalizeInquiryPage(req.query.page);

  try {
    await ensureCustomizationInquiriesTable();
    const where = [];
    const params = [];

    if (status !== 'all') {
      where.push('status = ?');
      params.push(status);
    }
    if (search) {
      const pattern = `%${search}%`;
      where.push('(reference_code LIKE ? OR contact_name LIKE ? OR email LIKE ? OR address LIKE ? OR model_name LIKE ?)');
      params.push(pattern, pattern, pattern, pattern, pattern);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = await db.get(
      `SELECT COUNT(*) as count FROM customization_inquiries ${whereSql}`,
      params
    );
    const total = Number(totalRow?.count || 0);
    const pageCount = Math.max(1, Math.ceil(total / INQUIRY_PAGE_SIZE));
    const page = Math.min(requestedPage, pageCount);
    const offset = (page - 1) * INQUIRY_PAGE_SIZE;
    const items = await db.all(
      `SELECT
        id, reference_code, model_id, model_slug, model_name,
        contact_name, email, address, quantity, notes,
        snapshot_3d_url, snapshot_2d_url, source_url,
        status, created_at, updated_at
      FROM customization_inquiries
      ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
      [...params, INQUIRY_PAGE_SIZE, offset]
    );
    const stats = await db.get(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status != 'pending' THEN 1 ELSE 0 END) as handled
      FROM customization_inquiries`);

    res.render('admin/inquiries', {
      title: 'Customization Inquiries',
      page: 'admin-inquiries',
      items: (items || []).map(item => ({
        ...item,
        snapshot_3d_url_safe: safeHttpUrl(item.snapshot_3d_url),
        snapshot_2d_url_safe: safeHttpUrl(item.snapshot_2d_url),
        source_url_safe: safeHttpUrl(item.source_url),
        created_at_display: formatInquiryDate(item.created_at),
        updated_at_display: formatInquiryDate(item.updated_at)
      })),
      inquiryFilters: { status, search },
      inquiryPagination: { page, pageCount, total },
      inquiryStats: {
        total: Number(stats?.total || 0),
        pending: Number(stats?.pending || 0),
        handled: Number(stats?.handled || 0)
      },
      error: ''
    });
  } catch (err) {
    console.error('Failed to load customization inquiries:', err);
    res.render('admin/inquiries', {
      title: 'Customization Inquiries',
      page: 'admin-inquiries',
      items: [],
      inquiryFilters: { status, search },
      inquiryPagination: { page: 1, pageCount: 1, total: 0 },
      inquiryStats: { total: 0, pending: 0, handled: 0 },
      error: 'Customization inquiries could not be loaded.'
    });
  }
});

// ==================== Product Feedback ====================
router.get('/feedback', requireAuth, async (req, res) => {
  const status = normalizeFeedbackStatus(req.query.status);
  const search = String(req.query.q || '').trim().slice(0, 100);
  const requestedPage = normalizeInquiryPage(req.query.page);

  try {
    await ensureFeedbackTable();
    const where = [];
    const params = [];

    if (status !== 'all') {
      where.push('f.status = ?');
      params.push(status);
    }
    if (search) {
      const pattern = `%${search}%`;
      where.push('(f.email LIKE ? OR f.message LIKE ? OR f.source_url LIKE ? OR u.email LIKE ? OR u.name LIKE ?)');
      params.push(pattern, pattern, pattern, pattern, pattern);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = await db.get(
      `SELECT COUNT(*) as count
       FROM feedback_submissions f
       LEFT JOIN users u ON u.id = f.user_id
       ${whereSql}`,
      params
    );
    const total = Number(totalRow?.count || 0);
    const pageCount = Math.max(1, Math.ceil(total / FEEDBACK_PAGE_SIZE));
    const page = Math.min(requestedPage, pageCount);
    const offset = (page - 1) * FEEDBACK_PAGE_SIZE;
    const items = await db.all(
      `SELECT
        f.id, f.user_id, f.email, f.message, f.source_url,
        f.status, f.created_at, f.updated_at,
        u.name as user_name, u.email as user_email
       FROM feedback_submissions f
       LEFT JOIN users u ON u.id = f.user_id
       ${whereSql}
       ORDER BY f.created_at DESC, f.id DESC
       LIMIT ? OFFSET ?`,
      [...params, FEEDBACK_PAGE_SIZE, offset]
    );
    const stats = await db.get(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
      SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) as reviewed,
      SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
      FROM feedback_submissions`);

    res.render('admin/feedback', {
      title: 'User Feedback',
      page: 'admin-feedback',
      items: (items || []).map(item => ({
        ...item,
        source_url_safe: safeFeedbackSourceUrl(item.source_url),
        created_at_display: formatInquiryDate(item.created_at),
        updated_at_display: formatInquiryDate(item.updated_at)
      })),
      feedbackFilters: { status, search },
      feedbackPagination: { page, pageCount, total },
      feedbackStats: {
        total: Number(stats?.total || 0),
        new: Number(stats?.new_count || 0),
        reviewed: Number(stats?.reviewed || 0),
        resolved: Number(stats?.resolved || 0)
      },
      error: ''
    });
  } catch (err) {
    console.error('Failed to load product feedback:', err);
    res.render('admin/feedback', {
      title: 'User Feedback',
      page: 'admin-feedback',
      items: [],
      feedbackFilters: { status, search },
      feedbackPagination: { page: 1, pageCount: 1, total: 0 },
      feedbackStats: { total: 0, new: 0, reviewed: 0, resolved: 0 },
      error: 'Feedback could not be loaded.'
    });
  }
});

router.put('/feedback/:id/status', requireAuth, async (req, res) => {
  const status = normalizeFeedbackStatus(req.body?.status);
  if (status === 'all') {
    return res.status(400).json({ success: false, error: 'Choose a valid feedback status.' });
  }

  try {
    await ensureFeedbackTable();
    const result = await db.run(
      'UPDATE feedback_submissions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, req.params.id]
    );
    if (!result.changes) {
      return res.status(404).json({ success: false, error: 'Feedback not found.' });
    }
    return res.json({ success: true, status });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Feedback status could not be updated.' });
  }
});

// ==================== User Projects ====================
router.get('/projects', requireAuth, async (req, res) => {
  const type = normalizeProjectType(req.query.type);
  const search = String(req.query.q || '').trim().slice(0, 100);
  const requestedPage = normalizeInquiryPage(req.query.page);

  try {
    await ensureUserContentTables();
    const where = [];
    const params = [];

    if (type !== 'all') {
      where.push('p.project_type = ?');
      params.push(type);
    }
    if (search) {
      const pattern = `%${search}%`;
      where.push('(p.name LIKE ? OR p.id LIKE ? OR u.email LIKE ? OR u.name LIKE ?)');
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = await db.get(
      `SELECT COUNT(*) as count
       FROM design_projects p
       LEFT JOIN users u ON u.id = p.user_id
       ${whereSql}`,
      params
    );
    const total = Number(totalRow?.count || 0);
    const pageCount = Math.max(1, Math.ceil(total / PROJECT_PAGE_SIZE));
    const page = Math.min(requestedPage, pageCount);
    const offset = (page - 1) * PROJECT_PAGE_SIZE;
    const items = await db.all(
      `SELECT
        p.id, p.user_id, p.project_type, p.name, p.source_id, p.source_url,
        p.preview_image_url, p.created_at, p.updated_at,
        u.email as user_email, u.name as user_name
       FROM design_projects p
       LEFT JOIN users u ON u.id = p.user_id
       ${whereSql}
       ORDER BY p.updated_at DESC, p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, PROJECT_PAGE_SIZE, offset]
    );
    const stats = await db.get(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN project_type = '3d' THEN 1 ELSE 0 END) as projects_3d,
      SUM(CASE WHEN project_type = 'white_mockup' THEN 1 ELSE 0 END) as white_mockups,
      COUNT(DISTINCT user_id) as creators
      FROM design_projects`);

    res.render('admin/projects', {
      title: 'User Projects',
      page: 'admin-projects',
      items: (items || []).map(item => ({
        ...item,
        preview_image_url_safe: safeProjectPreviewUrl(item.preview_image_url),
        source_url_safe: safeProjectSourceUrl(item.source_url),
        created_at_display: formatInquiryDate(item.created_at),
        updated_at_display: formatInquiryDate(item.updated_at)
      })),
      projectFilters: { type, search },
      projectPagination: { page, pageCount, total },
      projectStats: {
        total: Number(stats?.total || 0),
        projects3d: Number(stats?.projects_3d || 0),
        whiteMockups: Number(stats?.white_mockups || 0),
        creators: Number(stats?.creators || 0)
      },
      error: ''
    });
  } catch (err) {
    console.error('Failed to load user projects:', err);
    res.render('admin/projects', {
      title: 'User Projects',
      page: 'admin-projects',
      items: [],
      projectFilters: { type, search },
      projectPagination: { page: 1, pageCount: 1, total: 0 },
      projectStats: { total: 0, projects3d: 0, whiteMockups: 0, creators: 0 },
      error: 'User projects could not be loaded.'
    });
  }
});

router.delete('/projects/:id', requireAuth, async (req, res) => {
  try {
    await ensureUserContentTables();
    const result = await db.run('DELETE FROM design_projects WHERE id = ?', [req.params.id]);
    if (!result.changes) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== User Uploads ====================
router.get('/images', requireAuth, async (req, res) => {
  const purpose = normalizeImagePurpose(req.query.purpose);
  const search = String(req.query.q || '').trim().slice(0, 100);
  const requestedPage = normalizeInquiryPage(req.query.page);

  try {
    await ensureUserContentTables();
    const where = [];
    const params = [];

    if (purpose !== 'all') {
      where.push('i.purpose = ?');
      params.push(purpose);
    }
    if (search) {
      const pattern = `%${search}%`;
      where.push('(i.original_name LIKE ? OR i.id LIKE ? OR u.email LIKE ? OR u.name LIKE ?)');
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = await db.get(
      `SELECT COUNT(*) as count
       FROM user_images i
       LEFT JOIN users u ON u.id = i.user_id
       ${whereSql}`,
      params
    );
    const total = Number(totalRow?.count || 0);
    const pageCount = Math.max(1, Math.ceil(total / IMAGE_PAGE_SIZE));
    const page = Math.min(requestedPage, pageCount);
    const offset = (page - 1) * IMAGE_PAGE_SIZE;
    const items = await db.all(
      `SELECT
        i.id, i.user_id, i.url, i.original_name, i.mime_type,
        i.size_bytes, i.purpose, i.created_at,
        u.email as user_email, u.name as user_name
       FROM user_images i
       LEFT JOIN users u ON u.id = i.user_id
       ${whereSql}
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT ? OFFSET ?`,
      [...params, IMAGE_PAGE_SIZE, offset]
    );
    const stats = await db.get(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN purpose = 'artwork' THEN 1 ELSE 0 END) as artwork,
      SUM(CASE WHEN purpose = 'try-on-result' THEN 1 ELSE 0 END) as try_on,
      COUNT(DISTINCT user_id) as creators,
      COALESCE(SUM(size_bytes), 0) as storage_bytes
      FROM user_images`);

    res.render('admin/images', {
      title: 'User Uploads',
      page: 'admin-images',
      items: (items || []).map(item => ({
        ...item,
        image_url_safe: safeProjectPreviewUrl(item.url),
        purpose_label: imagePurposeLabel(item.purpose),
        size_display: formatImageBytes(item.size_bytes),
        created_at_display: formatInquiryDate(item.created_at)
      })),
      imageFilters: { purpose, search },
      imagePagination: { page, pageCount, total },
      imageStats: {
        total: Number(stats?.total || 0),
        artwork: Number(stats?.artwork || 0),
        tryOn: Number(stats?.try_on || 0),
        creators: Number(stats?.creators || 0),
        storage: formatImageBytes(stats?.storage_bytes)
      },
      error: ''
    });
  } catch (err) {
    console.error('Failed to load user uploads:', err);
    res.render('admin/images', {
      title: 'User Uploads',
      page: 'admin-images',
      items: [],
      imageFilters: { purpose, search },
      imagePagination: { page: 1, pageCount: 1, total: 0 },
      imageStats: { total: 0, artwork: 0, tryOn: 0, creators: 0, storage: '0 B' },
      error: 'User uploads could not be loaded.'
    });
  }
});

// ==================== 3D Models CRUD ====================
router.get('/models-3d', requireAuth, async (req, res) => {
  try {
    await ensureModel3dCategoryTable();
    const items = await db.all(`
      ${getAdminModel3dSelect()}
      GROUP BY m.id
      ORDER BY m.created_at DESC
    `);
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
    const { name, slug, category, category_ids, description, tags, status, file_url, image_url, texture_url } = req.body;
    const modelSlug = generateSlug(slug || name, `model-${Date.now()}`);
    const selectedCategoryIds = normalizeCategoryIds(category_ids, category);
    const selectedCategories = await getCategoriesByIds(selectedCategoryIds);
    const primaryCategory = selectedCategories[0];

    if (!primaryCategory) {
      return res.json({ success: false, error: 'Please select at least one active 3D category.' });
    }

    const result = await db.run(
      'INSERT INTO models_3d (name, slug, category, description, tags, file_url, image_url, texture_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, modelSlug, primaryCategory.name, description, tags, file_url, image_url, texture_url, status || 'active']
    );
    await syncModel3dCategories(result.lastID, selectedCategories.map(item => item.id));
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.put('/models-3d/:id', requireAuth, async (req, res) => {
  try {
    const { name, slug, category, category_ids, description, tags, status, file_url, image_url, texture_url } = req.body;
    const updates = [];
    const params = [];
    const selectedCategoryIds = normalizeCategoryIds(category_ids, category);
    const selectedCategories = await getCategoriesByIds(selectedCategoryIds);
    const primaryCategory = selectedCategories[0];

    if (!primaryCategory) {
      return res.json({ success: false, error: 'Please select at least one active 3D category.' });
    }

    await ensureModel3dCategoryTable();
    const existingModel = await db.get('SELECT slug FROM models_3d WHERE id = ?', [req.params.id]);
    if (!existingModel) {
      return res.status(404).json({ success: false, error: '3D model not found.' });
    }
    const nextSlug = generateSlug(slug || name, `model-${req.params.id}`);

    updates.push('name = ?'); params.push(name);
    updates.push('slug = ?'); params.push(nextSlug);
    updates.push('category = ?'); params.push(primaryCategory.name);
    updates.push('description = ?'); params.push(description);
    updates.push('tags = ?'); params.push(tags);
    updates.push('status = ?'); params.push(status);

    if (hasUploadValue(file_url)) {
      updates.push('file_url = ?');
      params.push(file_url);
    }
    if (hasUploadValue(image_url)) {
      updates.push('image_url = ?');
      params.push(image_url);
    }
    if (hasUploadValue(texture_url)) {
      updates.push('texture_url = ?');
      params.push(texture_url);
    }

    params.push(req.params.id);

    await db.run(
      'UPDATE models_3d SET ' + updates.join(', ') + ', updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      params
    );
    if (existingModel.slug && existingModel.slug !== nextSlug) {
      await db.run(
        `INSERT INTO model_3d_slug_redirects (old_slug, model_id)
         VALUES (?, ?)
         ON CONFLICT(old_slug) DO UPDATE SET model_id = excluded.model_id`,
        [existingModel.slug, req.params.id]
      );
    }
    await syncModel3dCategories(req.params.id, selectedCategories.map(item => item.id));
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.delete('/models-3d/:id', requireAuth, async (req, res) => {
  try {
    await ensureModel3dCategoryTable();
    await db.run('DELETE FROM model_3d_categories WHERE model_id = ?', [req.params.id]);
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
    await ensureEntitlementTables();
    const items = await db.all(`SELECT u.id, u.email, u.name, u.created_at,
      COALESCE(s.plan, 'free') AS plan, s.billing_interval, s.status AS subscription_status,
      s.current_period_end
      FROM users u LEFT JOIN user_subscriptions s ON s.user_id = u.id
      ORDER BY u.created_at DESC`);
    res.render('admin/users', { title: 'Users Management', page: 'admin-users', items: items || [] });
  } catch (err) {
    res.render('admin/users', { title: 'Users Management', page: 'admin-users', items: [] });
  }
});

router.patch('/users/:id/plan', requireAuth, async (req, res) => {
  const requestedPlan = String(req.body?.plan || '').trim().toLowerCase();
  const billingInterval = String(req.body?.billingInterval || '').trim().toLowerCase();
  if (!['free', 'pro', 'max', 'business'].includes(requestedPlan)) {
    return res.status(400).json({ success: false, error: 'Choose a valid plan.' });
  }
  if (requestedPlan !== 'free' && requestedPlan !== 'business' && !['monthly', 'yearly'].includes(billingInterval)) {
    return res.status(400).json({ success: false, error: 'Choose monthly or yearly billing.' });
  }

  try {
    await ensureEntitlementTables();
    const user = await db.get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    if (requestedPlan === 'free') {
      await db.run('DELETE FROM user_subscriptions WHERE user_id = ?', [req.params.id]);
    } else {
      const startedAt = new Date();
      const endsAt = new Date(startedAt);
      if (billingInterval === 'yearly' || requestedPlan === 'business') {
        endsAt.setUTCFullYear(endsAt.getUTCFullYear() + 1);
      } else {
        endsAt.setUTCMonth(endsAt.getUTCMonth() + 1);
      }
      const sqliteDate = date => date.toISOString().slice(0, 19).replace('T', ' ');
      await db.run(
        `INSERT INTO user_subscriptions
         (user_id, plan, billing_interval, status, current_period_start, current_period_end)
         VALUES (?, ?, ?, 'active', ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           plan = excluded.plan,
           billing_interval = excluded.billing_interval,
           status = 'active',
           current_period_start = excluded.current_period_start,
           current_period_end = excluded.current_period_end,
           updated_at = CURRENT_TIMESTAMP`,
        [
          req.params.id,
          normalizePlan(requestedPlan),
          requestedPlan === 'business' ? null : billingInterval,
          sqliteDate(startedAt),
          sqliteDate(endsAt)
        ]
      );
    }

    const entitlements = await getUserEntitlements(req.params.id);
    return res.json({ success: true, entitlements });
  } catch (error) {
    console.error('Admin plan update failed:', error);
    return res.status(500).json({ success: false, error: 'The user plan could not be updated.' });
  }
});

router.delete('/users/:id', requireAuth, async (req, res) => {
  try {
    await ensureEntitlementTables();
    await db.run('DELETE FROM user_entitlement_usage WHERE user_id = ?', [req.params.id]);
    await db.run('DELETE FROM user_subscriptions WHERE user_id = ?', [req.params.id]);
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

    const validFolders = ['d3', 'd2', 'image'];
    if (!validFolders.includes(folder)) {
      return res.status(400).json({ success: false, error: 'Invalid folder' });
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
