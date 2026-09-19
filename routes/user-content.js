const express = require('express');
const { randomUUID } = require('node:crypto');
const { Buffer } = require('node:buffer');
const db = require('../lib/db');
const { deleteObject, uploadImageDataUrl } = require('../lib/object-storage');
const { ensureUserContentTables } = require('../lib/user-content-db');
const {
  canCreateProject,
  canStoreImage,
  getUserEntitlements,
  imageDataUrlBytes,
  limitError
} = require('../lib/user-entitlements');
const { parseProjectRow, validateProjectPayload } = require('../lib/user-projects');
const { isAiTryOnEnabled } = require('../lib/feature-flags');

const router = express.Router();

function requireUser(req, res, next) {
  if (req.session?.user?.id) return next();
  if (String(req.path || '').startsWith('/api/')) {
    let returnPath = '/account/projects';
    try {
      const rawReferer = req.get('referer');
      if (rawReferer) {
        const referer = new URL(rawReferer, `${req.protocol}://${req.get('host')}`);
        if (referer.host === req.get('host')) returnPath = `${referer.pathname}${referer.search}${referer.hash}`;
      }
    } catch (error) {
      returnPath = '/account/projects';
    }
    const nextUrl = encodeURIComponent(returnPath);
    return res.status(401).json({ success: false, error: 'Please sign in to save your work.', loginUrl: `/auth/login?next=${nextUrl}` });
  }
  return res.redirect(`/auth/login?next=${encodeURIComponent(req.originalUrl || '/account/projects')}`);
}

function cleanFileName(value) {
  return String(value || 'image').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180) || 'image';
}

function cleanPurpose(value) {
  const purpose = String(value || 'artwork').toLowerCase();
  return ['artwork', 'project-preview', 'project-texture', 'try-on-result'].includes(purpose) ? purpose : 'artwork';
}

function imageStorageBase(userId, imageId, purpose) {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `users/${userId}/images/${now.getUTCFullYear()}/${month}/${purpose}/${imageId}`;
}

