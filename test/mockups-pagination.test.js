const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const route = fs.readFileSync(path.join(root, 'routes', 'index.js'), 'utf8');
const template = fs.readFileSync(path.join(root, 'views', 'design-3d.ejs'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
const mockupStyles = fs.readFileSync(path.join(root, 'public', 'css', 'mockups-library.css'), 'utf8');

test('paginates the All model library without hiding the total catalog size', () => {
  assert.match(route, /const MOCKUP_PAGE_SIZE = 48;/);
  assert.match(route, /const pageCount = Math\.max\(1, Math\.ceil\(total \/ MOCKUP_PAGE_SIZE\)\);/);
  assert.match(route, /const page = Math\.min\(normalizeMockupPage\(req\.query\.page\), pageCount\);/);
  assert.match(route, /filteredModels\.slice\(offset, offset \+ MOCKUP_PAGE_SIZE\)/);
  assert.match(route, /catalogTotal: libraryTotal/);
  assert.match(template, /currentCatalogTotal \? `\$\{currentCatalogTotal\} free 3D models`/);
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

test('keeps search and sorting available across the redesigned catalog', () => {
  assert.match(route, /\['featured', 'name', 'newest'\]\.includes\(req\.query\.sort\)/);
  assert.match(template, /name="sort"/);
  assert.match(template, /type="search"/);
  assert.match(template, /name="q"/);
  assert.match(template, /class="models-grid mockups-masonry-grid"/);
  assert.match(mockupStyles, /column-count: 5/);
  assert.match(mockupStyles, /break-inside: avoid/);
});

test('shows every garment category without a hidden More menu or warm image filter', () => {
  assert.match(template, /categories\.forEach\(function\(cat\)/);
  assert.match(template, /class="mockups-sidebar"/);
  assert.match(template, /class="mockups-content"[\s\S]*class="mockups-hero"[\s\S]*class="mockups-catalog"/);
  assert.doesNotMatch(template, /mockups-category-more/);
  assert.doesNotMatch(template, />More</);
  assert.match(mockupStyles, /grid-template-columns: minmax\(204px, 236px\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(mockupStyles, /sepia\(/);
  assert.match(mockupStyles, /mix-blend-mode: normal/);
  assert.match(mockupStyles, /background-image: none/);
  assert.match(mockupStyles, /border-radius: 2px/);
  assert.doesNotMatch(mockupStyles, /transform: scale\(1\.055\)/);
});

test('uses the generated fashion studio image and a product-specific hero message', () => {
  assert.match(template, /mockups-library-fashion-studio-v1\.webp/);
  assert.match(template, /Pick a 3D garment\.<br>Start designing\./);
  assert.match(template, /Browse free clothing models, open any style in your browser/);
  assert.doesNotMatch(template, /heroModels/);
  assert.doesNotMatch(template, /mockups-orbit/);
});

test('renders every 3D category with the same redesigned mockup library', () => {
  assert.match(route, /router\.get\('\/mockups\/:slug'[\s\S]*?res\.render\('design-3d'/);
  assert.match(route, /activeCategory: \{ \.\.\.category, meta_title: seoTitle, description \}/);
  assert.match(route, /pageStyles: \['\/css\/mockups-library\.css\?v=20260917-flat-cards-v10'\]/);
  assert.match(template, /const activeMockupCategory/);
  assert.match(template, /activeMockupCategory && cat\.slug === activeMockupCategory\.slug \? 'is-active'/);
  assert.match(template, /Explore <%= activeMockupCategory\.name %> models\./);
});
