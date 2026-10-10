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
  assert.doesNotMatch(homepage, /\/uploads\/(?:glb|preview)\//);
});

test('uses the approved brand photographs as independent runtime assets', () => {
  for (const asset of ['hero', 'about', 'collection', 'mockups', 'try-on', 'output', 'closing']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'images', 'home', 'brand-v4', `${asset}.webp`)));
  }
  assert.doesNotMatch(homepage, /design-previews|desktop-.*\.png/);
});

function renderHomepage(aiTryOnEnabled, user = null) {
  return require('ejs').render(homepage, {
    user,
    homeContent: {
      primaryModel: { category_slug: 'dress', slug: 'classic-one-piece-dress-3d-model', file_url: 'https://cdn.example.com/dress.glb', image_url: 'https://cdn.example.com/dress.webp', name: 'Classic dress' },
      modelCards: [],
      aiTryOnEnabled
    }
  }, { includer: () => ({ template: ' ' }) });
}

test('hero links open the model collection and gate start designing for signed-out visitors', () => {
  const signedOut = renderHomepage(true);
  assert.match(signedOut, /href="\/mockups" data-analytics-event="home_explore_brand_click"/);
  assert.match(signedOut, /href="\/auth\/login\?next=%2Fmockups" data-home-start-design data-requires-login="true"/);
  const signedIn = renderHomepage(true, { id: 1 });
  assert.match(signedIn, /href="\/mockups" data-home-start-design data-requires-login="false"/);
});

test('AI try-on points at the garment workspace and respects feature availability', () => {
  const enabled = renderHomepage(true);
  assert.match(enabled, /href="\/3d-models\/dress\/classic-one-piece-dress-3d-model\/try-on"/);
  assert.match(enabled, /Illustrative preview/);
  assert.match(enabled, /Generation uses credits/);
  const disabled = renderHomepage(false);
  assert.doesNotMatch(disabled, /id="home-try-on"|href="#home-try-on"|Explore AI Try-On/);
});

test('a missing category list keeps working garment export and production links', () => {
  const html = renderHomepage(true);
  assert.match(html, /href="\/3d-models\/dress\/classic-one-piece-dress-3d-model#productionFeatureTitle"/);
  assert.match(html, /href="\/3d-models\/dress\/classic-one-piece-dress-3d-model#modelTechnicalTitle"/);
});
