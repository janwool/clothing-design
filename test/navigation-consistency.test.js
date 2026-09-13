const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const routes = fs.readFileSync(path.join(root, 'routes', 'index.js'), 'utf8');
const header = fs.readFileSync(path.join(root, 'views', 'partials', 'header.ejs'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
const refreshStyles = fs.readFileSync(path.join(root, 'public', 'css', 'product-refresh.css'), 'utf8');
const detailStyles = fs.readFileSync(path.join(root, 'public', 'css', 'model-detail-v2.css'), 'utf8');

test('uses one navigation treatment across standard pages', () => {
  assert.match(header, /product-refresh\.css\?v=20260913-navbar-type-v9/);
  assert.match(header, /style\.css\?v=20260913-responsive-upload-v16/);
  assert.match(routes, /model-detail-v2\.css\?v=20260913-google-auth-v30/);
  assert.match(styles, /--navbar-height: 76px/);
  assert.match(refreshStyles, /\.navbar-logo \{[^}]*font-size: 28px;[^}]*font-weight: 720;/s);
  assert.match(refreshStyles, /\.navbar-container \{[^}]*max-width: 1320px;/s);
  assert.match(refreshStyles, /\.navbar \.navbar-actions > \.btn \{[^}]*min-height: 48px;/s);
  assert.match(refreshStyles, /\.navbar-link,[\s\S]*?\.user-toggle \{[^}]*font-size: 16px;/s);
  assert.match(refreshStyles, /\.navbar \.navbar-actions > \.btn \{[^}]*font-size: 16px;/s);
  assert.match(refreshStyles, /\.navbar-menu > \.nav-link::after/);
  assert.doesNotMatch(refreshStyles, /\.category-catalog-page \.navbar(?:\s|\{|\.)/);
  assert.doesNotMatch(refreshStyles, /\.category-catalog-page \{[^}]*--navbar-height/s);
  assert.doesNotMatch(detailStyles, /\.model-product-page \{\s*--navbar-height:/);
});

test('shows signed-in users a direct Workbench navigation button', () => {
  const signedInBlock = header.match(/<% if \(user\) \{ %>([\s\S]*?)<% \} else \{ %>/)?.[1] || '';

  assert.match(signedInBlock, /<a href="\/account" class="btn btn-primary navbar-workbench-link">Workbench<\/a>/);
  assert.doesNotMatch(signedInBlock, /user-dropdown|user-toggle|user-menu/);
});

test('loads the user image library runtime with the current cache version', () => {
  assert.match(header, /user-projects\.js\?v=20260913-upload-timeout-v3/);
});
