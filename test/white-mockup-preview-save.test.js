const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/white-mockup-editor.js'), 'utf8');

function makeSaver(previewImageUrl = '/existing.jpg') {
  const uploads = [];
  const projects = [];
  const state = {
    ready: true, layers: [{ artworkUrl: '/art.png', artworkName: 'Logo' }],
    projectId: 'project-1', projectName: 'Logo', projectPreviewUrl: previewImageUrl,
    pendingPreviewDataUrl: null, artworkRevision: 0
  };
  const context = {
    state, editor: { dataset: { authenticated: 'true' } },
    template: { assetName: 'tee' }, canvas: { toDataURL: () => 'initial-preview' },
    captureActiveLayer() {}, render() {}, scheduleRender() {}, setStatus() {}, trackWhiteMockup() {},
    window: {
      clearTimeout() {}, setTimeout: () => 1,
      location: { pathname: '/fashion/tee', href: 'https://example.com/fashion/tee' },
      history: { replaceState() {} },
      UserProjects: {
        uploadImage: async data => { uploads.push(data); return { url: '/new-preview.jpg' }; },
        saveProject: async project => { projects.push(project); return { ...project, id: 'project-1' }; }
      }
    }, URL, console
  };
  const start = source.indexOf('  function queueProjectSave(');
  const end = source.indexOf('  async function loadSavedProject()', start);
  vm.runInNewContext(source.slice(start, end) + '\nthis.queue = queueProjectSave; this.save = saveProject;', context);
  return { state, uploads, projects, queue: context.queue, save: context.save };
}

test('ordinary edits save design data without uploading another preview', async () => {
  const saver = makeSaver();
  for (let i = 0; i < 3; i++) { saver.queue(); await saver.save(); }
  assert.equal(saver.uploads.length, 0);
  assert.equal(saver.projects.length, 3);
});

test('initial preview is uploaded once and retained for later edits', async () => {
  const saver = makeSaver('');
  saver.queue(); await saver.save();
  saver.queue(); await saver.save();
  assert.deepEqual(saver.uploads, ['initial-preview']);
});

test('download preview is uploaded once, then reused for ordinary edits', async () => {
  const saver = makeSaver();
  saver.queue({ immediate: true, previewDataUrl: 'downloaded-preview' }); await saver.save();
  saver.queue(); await saver.save();
  assert.deepEqual(saver.uploads, ['downloaded-preview']);
  assert.equal(saver.state.pendingPreviewDataUrl, null);
});

test('denied export access does not generate or queue a preview', async () => {
  let queued = 0;
  let rendered = 0;
  const context = {
    window: { ExportEntitlements: { requireExportAccess: async () => false } },
    queueProjectSave: () => queued++, render: () => rendered++
  };
  const start = source.indexOf('  async function downloadMockup()');
  const end = source.indexOf('  function queueProjectSave(', start);
  vm.runInNewContext(source.slice(start, end) + '\nthis.download = downloadMockup;', context);
  await context.download();
  assert.equal(queued, 0);
  assert.equal(rendered, 0);
});
