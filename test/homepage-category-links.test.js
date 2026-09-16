const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const homepage = fs.readFileSync(path.join(__dirname, '..', 'views', 'index.ejs'), 'utf8');

test('routes homepage garment cards through the stable model collection', () => {
  assert.match(homepage, /href="\/mockups\?q=T-shirt#free-3d-models"/);
  assert.match(homepage, /href="\/mockups\?q=Hoodie#free-3d-models"/);
  assert.match(homepage, /href="\/mockups\?q=Dress#free-3d-models"/);
  assert.match(homepage, /href="\/mockups\?q=Jacket#free-3d-models"/);
  assert.match(homepage, /href="\/mockups" data-analytics-event="home_category_more_click"/);
});
