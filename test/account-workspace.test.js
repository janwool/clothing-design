const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const templates = require('../src/worker-templates.cjs');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const routes = read('routes/user-content.js');
const billing = read('routes/billing.js');
const shell = read('views/account/partials/workspace-shell.ejs');
const settings = read('views/account/settings.ejs');
const script = read('public/js/account-workspace.js');
const styles = read('public/css/account-workspace.css');

function locals(plan = 'free', status = 'active', provider = '') {
  return {
    title: 'Workbench',
    page: 'account',
    user: { id: 1, name: 'Test Designer', email: 'designer@example.com' },
    account: { id: 1, name: 'Test Designer', email: 'designer@example.com', created_at: '2026-09-01' },
    projects: [],
    workspaceStats: { totalProjects: 0, projects3d: 0, whiteMockups: 0, storageBytes: 0 },
    entitlements: {
      plan: { id: plan, name: plan === 'free' ? 'Free' : 'Pro', status, currentPeriodEnd: plan === 'free' ? null : '2026-10-29T00:00:00Z' },
      projects: { limit: plan === 'free' ? 3 : null, used: 0, period: 'lifetime' },
      storage: { limitBytes: plan === 'free' ? 20971520 : null, usedBytes: 0 }
    },
    billingSubscription: provider ? { provider, provider_subscription_id: 'sub_test', status, current_period_end: '2026-10-29T00:00:00Z' } : null,
    checkoutState: '',
    pageStyles: [],
    metaDescription: '',
    metaRobots: 'noindex,nofollow',
    structuredData: null,
    t: key => key
  };
}

test('has exactly three workbench destinations and redirects the former overview', () => {
  assert.equal(fs.existsSync(path.join(root, 'views/account/overview.ejs')), false);
  assert.doesNotMatch(shell, /Overview|currentView === 'overview'/);
  assert.match(routes, /router\.get\('\/account', requireUser, \(req, res\) => res\.redirect\('\/account\/projects\/3d'\)\)/);
  for (const href of ['/account/projects/3d', '/account/projects/white-mockups', '/account/settings']) {
    assert.ok(shell.includes('href="' + href + '"'));
  }
  assert.equal((shell.match(/aria-current="page"/g) || []).length, 3);
  assert.doesNotMatch(shell, /href="\/auth\/logout"/);
});

test('renders the three pages with the Worker template runtime', () => {
  for (const [template, view] of [
    ['account/projects-3d', 'projects3d'],
    ['account/white-mockups', 'whiteMockups'],
    ['account/settings', 'settings']
  ]) {
    const html = templates.render(template, locals());
    assert.ok(html.includes('data-workspace-view="' + view + '"'));
    assert.ok(html.includes('aria-current="page"'));
    assert.doesNotMatch(html, />Overview</);
  }
});

test('shows upgrade to free members and cancellation to active paid subscribers', () => {
  const free = templates.render('account/settings', locals());
  assert.match(free, /Upgrade to Pro/);
  assert.doesNotMatch(free, /id="workspaceCancelSubscription"/);
  const paid = templates.render('account/settings', locals('pro', 'active', 'dodo_payments'));
  assert.match(paid, /id="workspaceCancelSubscription"/);
  assert.match(paid, /Confirm cancellation/);
  assert.doesNotMatch(paid, /Upgrade to Pro/);
  assert.match(paid, /Sign out/);
});

test('explains scheduled cancellation and avoids a second cancel action', () => {
  const scheduled = templates.render('account/settings', locals('pro', 'scheduled_cancel', 'dodo_payments'));
  assert.match(scheduled, /Cancellation scheduled/);
  assert.match(scheduled, /It will not renew/);
  assert.doesNotMatch(scheduled, /id="workspaceCancelSubscription"/);
  const managed = templates.render('account/settings', locals('pro', 'active'));
  assert.match(managed, /Contact support to manage your plan/);
  assert.doesNotMatch(managed, /id="workspaceCancelSubscription"/);
});

test('cancellation uses a signed-in server route and keeps access until period end', () => {
  assert.match(billing, /router\.post\('\/subscription\/cancel', requireUser/);
  assert.match(billing, /scheduleDodoSubscriptionCancellation/);
  assert.match(billing, /status = 'scheduled_cancel'/);
  assert.match(settings, /current billing period ends/);
  assert.match(script, /\/api\/billing\/subscription\/cancel/);
  assert.match(script, /workspaceCancelDialog/);
});

test('project libraries retain search, sorting and project actions', () => {
  for (const file of ['views/account/projects-3d.ejs', 'views/account/white-mockups.ejs']) {
    const view = read(file);
    assert.match(view, /data-project-search/);
    assert.match(view, /data-project-sort/);
    assert.match(view, /data-project-action="rename"/);
    assert.match(view, /data-project-action="duplicate"/);
    assert.match(view, /data-project-action="delete"/);
  }
  assert.match(script, /function updateProjectList/);
  assert.match(styles, /workspace-list-controls/);
  assert.match(styles, /workspace-membership-action/);
});
