const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const analyticsScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'analytics.js'), 'utf8');

function trackedName(sourceEvent) {
  const calls = [];
  const window = {
    dataLayer: [],
    location: {
      href: 'https://www.cloz-design.com/tools/t-shirt-mockup-generator',
      origin: 'https://www.cloz-design.com',
      pathname: '/tools/t-shirt-mockup-generator'
    },
    gtag() {
      calls.push([...arguments]);
    }
  };
  const document = {
    title: 'Free T-Shirt Mockup Generator',
    addEventListener() {}
  };

  vm.runInNewContext(analyticsScript, {
    URL,
    console,
    document,
    sessionStorage: { getItem() { return null; }, removeItem() {}, setItem() {} },
    window
  });

  window.trackEvent(sourceEvent, { item_id: 'example' });
  return calls[0];
}

test('uses the functional event name directly without taxonomy remapping', () => {
  assert.equal(trackedName('pricing_pro_checkout_begin')[1], 'pricing_pro_checkout_begin');
  assert.equal(trackedName('pricing_max_checkout_begin')[1], 'pricing_max_checkout_begin');
  assert.equal(trackedName('designer_current_view_render_download')[1], 'designer_current_view_render_download');
  assert.equal(trackedName('model_detail_fabric_motion_enable')[1], 'model_detail_fabric_motion_enable');
});

test('tracks authentication method, return target, and redirect result', () => {
  assert.match(analyticsScript, /authContext\(googleType, 'google', authReturnPathFromUrl\(anchor\.href\)\)/);
  assert.match(analyticsScript, /authContext\(name, 'email', nextInput\?\.value\)/);
  assert.match(analyticsScript, /auth_entry_path: pendingAuth\.auth_entry_path/);
  assert.match(analyticsScript, /auth_return_path: pendingAuth\.auth_return_path \|\| DEFAULT_AUTH_RETURN_PATH/);
  assert.match(analyticsScript, /auth_return_mode: pendingAuth\.auth_return_mode \|\| 'default'/);
  assert.match(analyticsScript, /auth_redirect_status:[\s\S]*?'matched'[\s\S]*?: 'unexpected'/);
});

test('gives white mockup library and detail pages their own page event surfaces', () => {
  assert.match(analyticsScript, /path === '\/white-mockups'\) return 'white_mockups_library'/);
  assert.match(analyticsScript, /path\.startsWith\('\/white-mockups\/'\)\) return 'white_mockup_detail'/);
});

test('keeps distinct source functions as distinct GA4 event names', () => {
  assert.notEqual(
    trackedName('home_model_classic_crew_neck_tshirt_select')[1],
    trackedName('home_model_oversized_tshirt_select')[1]
  );
  assert.notEqual(
    trackedName('pricing_billing_monthly_click')[1],
    trackedName('pricing_billing_yearly_click')[1]
  );
});

test('sanitizes direct names and never falls back to a shared event name', () => {
  const call = trackedName('cotton_jersey_fine_okkatz');
  assert.equal(call[1], 'cotton_jersey_fine_okkatz');
  assert.equal(call[2].source_event, undefined);
});

test('keeps long direct event names unique within the GA4 40-character limit', () => {
  const first = trackedName('home_model_extra_long_classic_crew_neck_tshirt_front_select')[1];
  const second = trackedName('home_model_extra_long_classic_crew_neck_tshirt_back_select')[1];
  assert.ok(first.length <= 40);
  assert.ok(second.length <= 40);
  assert.notEqual(first, second);
});
