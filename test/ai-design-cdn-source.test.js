const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/js/model-designer.js'), 'utf8');
const start = source.indexOf('    async applyAiDesign(source) {');
const end = source.indexOf('    openColorPicker(', start);

function setup(failLoad = false) {
  const state = { uploadedAssetUrls: new Map(), svgWidth: 1024, svgHeight: 1024 };
  const loaded = [], imported = [];
  const png = 'data:image/png;base64,test';
  const viewer = { model: { materials: [] } };
  const elements = { innerHTML: 'existing artwork', replaceChildren() { this.innerHTML = ''; } };
  const context = {
    state, textureElements: elements, detailViewer: viewer, designerViewer: null,
    cloudProjectLoadPromise: Promise.resolve(), loadTextureDimensions: async () => {},
    resolveArtworkDataUrl: async url => { loaded.push(url); if (failLoad) throw Error('CDN unavailable'); return png; },
    loadViewerTextureImage: async () => {}, captureViewerBaseColorTextures: () => [],
    createElement: (_, options) => { imported.push(options); return {querySelector: () => ({setAttribute() {}})}; },
    clearSelection() {}, rasterizeModelTexture: async () => png,
    applyTextureToViewer: async () => true, captureModelViewerImage: async () => 'preview',
    saveHistory() {}, setDesignSaveStatus() {}, restoreViewerBaseColorTextures() {}
  };
  vm.runInNewContext('this.api = {\n' + source.slice(start,end) + '\n};',context);
  return { context, state, loaded, imported, elements, png };
}

test('CDN atlas is loaded and its persistent URL is associated with editable image data', async () => {
  const h = setup();
  const url = 'https://cdn.cloz-design.com/users/1/images/design-texture.png';
  assert.equal(await h.context.api.applyAiDesign(url),'preview');
  assert.deepEqual(h.loaded,[url]);
  assert.equal(h.imported[0].src,h.png);
  assert.equal(h.state.uploadedAssetUrls.get(h.png),url);
});

test('a failed CDN retrieval preserves existing artwork', async () => {
  const h = setup(true);
  await assert.rejects(h.context.api.applyAiDesign('https://cdn.cloz-design.com/unavailable.png'),/CDN unavailable/);
  assert.equal(h.elements.innerHTML,'existing artwork');
  assert.equal(h.imported.length,0);
  assert.equal(h.state.uploadedAssetUrls.size,0);
});
