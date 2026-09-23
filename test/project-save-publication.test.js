const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/js/model-designer.js'), 'utf8');
function extract(name, async = false) {
  const start = source.indexOf(`  ${async ? 'async ' : ''}function ${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}
function editor({ projectId = '', failAt, authenticated = true, missingClient = false } = {}) {
  const calls = [];
  const storage = new Map([['handoff', 'previous-handoff']]);
  const state = { projectId, projectName: 'Design', finalTextureUrl: 'previous-design', appliedTextureUrl: 'unsaved-draft' };
  let detail = 'previous-design';
  let closed = false;
  const context = vm.createContext({
    state, URL, sessionStorage: { setItem: (key, value) => storage.set(key, value) },
    tryOnDesignTransferKey: 'handoff',
    modelDesignerConfig: { userAuthenticated: authenticated, modelSlug: 'shirt', modelId: 1 },
    saveDesignModal: { classList: { add() {}, remove() {} } },
    clearHoveredTemplatePreview() {}, setAssetTrayOpen() {}, designAppearancePanel: null,
    designModal: { classList: { remove() { closed = true; } }, setAttribute() {} },
    document: { body: { style: {} } }, modalReturnFocus: null,
    setDesignSaveStatus() {}, console: { error() {}, warn() {} },
    rasterizeModelTexture: async () => 'new-design',
    applyFinalTextureToViewers: async texture => { calls.push('publish'); detail = texture; },
    applyTextureToModel: async () => { calls.push('editor-preview'); return true; },
    waitForPendingArtworkUploads: async () => {}, serializeProjectElements: () => '<g/>',
    serializeAppearanceState: () => ({}), captureProjectPreview: async () => 'data:image/webp;base64,test',
    window: {
      location: { href: 'https://example.com/3d-models/shirt/test', pathname: '/3d-models/shirt/test' },
      history: { replaceState() {} },
      UserProjects: missingClient ? undefined : {
        async saveProject(payload) {
          const step = payload.id ? 'finalize' : 'reserve';
          calls.push(step);
          // Neither reservation nor finalization may observe a published draft.
          assert.equal(detail, 'previous-design');
          assert.equal(storage.get('handoff'), 'previous-handoff');
          if (failAt === step) throw Object.assign(new Error('Save rejected'), { status: step === 'reserve' ? 403 : 500 });
          return { id: 'saved-project', name: 'Design' };
        },
        async uploadImage() { calls.push('upload'); return { url: 'https://example.com/preview.webp' }; }
      }
    }
  });
  vm.runInContext(extract('persistTryOnDesign') + extract('closeModal') + extract('saveCloudProject', true), context);
  return { context, calls, state, storage, detail: () => detail, closed: () => closed };
}

test('project limit rejection followed by closing the editor leaves detail and try-on unchanged', async () => {
  const e = editor({ failAt: 'reserve' });
  assert.equal(await e.context.saveCloudProject({ closeAfterSave: true }), false);
  assert.equal(e.closed(), false);
  // Dismissing the upgrade dialog does not grant an entitlement; close the editor.
  e.context.closeModal();
  assert.equal(e.closed(), true);
  assert.equal(e.detail(), 'previous-design');
  assert.equal(e.state.finalTextureUrl, 'previous-design');
  assert.equal(e.storage.get('handoff'), 'previous-handoff');
  assert.deepEqual(e.calls, ['reserve']);
});

for (const projectId of ['', 'existing-project']) {
  test(`failed final save preserves detail for ${projectId || 'new project'}`, async () => {
    const e = editor({ projectId, failAt: 'finalize' });
    assert.equal(await e.context.saveCloudProject(), false);
    e.context.closeModal();
    assert.equal(e.detail(), 'previous-design');
    assert.equal(e.state.finalTextureUrl, 'previous-design');
    assert.equal(e.storage.get('handoff'), 'previous-handoff');
    assert.equal(e.calls.includes('publish'), false);
  });
}

test('successful cloud save publishes the design and handoff before closing', async () => {
  const e = editor();
  assert.equal(await e.context.saveCloudProject({ closeAfterSave: true }), true);
  assert.deepEqual(e.calls, ['reserve', 'editor-preview', 'upload', 'finalize', 'publish']);
  assert.equal(e.detail(), 'new-design');
  assert.equal(JSON.parse(e.storage.get('handoff')).textureUrl, 'new-design');
  assert.equal(e.closed(), true);
});

test('authenticated users cannot fall back to local apply when the save client is missing', async () => {
  const e = editor({ missingClient: true });
  assert.equal(await e.context.saveCloudProject(), false);
  assert.equal(e.detail(), 'previous-design');
  assert.equal(e.storage.get('handoff'), 'previous-handoff');
});

test('try-on navigation cannot use a live editor draft when no design was committed', () => {
  const e = editor();
  e.state.finalTextureUrl = null;
  assert.equal(e.context.persistTryOnDesign(), false);
  assert.equal(e.storage.get('handoff'), 'previous-handoff');
});

test('guest apply retains its existing local behavior', async () => {
  const e = editor({ authenticated: false });
  assert.equal(await e.context.saveCloudProject({ closeAfterSave: true }), true);
  assert.deepEqual(e.calls, ['publish']);
  assert.equal(e.detail(), 'new-design');
});

test('detail viewer loading after a rejected draft uses only the last committed texture', () => {
  const start = source.indexOf("  detailViewer?.addEventListener('load', () => {");
  const end = source.indexOf('\n  });', start) + '\n  });'.length;
  for (const saved of [null, 'previous-design']) {
    const applied = [];
    vm.runInNewContext(source.slice(start, end), {
      detailViewer: { addEventListener: (name, callback) => callback() },
      state: { finalTextureUrl: saved, appliedTextureUrl: 'rejected-draft' },
      applyTextureToViewer: (viewer, texture) => applied.push(texture)
    });
    assert.deepEqual(applied, saved ? [saved] : []);
  }
});

test('material changes inside the editor do not change detail-page materials', async () => {
  const designer = { model: {} }, detail = { model: {} }, applied = [];
  const context = vm.createContext({
    state: { appliedTextureUrl: 'draft' }, designerViewer: designer, materialSwatchGrid: null,
    setDesignSaveStatus() {}, getLoadedDesignViewers: () => [designer, detail],
    applyMaterialToViewer: async viewer => applied.push(viewer),
    applyTextureToViewer: async viewer => applied.push(viewer)
  });
  vm.runInContext(extract('applyMaterialPreset', true), context);
  await context.applyMaterialPreset({ id: 'linen' }, { previewOnly: true });
  assert.deepEqual(applied, [designer, designer]);
});
