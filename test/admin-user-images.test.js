const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const adminRoute = fs.readFileSync(path.join(root, 'routes', 'admin.js'), 'utf8');
const imageView = fs.readFileSync(path.join(root, 'views', 'admin', 'images.ejs'), 'utf8');
const sidebar = fs.readFileSync(path.join(root, 'views', 'admin', 'partials', 'sidebar.ejs'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'views', 'admin', 'dashboard.ejs'), 'utf8');
const workerTemplates = require('../src/worker-templates.cjs');

test('admin exposes a paginated and searchable user upload library', () => {
  assert.match(adminRoute, /router\.get\('\/images', requireAuth/);
  assert.match(adminRoute, /FROM user_images i/);
  assert.match(adminRoute, /LEFT JOIN users u ON u\.id = i\.user_id/);
  assert.match(adminRoute, /i\.purpose = \?/);
  assert.match(adminRoute, /LIMIT \? OFFSET \?/);
  assert.match(adminRoute, /imagePagination: \{ page, pageCount, total \}/);
});

test('admin upload page provides previews, search, filters, and image metadata', () => {
  assert.match(imageView, /name="q"/);
  assert.match(imageView, /name="purpose"/);
  assert.match(imageView, /item\.image_url_safe/);
  assert.match(imageView, /item\.user_email/);
  assert.match(imageView, /item\.size_display/);
  assert.match(imageView, /item\.mime_type/);
});

test('admin navigation and dashboard link to user uploads', () => {
  assert.match(sidebar, /href="\/admin\/images"/);
  assert.match(sidebar, /page === 'admin-images'/);
  assert.match(dashboard, /counts\.images/);
});

test('renders the user upload library in the Worker template runtime', () => {
  assert.equal(workerTemplates.has('admin/images'), true);
  const html = workerTemplates.render('admin/images', {
    title: 'User Uploads',
    page: 'admin-images',
    i18next: { language: 'en' },
    error: '',
    imageStats: { total: 1, artwork: 1, tryOn: 0, creators: 1, storage: '512 KB' },
    imageFilters: { purpose: 'all', search: '' },
    imagePagination: { page: 1, pageCount: 1, total: 1 },
    items: [{
      id: 'image-test',
      user_id: 7,
      original_name: 'front-logo.png',
      mime_type: 'image/png',
      purpose: 'artwork',
      purpose_label: 'Artwork',
      size_display: '512 KB',
      image_url_safe: 'https://cdn.example.com/front-logo.png',
      user_email: 'maker@example.com',
      user_name: 'Maker',
      created_at_display: '14 Sep 2026, 12:00'
    }]
  });
  assert.match(html, /front-logo\.png/);
  assert.match(html, /maker@example\.com/);
  assert.match(html, /512 KB/);
});
