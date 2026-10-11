const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const routes = fs.readFileSync(path.join(root, 'routes', 'index.js'), 'utf8');
const header = fs.readFileSync(path.join(root, 'views', 'partials', 'header.ejs'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
const refreshStyles = fs.readFileSync(path.join(root, 'public', 'css', 'product-refresh.css'), 'utf8');
const detailStyles = fs.readFileSync(path.join(root, 'public', 'css', 'model-detail-v2.css'), 'utf8');
const workerTemplates = require('../src/worker-templates.cjs');

test('owns navigation styles independently of page styles', () => {
  const navStyles = fs.readFileSync(path.join(root, 'public/css/navigation.css'), 'utf8');
  assert.match(header, /navigation\.css\?v=/);
  assert.match(navStyles, /--navbar-height: 76px/);
  assert.match(navStyles, /\.navbar \.navbar-brand-icon \{ width: 32px; height: 32px;/);
  assert.match(navStyles, /\.navbar \.nav-link \{ font-size: 14px;/);
  assert.match(navStyles, /\.mobile-menu\.active/);
  for (const filename of ['style.css', 'product-refresh.css', 'home-v2.css', 'mockups-library.css', 'white-mockups.css', 'tshirt-generator-landing.css']) {
    const css = fs.readFileSync(path.join(root, 'public/css', filename), 'utf8');
    const parsed = require('postcss').parse(css);
    parsed.walkRules(rule => assert.doesNotMatch(rule.selector, /\.(?:navbar(?:-[\w-]+)?|nav-link|nav-dropdown|mobile-(?:menu|toggle|link))/));
  }
});

test('shows signed-in users a direct Workbench navigation button', () => {
  const signedInBlock = header.match(/<% if \(user\) \{ %>([\s\S]*?)<% \} else \{ %>/)?.[1] || '';

  assert.match(signedInBlock, /<a href="\/account" class="btn btn-primary navbar-workbench-link">Workbench<\/a>/);
  assert.doesNotMatch(signedInBlock, /user-dropdown|user-toggle|user-menu/);
});

test('omits Start designing from desktop and mobile navigation for signed-out users', () => {
  const guestHeader = workerTemplates.render('partials/header', {
    title: 'Fashion Mockup',
    user: null,
    authLoginUrl: '/auth/login',
    t: key => key
  });

  assert.equal((guestHeader.match(/href="\/auth\/login"/g) || []).length, 2);
  assert.doesNotMatch(guestHeader, />Start designing<\/a>/i);
  assert.doesNotMatch(guestHeader, /navbar-workbench-link/);

  const memberHeader = workerTemplates.render('partials/header', {
    title: 'Fashion Mockup',
    user: { id: 1 },
    authLoginUrl: '/auth/login',
    t: key => key
  });
  assert.match(memberHeader, /navbar-workbench-link">Workbench<\/a>/);
});

test('loads the user image library runtime with the current cache version', () => {
  assert.match(header, /user-projects\.js\?v=20261011-explicit-project-v8/);
});
