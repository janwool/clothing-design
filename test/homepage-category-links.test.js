const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const homepage = fs.readFileSync(path.join(__dirname, '..', 'views', 'index.ejs'), 'utf8');
const homepageRoute = fs.readFileSync(path.join(__dirname, '..', 'routes', 'index.js'), 'utf8');

test('pins the selected relaxed drop-shoulder T-shirt as the homepage model', () => {
  assert.match(homepageRoute, /'t-shirt-mockup': 'relaxed-crewneck-drop-shoulder-elbow-sleeve-t-shirt-3d-model-8d00c82be4ea'/);
});

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

test('renders homepage white mockups from online asset records', () => {
  assert.match(homepage, /homeContent\.whiteMockups/);
  assert.match(homepage, /src="<%= primaryWhiteMockup\.base_image_url %>"/);
  assert.match(homepage, /src="<%= mockup\.base_image_url %>"/);
  assert.doesNotMatch(homepage, /\/images\/mockups\/on-model\/generated\//);
});
