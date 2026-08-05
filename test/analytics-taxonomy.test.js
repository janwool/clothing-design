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

test('keeps conversion and recommended event names stable', () => {
  assert.equal(trackedName('generate_lead')[1], 'generate_lead');
  assert.equal(trackedName('design_export')[1], 'design_export');
  assert.equal(trackedName('sign_up')[1], 'sign_up');
  assert.equal(trackedName('share')[1], 'share');
});

test('maps legacy high-cardinality event names into a fixed taxonomy', () => {
  assert.equal(trackedName('home_model_classic_crew_neck_tshirt_select')[1], 'select_content');
  assert.equal(trackedName('designer_designnowbtn_start')[1], 'begin_design');
  assert.equal(trackedName('content_share')[1], 'share');
  assert.equal(trackedName('model_detail_artwork_file_selected')[1], 'upload_artwork');
  assert.equal(trackedName('home_faq_17_toggle')[1], 'faq_toggle');
});

test('does not turn unknown UI labels into new GA4 event names', () => {
  const call = trackedName('cotton_jersey_fine_okkatz');
  assert.equal(call[1], 'ui_interaction');
  assert.equal(call[2].source_event, 'cotton_jersey_fine_okkatz');
});
