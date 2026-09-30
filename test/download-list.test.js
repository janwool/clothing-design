const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const script = fs.readFileSync(path.join(__dirname, '..', 'public/js/download-list.js'), 'utf8');

test('keeps rendering in Downloads after the dialog closes and downloads on completion', async () => {
  const handlers = {};
  const downloads = [];
  const dot = { hidden: true };
  const content = { innerHTML: '', addEventListener(name, handler) { handlers.contentClick = handler; } };
  const trigger = {
    offsetWidth: 50,
    classList: { add() {}, remove() {} },
    querySelector() { return dot; },
    addEventListener(name, handler) { handlers.triggerClick = handler; },
    getBoundingClientRect() { return { width: 80 }; },
    setAttribute() {}, contains() { return false; }, focus() {}
  };
  const panel = {
    hidden: true,
    querySelector(selector) { return selector === '.nav-downloads-content' ? content : { addEventListener() {} }; },
    contains() { return false; }
  };
  const document = {
    body: { append() {} },
    querySelector(selector) { return selector === '.nav-downloads-trigger' ? trigger : selector === '.nav-downloads-panel' ? panel : null; },
    createElement() { return { hidden: false, click() { downloads.push(this.href); }, remove() {} }; },
    addEventListener() {}
  };
  const window = { matchMedia() { return { matches: true }; } };
  vm.runInNewContext(script, {
    document, window, console, URL: { revokeObjectURL() {} }, setTimeout() {},
    fetch: async () => ({ ok: true, json: async () => ({ success: true, images: [] }) })
  });
  let finish;
  const run = () => new Promise(resolve => { finish = resolve; });
  window.DownloadList.start({ id: 'task-1', thumbnail: 'data:image/png;base64,AAAA', run });
  assert.equal(window.DownloadList.status('task-1'), 'rendering');
  assert.match(content.innerHTML, /Rendering image/);
  assert.match(content.innerHTML, /role="progressbar"/);
  window.DownloadList.reveal('task-1', { getBoundingClientRect() { return { width: 100 }; } });
  assert.equal(panel.hidden, false);
  finish({ id: 'image-1', url: 'https://cdn.example/image.png', name: 'render.png', downloadUrl: '/api/ai-render-export/image-1/download' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(window.DownloadList.status('task-1'), 'complete');
  assert.deepEqual(downloads, ['/api/ai-render-export/image-1/download']);
  assert.match(content.innerHTML, /render\.png/);

  let attempts = 0;
  window.DownloadList.start({
    id: 'task-2', thumbnail: 'data:image/png;base64,BBBB',
    run: async () => {
      attempts++;
      if (attempts === 1) throw new Error('AI rendering is temporarily unavailable.');
      return { id: 'image-2', url: 'https://cdn.example/retry.png', name: 'retry.png', downloadUrl: '/api/ai-render-export/image-2/download' };
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(window.DownloadList.status('task-2'), 'failed');
  assert.match(content.innerHTML, /data-retry-task/);
  handlers.contentClick({ target: { closest(selector) {
    if (selector === '[data-retry-task]') return { closest: () => ({ dataset: { taskId: 'task-2' } }) };
    return null;
  } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.equal(window.DownloadList.status('task-2'), 'complete');
  assert.deepEqual(downloads, ['/api/ai-render-export/image-1/download', '/api/ai-render-export/image-2/download']);
});
