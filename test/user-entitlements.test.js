const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  PLAN_ENTITLEMENTS,
  imageDataUrlBytes,
  monthWindow,
  normalizePlan
} = require('../lib/user-entitlements');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('defines the published Free, Pro, Max, and Business allowances', () => {
  assert.equal(PLAN_ENTITLEMENTS.free.projectLimit, 5);
  assert.equal(PLAN_ENTITLEMENTS.free.projectPeriod, 'lifetime');
  assert.equal(PLAN_ENTITLEMENTS.free.removeWatermarks, false);
  assert.equal(PLAN_ENTITLEMENTS.pro.projectLimit, 28);
  assert.equal(PLAN_ENTITLEMENTS.pro.tryOnCredits, 150);
  assert.equal(PLAN_ENTITLEMENTS.pro.storageBytes, 1024 ** 3);
  assert.equal(PLAN_ENTITLEMENTS.pro.removeWatermarks, true);
  assert.equal(PLAN_ENTITLEMENTS.pro.allModels, true);
  assert.equal(PLAN_ENTITLEMENTS.max.projectLimit, 99);
  assert.equal(PLAN_ENTITLEMENTS.max.tryOnCredits, 1000);
  assert.equal(PLAN_ENTITLEMENTS.max.storageBytes, 100 * 1024 ** 3);
  assert.equal(PLAN_ENTITLEMENTS.business.projectLimit, null);
  assert.equal(normalizePlan('PRO'), 'pro');
  assert.equal(normalizePlan('unknown'), 'free');
});

test('uses a stable UTC calendar month for renewable allowances', () => {
  assert.deepEqual(monthWindow(new Date('2026-12-31T23:59:59Z')), {
    key: '2026-12',
    start: '2026-12-01 00:00:00',
    end: '2027-01-01 00:00:00',
    resetsAt: '2027-01-01T00:00:00.000Z'
  });
});

test('calculates uploaded image bytes before writing to object storage', () => {
  assert.equal(imageDataUrlBytes('data:image/png;base64,QUJDRA=='), 4);
  assert.equal(imageDataUrlBytes('data:text/plain;base64,QUJDRA=='), 0);
  assert.equal(imageDataUrlBytes('invalid'), 0);
});

test('enforces allowances at project, storage, try-on, and export boundaries', () => {
  const userRoute = read('routes/user-content.js');
  const tryOnRoute = read('routes/ai-try-on.js');
  const exportRuntime = read('public/js/export-entitlements.js');
  const designerRuntime = read('public/js/model-designer.js');
  const whiteMockupRuntime = read('public/js/white-mockup-editor.js');
  const modelDetail = read('views/model-detail.ejs');
  const whiteMockupDetail = read('views/white-mockup-detail.ejs');

  assert.match(userRoute, /canCreateProject\(req\.session\.user\.id\)/);
  assert.match(userRoute, /canStoreImage\(req\.session\.user\.id, incomingBytes\)/);
  assert.match(tryOnRoute, /reserveTryOnCredit\(req\.session\.user\.id\)/);
  assert.match(tryOnRoute, /releaseTryOnCredit\(creditReservation\.reservation\)/);
  assert.match(exportRuntime, /features\?\.removeWatermarks/);
  assert.match(exportRuntime, /clozdesign-watermark-tile-v1\.png/);
  assert.match(exportRuntime, /drawTiledWatermark\(context, canvas, options/);
  assert.match(exportRuntime, /sourceCrop\.x,[\s\S]*?markWidth,[\s\S]*?markHeight/);
  assert.match(exportRuntime, /applyModelViewerWatermark/);
  assert.match(exportRuntime, /viewer\.createCanvasTexture\(\)/);
  assert.match(exportRuntime, /textureInfo\.setTexture\(viewerTexture\)/);
  assert.match(modelDetail, /<model-viewer[\s\S]{0,900}data-entitlement-texture-watermark/);
  assert.doesNotMatch(modelDetail, /data-entitlement-watermark/);
  assert.doesNotMatch(whiteMockupDetail, /data-entitlement-watermark/);
  assert.match(designerRuntime, /ExportEntitlements\.prepareTexture\(originalSourceUrl\)/);
  assert.doesNotMatch(designerRuntime, /ExportEntitlements\.prepareExport\(renderUrl\)/);
  assert.match(whiteMockupRuntime, /function buildGarmentWatermark\(refresh = false\)/);
  assert.match(whiteMockupRuntime, /maskOpacityAt\(index\)/);
  assert.match(exportRuntime, /options\.color \|\| '#c5c7c4'/);
  assert.match(whiteMockupRuntime, /markContext\.fillStyle = '#c5c7c4'/);
  assert.match(whiteMockupRuntime, /globalCompositeOperation = 'source-over'/);
  assert.doesNotMatch(whiteMockupRuntime, /ExportEntitlements\.prepareExport\(source\)/);
});

test('lets authenticated administrators assign a user plan without exposing public activation', () => {
  const adminRoute = read('routes/admin.js');
  const adminUsers = read('views/admin/users.ejs');

  assert.match(adminRoute, /router\.patch\('\/users\/:id\/plan', requireAuth/);
  assert.match(adminRoute, /INSERT INTO user_subscriptions/);
  assert.match(adminRoute, /ON CONFLICT\(user_id\) DO UPDATE SET/);
  assert.match(adminUsers, /data-user-plan/);
  assert.match(adminUsers, /data-user-billing/);
  assert.match(adminUsers, /saveUserPlan/);
});
