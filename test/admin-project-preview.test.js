const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const db = require('../lib/db');
const { requireProjectAdmin } = require('../lib/project-admin-auth');

test('project inspection fails closed and checks database identity against the admin allowlist', async () => {
  const original = db.get;
  const originalEmails = process.env.ADMIN_EMAILS;
  const response = () => ({ code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });
  try {
    process.env.ADMIN_EMAILS = 'owner@example.com';
    let accepted = false;
    let res = response();
    await requireProjectAdmin({ session: {} }, res, () => { accepted = true; });
    assert.equal(res.code, 401);
    db.get = async () => ({ email: 'customer@example.com' });
    res = response();
    await requireProjectAdmin({ session: { user: { id: 2, email: 'owner@example.com' } } }, res, () => { accepted = true; });
    assert.equal(res.code, 403);
    assert.equal(accepted, false);
    db.get = async () => ({ email: 'OWNER@example.com' });
    await requireProjectAdmin({ session: { user: { id: 1 } } }, response(), () => { accepted = true; });
    assert.equal(accepted, true);
    delete process.env.ADMIN_EMAILS;
    res = response();
    await requireProjectAdmin({ session: { user: { id: 1 } } }, res, () => assert.fail('unconfigured access'));
    assert.equal(res.code, 403);
  } finally {
    db.get = original;
    if (originalEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalEmails;
  }
});

test('preview client loads admin designs and blocks all project/image writes', async () => {
  const calls = [];
  const element = () => ({ style: {}, setAttribute() {}, appendChild() {} });
  const window = { location: { search: '?adminProject=deleted-project' }, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/user-projects.js'), 'utf8'), {
    window, document: { createElement: element, body: element() }, URLSearchParams, AbortController,
    fetch: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => ({ project: { projectType: '3d', designData: { color: 'red' } } }) };
    }
  });
  const api = window.UserProjects;
  assert.equal(api.isAdminPreview, true);
  assert.equal((await api.loadProjectFromUrl('3d')).designData.color, 'red');
  assert.equal(calls[0], '/admin/projects/deleted-project/design');
  assert.equal(api.textureUrl('https://cdn.example/art.png'), '/admin/projects/deleted-project/texture?url=https%3A%2F%2Fcdn.example%2Fart.png');
  await assert.rejects(api.saveProject({}), /does not save/);
  await assert.rejects(api.uploadImage('data:image/png;base64,AA', 'image'), /does not save/);
  assert.equal(calls.length, 1);
});

test('admin routes restore deleted design data, scope textures to the owner, and redirect to the correct editor', async () => {
  const originalGet = db.get;
  const schema = require('../lib/user-content-db');
  const originalEnsure = schema.ensureUserContentTables;
  const previousWorker = process.env.CF_WORKER;
  process.env.CF_WORKER = 'true';
  schema.ensureUserContentTables = async () => {};
  try {
    const router = require('../routes/admin');
    const invoke = async path => {
      const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods.get).route;
      assert.equal(route.stack[0].handle, requireProjectAdmin);
      const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; }, send(data) { this.data = data; return this; }, redirect(url) { this.url = url; return this; } };
      await route.stack.at(-1).handle({ params: { id: 'deleted-project' }, query: { url: 'https://cdn.example/other.png' } }, res);
      return res;
    };
    db.get = async () => ({ id: 'deleted-project', project_type: '3d', source_url: '/3d-models/tee?project=old', design_data: '{"color":"red"}', deleted_at: '2026-09-20' });
    const design = await invoke('/projects/:id/design');
    assert.equal(design.data.project.deletedAt, '2026-09-20');
    assert.equal(design.data.project.designData.color, 'red');
    assert.equal((await invoke('/projects/:id/view')).url, '/3d-models/tee?adminProject=deleted-project');
    db.get = async sql => { assert.match(sql, /p.user_id = i.user_id/); return null; };
    assert.equal((await invoke('/projects/:id/texture')).code, 404);
  } finally {
    db.get = originalGet;
    schema.ensureUserContentTables = originalEnsure;
    if (previousWorker === undefined) delete process.env.CF_WORKER;
    else process.env.CF_WORKER = previousWorker;
  }
});

test('3D detail initializes the saved design runtime for admin previews', () => {
  const template = fs.readFileSync(require.resolve('../views/model-detail.ejs'), 'utf8');
  assert.match(template, /projectParams.has\('project'\) \|\| projectParams.has\('adminProject'\)/);
});
