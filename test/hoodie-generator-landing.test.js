const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'views', 'hoodie-generator-landing.ejs'), 'utf8');
const stylesheet = fs.readFileSync(path.join(root, 'public', 'css', 'hoodie-generator-landing.css'), 'utf8');
const carousel = fs.readFileSync(path.join(root, 'public', 'js', 'hoodie-generator-landing.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'routes', 'index.js'), 'utf8');
const footer = fs.readFileSync(path.join(root, 'views', 'partials', 'footer.ejs'), 'utf8');

test('renders the Hoodie generator with its dedicated editorial landing page', () => {
  assert.match(routes, /req\.params\.slug === 'hoodie-mockup-generator'/);
  assert.match(routes, /\? 'hoodie-generator-landing'/);
  assert.match(template, /Build your hoodie<br>in 3D\./);
  assert.doesNotMatch(template, /tool-detail-hero|tool-quick-editor|keywordClusters/);
});

test('loads four active online Hoodie models with distinct silhouette roles', () => {
  assert.match(routes, /getActiveHoodieModelStarters\(req\)/);
  assert.match(routes, /WHERE m\.status = \?[\s\S]*?category_hoodie\.slug = \?/);
  assert.match(routes, /\['active', 'hoodie-mockup', 'hoodie-mockup'\]/);
  assert.match(routes, /selectFirstMatch\(name => \/pullover\|kangaroo/);
  assert.match(routes, /selectFirstMatch\(name => \/drop\[- \]shoulder\|oversized/);
  assert.match(routes, /selectFirstMatch\(name => \/full\[- \]zip\|zip/);
  assert.match(routes, /selectFirstMatch\(name => \/crop\|half/);
  assert.match(routes, /selectedModels\.slice\(0, 4\)/);
  assert.match(routes, /modelSrc: getPreviewModelFileUrl\(model, req\)/);
});

test('implements the generated technical-streetwear visual direction', () => {
  assert.match(stylesheet, /--hmg-paper: #f5f3ee/);
  assert.match(stylesheet, /--hmg-graphite: #202124/);
  assert.match(stylesheet, /--hmg-orange: #ff5a1f/);
  assert.match(stylesheet, /\.hmg-hero\s*\{[\s\S]*?grid-template-columns/);
  assert.match(stylesheet, /\.hmg-studio\s*\{[\s\S]*?background: var\(--hmg-graphite\)/);
  assert.match(template, /REAL FIT\. REAL DETAILS\./);
  assert.match(template, /From blank to<br>drop-ready\./);
  assert.match(template, /Choose &amp; customize/);
  assert.match(template, /Preview in 3D/);
  assert.match(template, /Export &amp; share/);
  assert.match(stylesheet, /\.hmg-workflow-visual/);
});

test('provides working carousel, angle, color, and editor controls', () => {
  assert.match(template, /<model-viewer[\s\S]*?camera-controls[\s\S]*?<\/model-viewer>/);
  assert.match(template, /ModelViewerElement\.meshoptDecoderLocation/);
  assert.match(template, /data-hmg-prev/);
  assert.match(template, /data-hmg-next/);
  assert.equal((template.match(/data-hmg-color=/g) || []).length, 1);
  assert.match(template, /data-hmg-orbit="0deg/);
  assert.match(template, /data-hmg-orbit="90deg/);
  assert.match(template, /data-hmg-orbit="180deg/);
  assert.match(carousel, /const selectModel/);
  assert.match(carousel, /setBaseColorFactor/);
  assert.match(carousel, /viewer\.cameraOrbit = activeOrbit/);
  assert.match(carousel, /editorLinks\.forEach/);
});

test('renders the complete page from hero through final CTA and stays responsive', () => {
  const sections = ['hmg-hero', 'hmg-proof', 'hmg-fits', 'hmg-workflow', 'hmg-use-cases', 'hmg-faq', 'hmg-final'];
  sections.reduce((previousIndex, section) => {
    const index = template.indexOf(section);
    assert.ok(index > previousIndex, `${section} should appear in the intended order`);
    return index;
  }, -1);
  assert.equal((template.match(/class="hmg-use-row"/g) || []).length, 1);
  assert.match(template, /Streetwear drops/);
  assert.match(template, /Client approvals/);
  assert.match(template, /Product listings/);
  assert.match(template, /Start designing today\./);
  assert.match(template, /footerVariant: 'hoodie'/);
  assert.match(footer, /Stay in the loop/);
  assert.match(footer, /footer-newsletter/);
  assert.match(stylesheet, /\.hmg-page \.footer/);
  assert.match(stylesheet, /@media \(max-width: 880px\)/);
  assert.match(stylesheet, /@media \(max-width: 580px\)/);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/);
});
