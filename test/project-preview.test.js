const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/js/ai-try-on.js'), 'utf8');
function runFunction(name, globals) {
  const start = source.indexOf(`  async function ${name}(`);
  const end = source.indexOf('\n  }', start) + 4;
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext(globals);
  vm.runInContext(source.slice(start, end), context);
  return context[name]();
}
function resolve(project, transfer = null, transferProjectId = '') {
  return runFunction('resolveCurrentDesign', {
    root: { dataset: {} },
    window: { location: { search: '?project=saved-project' }, UserProjects: { loadProjectFromUrl: async () => project } },
    URLSearchParams,
    projectMatchesCurrentModel: () => true,
    readTransferredDesign: () => transfer,
    sanitizeTextureTransform: value => value,
    sessionStorage: { getItem: () => JSON.stringify({ projectId: transferProjectId }) },
    tryOnDesignTransferKey: 'handoff'
  });
}

test('new projects use the saved 3D screenshot for try-on when no texture is stored', async () => {
  const design = await resolve({ id: 'saved-project', previewImageUrl: 'https://cdn.example/cover.webp', designData: { elements: '<g />' } });
  assert.equal(design.textureUrl, '');
  assert.equal(design.previewImageUrl, 'https://cdn.example/cover.webp');
});

test('legacy projects continue to use their saved 2D texture, never the cover as a texture', async () => {
  const design = await resolve({ id: 'saved-project', previewImageUrl: 'https://cdn.example/cover.webp', designData: { textureUrl: 'https://cdn.example/texture.png' } });
  assert.equal(design.textureUrl, 'https://cdn.example/texture.png');
  assert.equal(design.previewImageUrl, '');
});

test('only a matching project can reuse the full-resolution in-memory try-on handoff', async () => {
  const project = { id: 'saved-project', previewImageUrl: 'https://cdn.example/cover.webp', designData: {} };
  const transfer = { textureUrl: 'data:image/png;base64,eA==' };
  assert.equal(await resolve(project, transfer, 'saved-project'), transfer);
  assert.equal((await resolve(project, transfer, 'another-project')).previewImageUrl, project.previewImageUrl);
});

test('try-on sends the saved screenshot without requiring a new WebGL capture', async () => {
  const urls = [];
  const result = await runFunction('captureGarmentImage', {
    designLoadPromise: Promise.resolve(true),
    savedProjectPreviewUrl: '/api/project-texture?url=cover',
    imageUrlToDataUri: async url => { urls.push(url); return 'data:image/jpeg;base64,eA=='; }
  });
  assert.equal(result, 'data:image/jpeg;base64,eA==');
  assert.deepEqual(urls, ['/api/project-texture?url=cover']);
});

test('mobile cover capture reveals the current editor and restores the 2D view even on failure', async () => {
  const designerSource = fs.readFileSync(path.join(__dirname, '../public/js/model-designer.js'), 'utf8');
  const start = designerSource.indexOf('  async function captureProjectPreview(');
  const end = designerSource.indexOf('\n  }', start) + 4;
  for (const fail of [false, true]) {
    const textureDesigner = { dataset: { designView: '2d' } };
    const viewer = { getBoundingClientRect: () => ({ width: 0 }), updateComplete: Promise.resolve() };
    const context = vm.createContext({
      textureDesigner, designerViewer: viewer,
      getActiveRenderViewer: () => viewer,
      requestAnimationFrame: callback => callback(),
      waitForVisibleModelRender: async actual => {
        assert.equal(actual, viewer);
        assert.equal(textureDesigner.dataset.designView, '3d');
      },
      captureModelViewerImage: async () => {
        assert.equal(textureDesigner.dataset.designView, '3d');
        if (fail) throw new Error('capture failed');
        return 'current-design';
      },
      compressProjectPreview: async image => image
    });
    vm.runInContext(designerSource.slice(start, end), context);
    if (fail) await assert.rejects(context.captureProjectPreview(), /capture failed/);
    else assert.equal(await context.captureProjectPreview(), 'current-design');
    assert.equal(textureDesigner.dataset.designView, '2d');
  }
});

test('garment thumbnails remove off-centre canvas padding and fit without clipping', async () => {
  const pixels = new Uint8ClampedArray(8 * 6 * 4);
  for (let y = 2; y <= 4; y++) for (let x = 1; x <= 2; x++) pixels[(y * 8 + x) * 4 + 3] = 255;
  let draw, closed = false, canvases = 0;
  const result = await runFunction('captureGarmentThumbnail', {
    viewer: { toBlob: async options => { assert.equal(options.idealAspect, true); return {}; } },
    createImageBitmap: async () => ({ width: 8, height: 6, close: () => { closed = true; } }),
    document: { createElement: () => {
      const sourceCanvas = canvases++ === 0;
      return { getContext: () => sourceCanvas
        ? { drawImage() {}, getImageData: () => ({ data: pixels }) }
        : { drawImage: (...args) => { draw = args; } }, toDataURL: () => 'framed-garment' };
    } }
  });
  assert.equal(result, 'framed-garment');
  assert.deepEqual(draw.slice(1, 5), [1, 2, 2, 3]);
  const [x, y, width, height] = draw.slice(5);
  assert.ok(Math.abs(x + width / 2 - 240) < .001);
  assert.ok(Math.abs(y + height / 2 - 280) < .001);
  assert.ok(width <= 480 * .82 && height <= 560 * .82);
  assert.equal(closed, true);
});
