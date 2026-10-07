const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sqlite3 = require('sqlite3');
const ejs = require('ejs');
const worker = require('../src/worker-templates.cjs');
const source = fs.readFileSync(require.resolve('../routes/admin'), 'utf8');
const handlerSource = source.slice(source.indexOf('async function loadAdminImages'), source.indexOf("router.get('/images'"));

test('render library queries only saved renders, searches owners, clamps pagination and handles failure', async () => {
  const database = new sqlite3.Database(':memory:');
  const run = (sql, params = []) => new Promise((resolve, reject) => database.run(sql, params, error => error ? reject(error) : resolve()));
  const db = {
    get: (sql, params = []) => new Promise((resolve, reject) => database.get(sql, params, (error, row) => error ? reject(error) : resolve(row))),
    all: (sql, params = []) => new Promise((resolve, reject) => database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)))
  };
  try {
    await run('CREATE TABLE users (id INTEGER, email TEXT, name TEXT)');
    await run('CREATE TABLE user_images (id TEXT, user_id INTEGER, url TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER, purpose TEXT, created_at TEXT)');
    await run("INSERT INTO users VALUES (1, 'maker@example.test', 'Maker'), (2, 'other@example.test', 'Other')");
    for (let i = 0; i < 32; i++) await run('INSERT INTO user_images VALUES (?, 1, ?, ?, ?, 100, ?, ?)', [String(i), 'https://cdn.example.test/render.png', `render-${i}.png`, 'image/png', 'ai-render-export', '2026-10-07']);
    await run("INSERT INTO user_images VALUES ('art', 2, '', 'art.png', 'image/png', 900, 'artwork', '2026-10-07')");
    const context = vm.createContext({ db, ensureUserContentTables: async () => {}, normalizeImagePurpose: () => 'all', normalizeInquiryPage: value => Number(value) || 1, IMAGE_PAGE_SIZE: 30, safeProjectPreviewUrl: value => value, imagePurposeLabel: () => 'Product render', formatImageBytes: value => String(value), formatInquiryDate: value => value, console: { error() {} } });
    vm.runInContext(handlerSource, context);
    async function load(query = {}) {
      let result, status = 200;
      const res = { set() {}, status(code) { status = code; return this; }, render(view, locals) { result = locals; } };
      await context.loadAdminImages({ path: '/renders', query }, res);
      return { result, status };
    }
    let { result } = await load({ purpose: 'artwork', page: '99' });
    assert.equal(result.imagePagination.page, 2);
    assert.equal(result.imagePagination.total, 32);
    assert.equal(result.items.length, 2);
    assert.equal(result.imageStats.total, 32);
    assert.equal(result.imageStats.storage, '3200');
    assert.equal(result.imageStats.creators, 1);
    ({ result } = await load({ q: 'maker@example.test' }));
    assert.equal(result.imagePagination.total, 32);
    ({ result } = await load({ q: "' OR 1=1 --" }));
    assert.equal(result.imagePagination.total, 0);
    await run('DROP TABLE user_images');
    const failed = await load();
    assert.equal(failed.status, 500);
    assert.match(failed.result.error, /Rendered images could not be loaded/);
  } finally { await new Promise(resolve => database.close(resolve)); }
});

test('render library preserves its search and pagination paths in Node and Worker, with empty/error states', () => {
  const filename = require.resolve('../views/admin/images.ejs');
  const base = { title: 'User Renders', page: 'admin-renders', i18next: { language: 'en' }, error: '', items: [], imageStats: { total: 0, creators: 0, storage: '0 B' }, imageFilters: { purpose: 'ai-render-export', search: '' }, imagePagination: { page: 1, pageCount: 1, total: 0 } };
  const renderers = [locals => ejs.render(fs.readFileSync(filename, 'utf8'), locals, { filename }), locals => worker.render('admin/images', locals)];
  for (const render of renderers) {
    const empty = render(base);
    assert.match(empty, /No rendered images yet/);
    assert.match(empty, /action="\/admin\/renders"/);
    assert.doesNotMatch(empty, /name="purpose"/);
    assert.match(render({ ...base, imageFilters: { ...base.imageFilters, search: 'absent' } }), /No matching renders/);
    const error = render({ ...base, error: 'Rendered images could not be loaded.' });
    assert.match(error, /role="alert"/);
    assert.doesNotMatch(error, /No rendered images yet/);
    const paged = render({ ...base, items: [{ id: '1', user_id: 1, purpose: 'ai-render-export', purpose_label: 'Product render', original_name: 'render.png', mime_type: 'image/png', image_url_safe: 'https://cdn.example.test/render.png', size_display: '1 KB', created_at_display: '7 Oct 2026' }], imagePagination: { page: 1, pageCount: 2, total: 31 }, imageFilters: { purpose: 'ai-render-export', search: 'render' } });
    assert.match(paged, /href="\/admin\/renders\?q=render[^\"]*page=2"/);
    assert.match(paged, /Open original/);
  }
  assert.match(source, /router\.get\('\/renders', requireProjectAdmin, loadAdminImages\)/);
});
