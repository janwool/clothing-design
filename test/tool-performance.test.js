const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const toolTemplate = fs.readFileSync(path.join(root, 'views', 'tool-detail.ejs'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'routes', 'index.js'), 'utf8');
const staticHeaders = fs.readFileSync(path.join(root, 'public', '_headers'), 'utf8');

test('keeps the heavy 3D viewer outside the tool page critical path', () => {
  const viewerMarkup = toolTemplate.match(/<model-viewer[\s\S]*?<\/model-viewer>/)?.[0] || '';

  assert.match(viewerMarkup, /data-model-src=/);
  assert.doesNotMatch(viewerMarkup, /\ssrc=/);
  assert.doesNotMatch(toolTemplate, /<script[^>]+src="https:\/\/unpkg\.com\/@google\/model-viewer/);
  assert.match(toolTemplate, /loadModelViewerModule/);
  assert.match(toolTemplate, /ensureViewerReady/);
});

test('uses WebP mockup examples with lazy loading and fixed dimensions', () => {
  assert.doesNotMatch(routes, /image\/mockups\/[a-z0-9-]+\.png/);
  assert.match(toolTemplate, /width="1200" height="720" loading="lazy" decoding="async"/);
});

test('sets long-lived browser caching for static asset families', () => {
  assert.match(staticHeaders, /\/css\/\*[\s\S]*max-age=31536000, immutable/);
  assert.match(staticHeaders, /\/js\/\*[\s\S]*max-age=31536000, immutable/);
  assert.match(staticHeaders, /\/thickness-test\.html[\s\S]*X-Robots-Tag: noindex/);
});
