const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const route = fs.readFileSync(path.join(root, 'routes', 'index.js'), 'utf8');
const template = fs.readFileSync(path.join(root, 'views', 'design-3d.ejs'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
const refreshStyles = fs.readFileSync(path.join(root, 'public', 'css', 'product-refresh.css'), 'utf8');

test('paginates the All model library without hiding the total catalog size', () => {
  assert.match(route, /const MOCKUP_PAGE_SIZE = 48;/);
  assert.match(route, /const pageCount = Math\.max\(1, Math\.ceil\(total \/ MOCKUP_PAGE_SIZE\)\);/);
  assert.match(route, /const page = Math\.min\(normalizeMockupPage\(req\.query\.page\), pageCount\);/);
  assert.match(route, /filteredModels\.slice\(offset, offset \+ MOCKUP_PAGE_SIZE\)/);
  assert.match(route, /catalogTotal: libraryTotal/);
  assert.match(template, /mockupTotal \? `\$\{mockupTotal\} free 3D models`/);
});

test('sorts the All library by the configured category order before pagination', () => {
  assert.match(route, /COALESCE\(primary_category\.sort_order, legacy_category\.sort_order, 2147483647\) ASC/);
  assert.match(route, /COALESCE\(primary_category\.name, legacy_category\.name, m\.category, ''\) ASC/);
  assert.match(route, /m\.id ASC/);
});

test('renders accessible previous, numbered, and next page navigation', () => {
  assert.match(template, /aria-label="3D model pages"/);
  assert.match(template, /rel="prev"/);
  assert.match(template, /rel="next"/);
  assert.match(template, /aria-current="page"/);
  assert.match(template, /Showing <strong><%= mockupPagination\.start %>–<%= mockupPagination\.end %><\/strong>/);
  assert.match(styles, /\.catalog-pagination \{/);
  assert.match(styles, /\.catalog-page-number\.is-current/);
});

test('gives paginated result pages their own canonical URL', () => {
  assert.match(route, /if \(page > 1\) collectionParams\.set\('page', String\(page\)\);/);
  assert.match(route, /if \(catalogQuery\) collectionParams\.set\('q', catalogQuery\);/);
  assert.match(route, /res\.locals\.canonicalUrl = toAbsoluteUrl\(req, collectionPath\);/);
  assert.match(route, /items: displayModels/);
});

test('keeps sorting available without rendering a catalog search control', () => {
  assert.match(route, /\['featured', 'name', 'newest'\]\.includes\(req\.query\.sort\)/);
  assert.match(template, /name="sort"/);
  assert.doesNotMatch(template, /type="search"/);
  assert.doesNotMatch(template, /name="q"/);
  assert.match(refreshStyles, /\.catalog-toolbar \{/);
});
