const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const detail = fs.readFileSync(require.resolve('../views/model-detail.ejs'), 'utf8');
const editor = fs.readFileSync(require.resolve('../public/js/model-designer.js'), 'utf8');
const entry = detail.slice(detail.indexOf('const detailEntryParams ='), detail.indexOf('const defaultDetailRenderStandard ='));
const material = detail.slice(detail.indexOf('async function applyCatalogMaterialResponse('), detail.indexOf('\ndetailRenderStandardPromise.then('));

test('entry color applies to loaded detail materials without changing ordinary or saved project colors', async () => {
  for (const [search, expected] of [['?color=171717', [23/255,23/255,23/255,1]], ['', [.96,.96,.95,1]], ['?color=invalid', [.96,.96,.95,1]], ['?color=171717&project=saved', [.96,.96,.95,1]], ['?color=171717&adminProject=saved', [.96,.96,.95,1]]]) {
    let factor, loaded = false;
    const standard = { material: { baseColor: [.96,.96,.95], neutralizeBaseColor: true } };
    const element = { dataset: { catalogRenderStandard: 'main' }, model: { materials: [{ ensureLoaded: async () => { loaded=true; }, pbrMetallicRoughness: { setBaseColorFactor: value => { factor=Array.from(value); } } }] } };
    const context = { URLSearchParams, window: { location: { search } }, detailSceneStandard: standard, defaultDetailRenderStandard: standard, element };
    await vm.runInNewContext(entry + material + '\napplyCatalogMaterialResponse(element)', context);
    assert.deepEqual(factor, expected);
    if (search === '?color=171717') assert.equal(loaded, true);
  }
});

test('editor entry fills the garment only for a new design, preserving saved project appearance', async () => {
  const start = editor.indexOf('  cloudProjectLoadPromise = loadCloudProject().then');
  const end = editor.indexOf('\n\n  let pendingArtwork', start);
  for (const search of ['?color=171717', '?color=171717&project=saved', '?color=171717&adminProject=saved']) {
    const applied = [];
    const context = { URLSearchParams, window: { location: { search } }, modelDesignerConfig: { initialGarmentColor: '#171717' }, loadCloudProject: async () => {}, applyQuickColor: async color => applied.push(color) };
    vm.runInNewContext(editor.slice(start, end), context);
    await context.cloudProjectLoadPromise;
    assert.deepEqual(applied, search === '?color=171717' ? ['#171717'] : []);
  }
});
