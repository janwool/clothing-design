const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const adminRoute = fs.readFileSync(path.join(root, 'routes', 'admin.js'), 'utf8');
const projectView = fs.readFileSync(path.join(root, 'views', 'admin', 'projects.ejs'), 'utf8');
const sidebar = fs.readFileSync(path.join(root, 'views', 'admin', 'partials', 'sidebar.ejs'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'views', 'admin', 'dashboard.ejs'), 'utf8');
const workerTemplates = require('../src/worker-templates.cjs');

test('admin exposes a paginated, searchable user project library', () => {
  assert.match(adminRoute, /router\.get\('\/projects', requireAuth/);
  assert.match(adminRoute, /LEFT JOIN users u ON u\.id = p\.user_id/);
  assert.match(adminRoute, /p\.project_type = \?/);
  assert.match(adminRoute, /LIMIT \? OFFSET \?/);
  assert.match(adminRoute, /projectPagination: \{ page, pageCount, total \}/);
});

test('admin user project page supports project filters, previews and deletion', () => {
  assert.match(projectView, /name="q"/);
  assert.match(projectView, /name="type"/);
  assert.match(projectView, /item\.preview_image_url_safe/);
  assert.match(projectView, /data-delete-project/);
  assert.match(adminRoute, /router\.delete\('\/projects\/:id', requireAuth/);
});

test('admin navigation and dashboard link to user projects', () => {
  assert.match(sidebar, /href="\/admin\/projects"/);
  assert.match(sidebar, /page === 'admin-projects'/);
  assert.match(dashboard, /counts\.projects/);
});

test('renders the user project library in the Worker template runtime', () => {
  assert.equal(workerTemplates.has('admin/projects'), true);
  const html = workerTemplates.render('admin/projects', {
    title: 'User Projects',
    page: 'admin-projects',
    i18next: { language: 'en' },
    error: '',
    projectStats: { total: 1, projects3d: 1, whiteMockups: 0, creators: 1 },
    projectFilters: { type: 'all', search: '' },
    projectPagination: { page: 1, pageCount: 1, total: 1 },
    items: [{
      id: 'project-test',
      user_id: 7,
      project_type: '3d',
      name: 'Test Jacket',
      source_id: 'jacket',
      source_url_safe: '/3d-models/jacket',
      preview_image_url_safe: '',
      user_email: 'maker@example.com',
      user_name: 'Maker',
      updated_at_display: '13 Sep 2026, 12:00',
      deleted_at: '2026-09-20 10:00:00',
      deleted_at_display: '20 Sep 2026, 10:00'
    }]
  });
  assert.match(html, /Test Jacket/);
  assert.match(html, /class="project-view-design" href="\/admin\/projects\/project-test\/view"/);
  assert.match(html, /查看设计 \/ View design/);
  assert.match(html, /Deleted by user/);
  assert.match(html, /20 Sep 2026, 10:00/);
  assert.match(html, /data-delete-project="project-test"/);
});