router.post('/api/user-images', requireUser, async (req, res) => {
  const imageId = randomUUID();
  const purpose = cleanPurpose(req.body?.purpose);
  let uploaded;
  try {
    await ensureUserContentTables();
    const incomingBytes = imageDataUrlBytes(req.body?.dataUrl);
    const storageAccess = await canStoreImage(req.session.user.id, incomingBytes);
    if (!storageAccess.allowed) {
      return res.status(403).json(limitError('storage', storageAccess.entitlements));
    }
    uploaded = await uploadImageDataUrl(req.body?.dataUrl, {
      keyBase: imageStorageBase(req.session.user.id, imageId, purpose),
      label: 'Uploaded image'
    });
    await db.run(
      `INSERT INTO user_images (id, user_id, storage_key, url, original_name, mime_type, size_bytes, purpose)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [imageId, req.session.user.id, uploaded.key, uploaded.url, cleanFileName(req.body?.name), uploaded.contentType, uploaded.size, purpose]
    );
    return res.status(201).json({
      success: true,
      image: { id: imageId, url: uploaded.url, name: cleanFileName(req.body?.name), mimeType: uploaded.contentType, size: uploaded.size, purpose }
    });
  } catch (error) {
    if (uploaded?.key) await deleteObject(uploaded.key).catch(() => {});
    console.error('User image upload failed:', error);
    return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Image could not be saved.' });
  }
});

router.get('/api/user-images', requireUser, async (req, res) => {
  try {
    await ensureUserContentTables();
    const requestedPurpose = String(req.query?.purpose || '').toLowerCase();
    const purpose = ['artwork', 'project-preview', 'project-texture', 'try-on-result'].includes(requestedPurpose)
      ? requestedPurpose
      : '';
    const rows = await db.all(
      `SELECT id, url, original_name, mime_type, size_bytes, purpose, created_at
       FROM user_images WHERE user_id = ?${purpose ? ' AND purpose = ?' : ''} ORDER BY created_at DESC LIMIT 100`,
      purpose ? [req.session.user.id, purpose] : [req.session.user.id]
    );
    return res.json({ success: true, images: rows.map(row => ({
      id: row.id, url: row.url, name: row.original_name, mimeType: row.mime_type,
      size: Number(row.size_bytes), purpose: row.purpose, createdAt: row.created_at
    })) });
  } catch (error) {
    console.error('User image list failed:', error);
    return res.status(500).json({ success: false, error: 'Images could not be loaded.' });
  }
});

router.get('/api/project-texture', requireUser, async (req, res) => {
  const textureUrl = String(req.query.url || '').trim();
  if (!textureUrl) return res.status(400).json({ success: false, error: 'Project texture URL is required.' });
  try {
    await ensureUserContentTables();
    const image = await db.get(
      'SELECT url, mime_type FROM user_images WHERE user_id = ? AND url = ? LIMIT 1',
      [req.session.user.id, textureUrl]
    );
    if (!image || !/^image\/(?:png|jpe?g|webp)$/i.test(image.mime_type || '')) {
      return res.status(404).json({ success: false, error: 'Project texture not found.' });
    }
    const response = await fetch(image.url);
    if (!response.ok) throw new Error(`Stored project texture returned ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    res.set('Cache-Control', 'private, max-age=300');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.type(image.mime_type).send(bytes);
  } catch (error) {
    console.error('Project texture proxy failed:', error);
    return res.status(502).json({ success: false, error: 'Project texture could not be loaded.' });
  }
});

router.get('/api/projects', requireUser, async (req, res) => {
  try {
    await ensureUserContentTables();
    const type = ['3d', 'white_mockup'].includes(req.query.type) ? req.query.type : '';
    const rows = await db.all(
      `SELECT * FROM design_projects WHERE user_id = ?${type ? ' AND project_type = ?' : ''} ORDER BY updated_at DESC LIMIT 100`,
      type ? [req.session.user.id, type] : [req.session.user.id]
    );
    return res.json({ success: true, projects: rows.map(row => parseProjectRow(row, false)) });
  } catch (error) {
    console.error('Project list failed:', error);
    return res.status(500).json({ success: false, error: 'Projects could not be loaded.' });
  }
});

router.get('/api/account/entitlements', requireUser, async (req, res) => {
  try {
    const entitlements = await getUserEntitlements(req.session.user.id);
    res.set('Cache-Control', 'private, no-store');
    return res.json({ success: true, entitlements });
  } catch (error) {
    console.error('Account entitlements failed:', error);
    return res.status(500).json({ success: false, error: 'Plan allowances could not be loaded.' });
  }
});

router.get('/api/projects/:id', requireUser, async (req, res) => {
  try {
    await ensureUserContentTables();
    const row = await db.get('SELECT * FROM design_projects WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id]);
    if (!row) return res.status(404).json({ success: false, error: 'Project not found.' });
    return res.json({ success: true, project: parseProjectRow(row) });
  } catch (error) {
    console.error('Project load failed:', error);
    return res.status(500).json({ success: false, error: 'Project could not be loaded.' });
  }
});

router.post('/api/projects', requireUser, async (req, res) => {
  const parsed = validateProjectPayload(req.body);
  if (!parsed.valid) return res.status(400).json({ success: false, error: parsed.error });
  const projectId = String(req.body?.id || '').match(/^[a-f0-9-]{36}$/i) ? String(req.body.id) : randomUUID();
  const project = parsed.value;
  try {
    await ensureUserContentTables();
    const existing = await db.get('SELECT id FROM design_projects WHERE id = ? AND user_id = ?', [projectId, req.session.user.id]);
    if (req.body?.id && !existing) return res.status(404).json({ success: false, error: 'Project not found.' });
    if (existing) {
      await db.run(
        `UPDATE design_projects SET project_type = ?, name = ?, source_id = ?, source_url = ?,
         preview_image_url = ?, design_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
        [project.projectType, project.name, project.sourceId, project.sourceUrl, project.previewImageUrl, project.serialized, projectId, req.session.user.id]
      );
    } else {
      const projectAccess = await canCreateProject(req.session.user.id);
      if (!projectAccess.allowed) {
        return res.status(403).json(limitError('projects', projectAccess.entitlements));
      }
      await db.run(
        `INSERT INTO design_projects (id, user_id, project_type, name, source_id, source_url, preview_image_url, design_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [projectId, req.session.user.id, project.projectType, project.name, project.sourceId, project.sourceUrl, project.previewImageUrl, project.serialized]
      );
    }
    const row = await db.get('SELECT * FROM design_projects WHERE id = ? AND user_id = ?', [projectId, req.session.user.id]);
    return res.status(existing ? 200 : 201).json({ success: true, project: parseProjectRow(row) });
  } catch (error) {
    console.error('Project save failed:', error);
    return res.status(500).json({ success: false, error: 'Project could not be saved.' });
  }
});

router.patch('/api/projects/:id', requireUser, async (req, res) => {
  const name = String(req.body?.name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!name) return res.status(400).json({ success: false, error: 'Project name is required.' });
  try {
    await ensureUserContentTables();
    const result = await db.run(
      'UPDATE design_projects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [name, req.params.id, req.session.user.id]
    );
    if (!result.changes) return res.status(404).json({ success: false, error: 'Project not found.' });
    const row = await db.get('SELECT * FROM design_projects WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id]);
    return res.json({ success: true, project: parseProjectRow(row) });
  } catch (error) {
    console.error('Project rename failed:', error);
    return res.status(500).json({ success: false, error: 'Project could not be renamed.' });
  }
});

router.post('/api/projects/:id/duplicate', requireUser, async (req, res) => {
  try {
    await ensureUserContentTables();
    const source = await db.get('SELECT * FROM design_projects WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id]);
    if (!source) return res.status(404).json({ success: false, error: 'Project not found.' });
    const projectAccess = await canCreateProject(req.session.user.id);
    if (!projectAccess.allowed) {
      return res.status(403).json(limitError('projects', projectAccess.entitlements));
    }
    const projectId = randomUUID();
    const copyName = `${source.name} Copy`.slice(0, 120);
    await db.run(
      `INSERT INTO design_projects (id, user_id, project_type, name, source_id, source_url, preview_image_url, design_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectId, req.session.user.id, source.project_type, copyName, source.source_id, source.source_url, source.preview_image_url, source.design_data]
    );
    const row = await db.get('SELECT * FROM design_projects WHERE id = ? AND user_id = ?', [projectId, req.session.user.id]);
    return res.status(201).json({ success: true, project: parseProjectRow(row) });
  } catch (error) {
    console.error('Project duplicate failed:', error);
    return res.status(500).json({ success: false, error: 'Project could not be duplicated.' });
  }
});

router.delete('/api/projects/:id', requireUser, async (req, res) => {
  try {
    await ensureUserContentTables();
    const result = await db.run('DELETE FROM design_projects WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id]);
    if (!result.changes) return res.status(404).json({ success: false, error: 'Project not found.' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Project delete failed:', error);
    return res.status(500).json({ success: false, error: 'Project could not be deleted.' });
  }
});

router.delete('/api/user-images/:id', requireUser, async (req, res) => {
  try {
    await ensureUserContentTables();
    const image = await db.get('SELECT * FROM user_images WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id]);
    if (!image) return res.status(404).json({ success: false, error: 'Image not found.' });
    const projects = await db.all(
      'SELECT id, design_data, preview_image_url FROM design_projects WHERE user_id = ?',
      [req.session.user.id]
    );
    const inUse = projects.some(project => project.preview_image_url === image.url || String(project.design_data || '').includes(image.url));
    if (inUse) return res.status(409).json({ success: false, error: 'This image is used by a saved project and cannot be deleted.' });
    await deleteObject(image.storage_key);
    await db.run('DELETE FROM ai_try_on_results WHERE image_id = ? AND user_id = ?', [req.params.id, req.session.user.id]);
    await db.run('DELETE FROM user_images WHERE id = ? AND user_id = ?', [req.params.id, req.session.user.id]);
    return res.json({ success: true });
  } catch (error) {
    console.error('User image delete failed:', error);
    return res.status(500).json({ success: false, error: 'Image could not be deleted.' });
  }
});

router.patch('/api/account', requireUser, async (req, res) => {
  const name = String(req.body?.name || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (name.length < 2) return res.status(400).json({ success: false, error: 'Name must contain at least 2 characters.' });
  try {
    const result = await db.run('UPDATE users SET name = ? WHERE id = ?', [name, req.session.user.id]);
    if (!result.changes) return res.status(404).json({ success: false, error: 'Account not found.' });
    req.session.user.name = name;
    return res.json({ success: true, user: { ...req.session.user } });
  } catch (error) {
    console.error('Account update failed:', error);
    return res.status(500).json({ success: false, error: 'Account could not be updated.' });
  }
});

const workspacePages = {
  overview: {
    template: 'account/overview',
    title: 'Workspace - ClozDesign',
    description: 'Review your ClozDesign projects, storage, and recent activity.'
  },
  projects3d: {
    template: 'account/projects-3d',
    title: '3D Projects - ClozDesign Workspace',
    description: 'Organize and continue your saved 3D clothing projects.'
  },
  whiteMockups: {
    template: 'account/white-mockups',
    title: 'Fashion Mockups - ClozDesign Workspace',
    description: 'Organize and continue your saved fashion mockup projects.'
  },
  settings: {
    template: 'account/settings',
    title: 'Account Settings - ClozDesign',
    description: 'Manage your ClozDesign account profile.'
  }
};

async function renderWorkspace(req, res, pageKey = 'overview') {
  try {
    await ensureUserContentTables();
    const [projectRows, imageRows, account, entitlements] = await Promise.all([
      db.all('SELECT * FROM design_projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100', [req.session.user.id]),
      db.all(`SELECT id, url, original_name, mime_type, size_bytes, purpose, created_at
              FROM user_images WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`, [req.session.user.id]),
      db.get('SELECT id, email, name, created_at FROM users WHERE id = ?', [req.session.user.id]),
      getUserEntitlements(req.session.user.id)
    ]);
    const projects = projectRows.map(row => parseProjectRow(row, false));
    const images = imageRows.map(row => ({
      id: row.id,
      url: row.url,
      name: row.original_name,
      mimeType: row.mime_type,
      size: Number(row.size_bytes) || 0,
      purpose: row.purpose,
      createdAt: row.created_at
    }));
    const workspaceStats = {
      totalProjects: projects.length,
      projects3d: projects.filter(project => project.projectType === '3d').length,
      whiteMockups: projects.filter(project => project.projectType === 'white_mockup').length,
      storageBytes: images.reduce((total, image) => total + image.size, 0)
    };
    const pageConfig = workspacePages[pageKey] || workspacePages.overview;
    return res.render(pageConfig.template, {
      title: pageConfig.title,
      metaDescription: pageConfig.description,
      metaRobots: 'noindex,nofollow',
      page: 'account',
      pageStyles: ['/css/account-workspace.css?v=20260915-ai-disabled-v13'],
      projects,
      account: account || req.session.user,
      workspaceStats,
      entitlements,
      aiTryOnEnabled: isAiTryOnEnabled(),
      checkoutState: req.query?.checkout === 'success' ? 'success' : ''
    });
  } catch (error) {
    console.error('Workspace page failed:', error);
    return res.status(500).render('error', { title: 'Workspace unavailable', page: 'account' });
  }
}

function renderWorkspacePage(pageKey) {
  return (req, res) => renderWorkspace(req, res, pageKey);
}

router.get('/account', requireUser, renderWorkspacePage('overview'));
router.get('/account/projects/3d', requireUser, renderWorkspacePage('projects3d'));
router.get('/account/projects/white-mockups', requireUser, renderWorkspacePage('whiteMockups'));
router.get('/account/projects', requireUser, (req, res) => res.redirect('/account/projects/3d'));
router.get('/account/artwork', requireUser, (req, res) => res.redirect('/account'));
router.get('/account/settings', requireUser, renderWorkspacePage('settings'));

module.exports = router;
