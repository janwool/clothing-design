const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const route = fs.readFileSync(path.join(root, 'routes', 'admin.js'), 'utf8');
const feedbackDb = fs.readFileSync(path.join(root, 'lib', 'feedback-db.js'), 'utf8');
const template = fs.readFileSync(path.join(root, 'views', 'admin', 'feedback.ejs'), 'utf8');
const sidebar = fs.readFileSync(path.join(root, 'views', 'admin', 'partials', 'sidebar.ejs'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'views', 'admin', 'dashboard.ejs'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'css', 'admin.css'), 'utf8');
const workerTemplates = require('../src/worker-templates.cjs');

test('adds a searchable and filterable feedback list to the admin', () => {
  assert.match(route, /router\.get\('\/feedback', requireAuth/);
  assert.match(route, /LEFT JOIN users u ON u\.id = f\.user_id/);
  assert.match(route, /f\.email LIKE \? OR f\.message LIKE \? OR f\.source_url LIKE \?/);
  assert.match(route, /ORDER BY f\.created_at DESC, f\.id DESC/);
  assert.match(template, /action="\/admin\/feedback"/);
  assert.match(template, /name="q"/);
  assert.match(template, /name="status"/);
  assert.match(template, /feedback-message-preview/);
  assert.match(template, /data-feedback-open/);
});

test('supports the full feedback review lifecycle', () => {
  assert.match(feedbackDb, /ALTER TABLE feedback_submissions ADD COLUMN updated_at DATETIME/);
  assert.match(route, /FEEDBACK_STATUSES = new Set\(\['all', 'new', 'reviewed', 'resolved', 'archived'\]\)/);
  assert.match(route, /router\.put\('\/feedback\/:id\/status', requireAuth/);
  assert.match(route, /UPDATE feedback_submissions SET status = \?, updated_at = CURRENT_TIMESTAMP WHERE id = \?/);
  assert.match(template, /data-feedback-status/);
  assert.match(template, /Feedback status updated\./);
  assert.match(styles, /\.feedback-status-reviewed/);
  assert.match(styles, /\.feedback-status-resolved/);
});

test('links feedback from the admin navigation and dashboard', () => {
  assert.match(sidebar, /href="\/admin\/feedback"/);
  assert.match(sidebar, /page === 'admin-feedback'/);
  assert.match(dashboard, /User Feedback/);
  assert.match(dashboard, /counts\.feedback/);
  assert.match(route, /SELECT COUNT\(\*\) as count FROM feedback_submissions/);
});

test('renders the feedback list in the Worker template runtime', () => {
  const html = workerTemplates.render('admin/feedback', {
    title: 'User Feedback',
    page: 'admin-feedback',
    i18next: { language: 'en' },
    items: [{
      id: 12,
      user_id: 7,
      user_name: 'Designer',
      email: 'designer@example.com',
      message: 'Please add more outerwear models.',
      source_url: '/mockups/jacket',
      source_url_safe: '/mockups/jacket',
      status: 'new',
      created_at_display: '17 Sep 2026, 10:00',
      updated_at_display: '17 Sep 2026, 10:00'
    }],
    feedbackFilters: { status: 'all', search: '' },
    feedbackPagination: { page: 1, pageCount: 1, total: 1 },
    feedbackStats: { total: 1, new: 1, reviewed: 0, resolved: 0 },
    error: ''
  });

  assert.match(html, /designer@example\.com/);
  assert.match(html, /Please add more outerwear models\./);
  assert.match(html, /data-feedback-status="12"/);
});
