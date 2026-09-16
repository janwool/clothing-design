const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const homepage = fs.readFileSync(path.join(__dirname, '..', 'views', 'index.ejs'), 'utf8');

test('routes homepage garment cards through the stable model collection', () => {
  assert.match(homepage, /homepageModelCards\.forEach/);
  assert.match(homepage, /href="\/mockups\?q=<%= encodeURIComponent\(card\.query\) %>#free-3d-models"/);
  assert.match(homepage, /href="\/mockups" data-analytics-event="home_category_more_click"/);
});

test('renders homepage 3D imagery from online model data instead of local uploads', () => {
  assert.match(homepage, /src="<%= activeHomepageModel\.file_url %>"/);
  assert.match(homepage, /poster="<%= activeHomepageModel\.image_url %>"/);
  assert.match(homepage, /src="<%= card\.image_url %>"/);
  assert.doesNotMatch(homepage, /\/uploads\/(?:glb|preview)\//);
});
