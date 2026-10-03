const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const editorSource = fs.readFileSync(path.join(__dirname, '..', 'public/js/white-mockup-editor.js'), 'utf8');
const start = editorSource.indexOf('  async function loadSavedProject() {');
const end = editorSource.indexOf('\n  input.addEventListener', start);
const loadSavedProjectSource = editorSource.slice(start, end);

function makeLoader(designData, failedUrls = []) {
  const attemptedUrls = [];
  const addedImages = [];
  const state = {};
  const status = [];
  const project = {
    id: 'project-1',
    name: 'Saved fashion mockup',
    sourceId: 'crewneck',
    previewImageUrl: '/preview.jpg',
    designData
  };
  const swatch = () => ({
    classList: { toggle() {} },
    setAttribute() {},
    querySelector: () => ({ style: { background: '' } })
  });
  const context = {
    window: {
      UserProjects: {
        isAdminPreview: false,
        loadProjectFromUrl: async () => project,
        textureUrl: url => `/api/project-texture?url=${encodeURIComponent(url)}`
      }
    },
    template: { assetName: 'crewneck', defaultScale: 60, defaultWarp: 42 },
    MAX_ARTWORK_IMAGES: 8,
    state,
    loadImage: async url => {
      attemptedUrls.push(url);
      if (failedUrls.includes(url)) throw new Error('Image unavailable');
      return { src: url };
    },
    setArtworkImage: (image, name, source, options) => addedImages.push({ image, name, source, options }),
    setStatus: value => status.push(value),
    backgroundLabel: { textContent: '' },
    garmentColorLabel: { textContent: '' },
    customBackground: { value: '' },
    customGarmentColor: { value: '' },
    backgroundButtons: [],
    garmentColorButtons: [],
    customBackgroundSwatch: swatch(),
    customGarmentColorSwatch: swatch(),
    scheduleRender() {},
    trackWhiteMockup() {},
    console: { error() {} }
  };
  vm.runInNewContext(`${loadSavedProjectSource}\nthis.runLoad = loadSavedProject;`, context);
  return { run: context.runLoad, attemptedUrls, addedImages, state, status };
}

test('loads a legacy Fashion project image through the authenticated texture route', async () => {
  const loader = makeLoader({ artworkUrl: 'https://cdn.example/art.png', artworkName: 'Logo', scale: 72 });
  await loader.run();
  assert.deepEqual(loader.attemptedUrls, ['/api/project-texture?url=https%3A%2F%2Fcdn.example%2Fart.png']);
  assert.equal(loader.addedImages.length, 1);
  assert.equal(loader.addedImages[0].options.scale, 72);
  assert.equal(loader.state.projectId, 'project-1');
  assert.equal(loader.status.at(-1), 'Saved project loaded.');
});

test('falls back to the saved image URL when the texture route is unavailable', async () => {
  const proxyUrl = '/api/project-texture?url=https%3A%2F%2Fcdn.example%2Fart.png';
  const loader = makeLoader({ artworkUrl: 'https://cdn.example/art.png' }, [proxyUrl]);
  await loader.run();
  assert.deepEqual(loader.attemptedUrls, [proxyUrl, 'https://cdn.example/art.png']);
  assert.equal(loader.addedImages.length, 1);
  assert.equal(loader.status.at(-1), 'Saved project loaded.');
});

test('restores saved garment and background gradients', async () => {
  const garmentColor = 'linear-gradient(180deg, #9db3c4 0%, #243653 100%)';
  const background = 'linear-gradient(90deg, #f7f7f4 0%, #d9d3c9 100%)';
  const loader = makeLoader({ artworks: [], garmentColor, background });
  await loader.run();
  assert.equal(loader.state.garmentColor, garmentColor);
  assert.equal(loader.state.background, background);
  assert.equal(loader.status.at(-1), 'Saved project loaded.');
});

test('does not partially restore a project when a later image cannot load', async () => {
  const first = 'https://cdn.example/one.png';
  const second = 'https://cdn.example/two.png';
  const loader = makeLoader({ artworks: [{ artworkUrl: first }, { artworkUrl: second }] }, [
    `/api/project-texture?url=${encodeURIComponent(second)}`,
    second
  ]);
  await loader.run();
  assert.equal(loader.addedImages.length, 0);
  assert.equal(loader.state.projectId, undefined);
  assert.equal(loader.status.at(-1), 'A saved image could not be opened.');
});
