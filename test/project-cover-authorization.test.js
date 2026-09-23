const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function uploadRoute({ projectId, projectExists = false, allowed = false, storageAllowed = true, purpose = 'project-preview' } = {}) {
  const source = fs.readFileSync(require.resolve('../routes/user-content.js'), 'utf8');
  const start = source.indexOf("router.post('/api/user-images'");
  const end = source.indexOf('\n});', start) + 4;
  let handler;
  const calls = [];
  vm.runInNewContext(source.slice(start, end), {
    router: { post: (path, auth, fn) => { handler = fn; } }, requireUser() {},
    randomUUID: () => 'image-id', cleanPurpose: value => value,
    ensureUserContentTables: async () => {},
    canCreateProject: async () => ({ allowed, entitlements: {} }),
    limitError: resource => ({ success: false, resource, code: 'PLAN_LIMIT' }),
    db: {
      get: async (sql, params) => {
        assert.match(sql, /user_id = \? AND deleted_at IS NULL/);
        assert.deepEqual(Array.from(params), [projectId, 285]);
        return projectExists ? { id: projectId } : null;
      },
      run: async () => calls.push('image-record')
    },
    imageDataUrlBytes: () => 12,
    canStoreImage: async () => ({ allowed: storageAllowed, entitlements: {} }),
    uploadImageDataUrl: async () => { calls.push('upload'); return { key: 'key', url: '/cover', contentType: 'image/webp', size: 12 }; },
    imageStorageBase: () => 'key', cleanFileName: value => value, console,
    deleteObject: async () => calls.push('delete')
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return { calls, res, run: () => handler({ body: { projectId, purpose, dataUrl: 'data:image/webp;base64,test', name: 'cover' }, session: { user: { id: 285 } } }, res) };
}

test('over-limit cached clients are rejected before cover storage or metadata writes', async () => {
  const r = uploadRoute(); await r.run();
  assert.equal(r.res.statusCode, 403);
  assert.equal(r.res.body.resource, 'projects');
  assert.deepEqual(r.calls, []);
});

test('even an eligible account must reserve a project before uploading a cover', async () => {
  const r = uploadRoute({ allowed: true }); await r.run();
  assert.equal(r.res.statusCode, 400);
  assert.deepEqual(r.calls, []);
});

test('foreign, deleted, or missing project cannot authorize a cover', async () => {
  const r = uploadRoute({ projectId: 'unavailable-project' }); await r.run();
  assert.equal(r.res.statusCode, 404);
  assert.deepEqual(r.calls, []);
});

test('an owned project may update its cover even when the creation quota is full', async () => {
  const r = uploadRoute({ projectId: 'existing-project', projectExists: true }); await r.run();
  assert.equal(r.res.statusCode, 201);
  assert.deepEqual(r.calls, ['upload', 'image-record']);
});

test('storage limits still reject covers belonging to a valid project before upload', async () => {
  const r = uploadRoute({ projectId: 'existing-project', projectExists: true, storageAllowed: false }); await r.run();
  assert.equal(r.res.statusCode, 403);
  assert.equal(r.res.body.resource, 'storage');
  assert.deepEqual(r.calls, []);
});

test('ordinary artwork uploads do not require a saved project', async () => {
  const r = uploadRoute({ purpose: 'artwork' }); await r.run();
  assert.equal(r.res.statusCode, 201);
});

test('standalone editor uploads no cover until server permits project creation after upgrade', async () => {
  const source = fs.readFileSync(require.resolve('../views/designer-3d.ejs'), 'utf8');
  const start = source.indexOf('async function saveDesignerProject()');
  const end = source.indexOf('\nasync function loadDesignerProject()', start);
  let upgraded = false;
  const calls = [];
  const context = vm.createContext({
    designerUserAuthenticated: true, designerProjectState: {},
    designerSaveBtn: {}, designerSaveStatus: {},
    viewer: { toDataURL: () => { calls.push('render-cover'); return 'cover'; } },
    getDesignerProjectData: () => ({}), persistDesignerTryOnDesign() {}, syncDesignerTryOnLink() {},
    URL, console: { error() {} },
    window: {
      location: { pathname: '/3d-models/shirt/test/edit', href: 'https://example.com/3d-models/shirt/test/edit' },
      history: { replaceState() {} },
      UserProjects: {
        async saveProject(payload) {
          calls.push(payload.id ? 'finalize' : 'reserve');
          if (!upgraded) throw Object.assign(new Error('Upgrade required'), { status: 403 });
          return { id: 'authorized-project', name: 'Design' };
        },
        async uploadImage(data, name, purpose, id) {
          assert.equal(id, 'authorized-project');
          calls.push('upload'); return { url: '/cover' };
        }
      }
    }
  });
  vm.runInContext(source.slice(start, end).replace(/<%-[\s\S]*?%>/g, '"Model"').replace(/<%=[\s\S]*?%>/g, 'model'), context);
  await context.saveDesignerProject();
  assert.deepEqual(calls, ['reserve']);
  // Dismissing the upgrade UI does not authorize another attempt.
  await context.saveDesignerProject();
  assert.deepEqual(calls, ['reserve', 'reserve']);
  upgraded = true;
  await context.saveDesignerProject();
  assert.deepEqual(calls, ['reserve', 'reserve', 'reserve', 'render-cover', 'upload', 'finalize']);
});
