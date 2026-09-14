const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const route = fs.readFileSync(path.join(root, 'routes', 'index.js'), 'utf8');
const authRoute = fs.readFileSync(path.join(root, 'routes', 'auth.js'), 'utf8');
const header = fs.readFileSync(path.join(root, 'views', 'partials', 'header.ejs'), 'utf8');
const footer = fs.readFileSync(path.join(root, 'views', 'partials', 'footer.ejs'), 'utf8');
const home = fs.readFileSync(path.join(root, 'views', 'index.ejs'), 'utf8');
const pricing = fs.readFileSync(path.join(root, 'views', 'pricing.ejs'), 'utf8');
const modelDetail = fs.readFileSync(path.join(root, 'views', 'model-detail.ejs'), 'utf8');
const designer = fs.readFileSync(path.join(root, 'public', 'js', 'model-designer.js'), 'utf8');
const modelDetailStyles = fs.readFileSync(path.join(root, 'public', 'css', 'model-detail-v2.css'), 'utf8');

test('routes public calls to action into a working mockup path', () => {
  assert.match(header, /href="\/tools\/t-shirt-mockup-generator" class="btn btn-primary">Start designing/);
  assert.match(home, /basic-short-sleeve-tshirt-3d-model#design/);
  assert.doesNotMatch(header, /\/dashboard\/(?:designs|assets|settings)/);
  assert.match(authRoute, /res\.redirect\('\/tools\/t-shirt-mockup-generator'\)/);
});

test('publishes the current Free, Pro, Max, and Business pricing', () => {
  assert.match(pricing, /5 projects total/);
  assert.match(pricing, /28 projects \/ month/);
  assert.match(pricing, /99 projects \/ month/);
  assert.match(pricing, /150 Try-on Credits/);
  assert.match(pricing, /1,000 Try-on Credits/);
  assert.match(pricing, /const aiTryOnAvailable = typeof aiTryOnEnabled !== 'undefined' && Boolean\(aiTryOnEnabled\)/);
  assert.match(pricing, /<% if \(aiTryOnAvailable\) \{ %><li><span aria-hidden="true">✓<\/span> All AI models<\/li>/);
  assert.match(pricing, /data-yearly="\$99"/);
  assert.match(pricing, /data-yearly="\$299"/);
  assert.match(pricing, /data-plan-alt data-monthly="\$99 \/ year" data-yearly="\$9\.90 \/ month"/);
  assert.match(pricing, /mailto:support@cloz-design\.com\?subject=ClozDesign%20Business/);
  assert.match(route, /name: 'Pro monthly', price: '9\.90'/);
  assert.match(route, /name: 'Pro yearly', price: '99', priceCurrency: 'USD'/);
  assert.match(route, /name: 'Max monthly', price: '29', priceCurrency: 'USD'/);
  assert.match(route, /name: 'Max yearly', price: '299'/);
});

test('provides live trust routes linked from the footer', () => {
  assert.match(route, /router\.get\('\/contact'/);
  assert.match(route, /router\.get\('\/privacy'/);
  assert.match(route, /router\.get\('\/terms'/);
  assert.match(footer, /href="mailto:support@cloz-design\.com"/);
  assert.match(footer, /href="\/privacy"/);
  assert.match(footer, /href="\/terms"/);
});

test('uses a clear primary action that applies and saves the project', () => {
  assert.match(modelDetail, /Customize this model/);
  assert.match(modelDetail, /id="saveDesignModal"/);
  assert.doesNotMatch(modelDetail, /id="saveProjectButton"/);
  assert.doesNotMatch(modelDetail, /id="designModelMockupBtn"/);
  assert.match(designer, /saveCloudProject\(\{ closeAfterSave: true \}\)/);
  assert.match(designer, /if \(options\.closeAfterSave\) closeModal\(\)/);
  assert.match(modelDetail, /id="renderCurrentModelBtn"/);
  assert.match(modelDetail, /Render current view/);
  assert.doesNotMatch(modelDetail, /id="modelRenderDialog"|id="modelRenderImage"/);
  assert.doesNotMatch(modelDetail, /Download model/);
  assert.doesNotMatch(modelDetail, /id="downloadModelBtn"/);
  assert.match(designer, /downloadRenderedImage\(renderUrl, filename\)/);
  assert.match(designer, /link\.download = filename/);
  assert.doesNotMatch(designer, /modelRenderDialog\.showModal\(\)|window\.open\(renderUrl/);
  assert.match(modelDetail, /id="removeWatermarkBtn"/);
  assert.match(modelDetail, /href="\/pricing\?source=model-detail&amp;intent=remove-watermark&amp;model=/);
  assert.match(modelDetail, /data-analytics-event="remove_watermark_upgrade_click"/);
  assert.match(modelDetailStyles, /\.detail-action-upgrade \{[\s\S]*?background: var\(--md-lime\);/);
  assert.match(modelDetailStyles, /\.detail-action-upgrade:nth-child\(odd\):last-child \{ grid-column: 1 \/ -1; \}/);
  assert.match(modelDetail, /designSaveStatusText">Ready/);
  assert.doesNotMatch(designer, /Unsaved changes/);
  assert.match(designer, /setDesignSaveStatus\('Saved to your account'\)/);
  assert.match(designer, /window\.UserProjects\.saveProject\(/);
  assert.match(route, /replace\(\/transparent WebP image\/gi, 'transparent PNG image'\)/);
});

test('requires an inline sign-in before an anonymous user customizes a model', () => {
  assert.match(modelDetail, /<% if \(!user\) \{ %>[\s\S]*id="modelLoginModal"/);
  assert.match(modelDetail, /id="modelLoginForm" action="\/auth\/login" method="post"/);
  assert.match(modelDetail, /if \(!window\.ModelDesignerConfig\.userAuthenticated && entryId === 'designNowBtn'\) \{\s+openLoginModal\(\);\s+return;/);
  assert.match(modelDetail, /headers: \{ 'Accept': 'application\/json', 'Content-Type': 'application\/json' \}/);
  assert.match(modelDetail, /sessionStorage\.setItem\(resumeCustomizeKey/);
  assert.match(modelDetail, /if \(isFresh\) requestAnimationFrame\(\(\) => document\.getElementById\('designNowBtn'\)\?\.click\(\)\)/);
  assert.match(authRoute, /function wantsJson\(req\)/);
  assert.match(authRoute, /return res\.status\(401\)\.json\(\{ success: false, error: req\.t\('auth\.invalidCredentials'\) \}\)/);
  assert.match(authRoute, /return res\.json\(\{ success: true, next: nextPath \|\| '\/tools\/t-shirt-mockup-generator' \}\)/);
  assert.match(modelDetailStyles, /\.model-login-modal \{[\s\S]*?position: fixed;[\s\S]*?place-items: center;/);
  assert.match(modelDetailStyles, /\.model-login-modal\[hidden\] \{ display: none; \}/);
});
