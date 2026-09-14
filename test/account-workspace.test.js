const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const route = fs.readFileSync(path.join(root, 'routes', 'user-content.js'), 'utf8');
const overviewView = fs.readFileSync(path.join(root, 'views', 'account', 'overview.ejs'), 'utf8');
const projects3dView = fs.readFileSync(path.join(root, 'views', 'account', 'projects-3d.ejs'), 'utf8');
const whiteMockupsView = fs.readFileSync(path.join(root, 'views', 'account', 'white-mockups.ejs'), 'utf8');
const settingsView = fs.readFileSync(path.join(root, 'views', 'account', 'settings.ejs'), 'utf8');
const shellView = fs.readFileSync(path.join(root, 'views', 'account', 'partials', 'workspace-shell.ejs'), 'utf8');
const allViews = [overviewView, projects3dView, whiteMockupsView, settingsView, shellView].join('\n');
const runtime = fs.readFileSync(path.join(root, 'public', 'js', 'account-workspace.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'public', 'css', 'account-workspace.css'), 'utf8');
const workerTemplates = require('../src/worker-templates.cjs');

test('renders each signed-in workspace menu item at its own route', () => {
  assert.match(route, /overview:[\s\S]*template: 'account\/overview'/);
  assert.match(route, /projects3d:[\s\S]*template: 'account\/projects-3d'/);
  assert.match(route, /whiteMockups:[\s\S]*template: 'account\/white-mockups'/);
  assert.match(route, /settings:[\s\S]*template: 'account\/settings'/);
  assert.match(route, /router\.get\('\/account', requireUser, renderWorkspacePage\('overview'\)\)/);
  assert.match(route, /router\.get\('\/account\/projects\/3d', requireUser, renderWorkspacePage\('projects3d'\)\)/);
  assert.match(route, /router\.get\('\/account\/projects\/white-mockups', requireUser, renderWorkspacePage\('whiteMockups'\)\)/);
  assert.match(route, /router\.get\('\/account\/projects', requireUser, \(req, res\) => res\.redirect\('\/account\/projects\/3d'\)\)/);
  assert.match(route, /router\.get\('\/account\/settings', requireUser, renderWorkspacePage\('settings'\)\)/);
  assert.match(shellView, /href="\/account\/projects\/3d"/);
  assert.match(shellView, /href="\/account\/projects\/white-mockups"/);
  assert.match(shellView, /href="\/account\/settings"/);
  assert.doesNotMatch(shellView, /href="\/account\/artwork"/);
  assert.doesNotMatch(shellView, />Artwork<\/span>/);
  assert.match(shellView, /aria-current="page"/);
  assert.doesNotMatch(shellView, /href="#(?:overview|projects|assets|account)"/);
  assert.match(overviewView, /workspaceStats\.storageBytes/);
});

test('opens saved projects on their detail pages', () => {
  assert.match(projects3dView, /`\$\{project\.sourceUrl\}\?project=\$\{encodeURIComponent\(project\.id\)\}`/);
  assert.match(whiteMockupsView, /`\$\{project\.sourceUrl\}\?project=\$\{encodeURIComponent\(project\.id\)\}`/);
  assert.doesNotMatch(allViews, /project\.sourceUrl\.endsWith\('\/edit'\).*#design/);
});

test('renders only the right-side content selected by the current workspace route', () => {
  assert.match(overviewView, /currentView: 'overview'/);
  assert.match(projects3dView, /currentView: 'projects3d'/);
  assert.match(whiteMockupsView, /currentView: 'whiteMockups'/);
  assert.match(settingsView, /currentView: 'settings'/);
  assert.match(projects3dView, /project\.projectType === '3d'/);
  assert.doesNotMatch(projects3dView, /project\.projectType === 'white_mockup'/);
  assert.match(whiteMockupsView, /project\.projectType === 'white_mockup'/);
  assert.doesNotMatch(whiteMockupsView, /project\.projectType === '3d'/);
  assert.match(shellView, /data-workspace-view="<%= currentView %>"/);
  assert.doesNotMatch(runtime, /IntersectionObserver/);
  assert.doesNotMatch(runtime, /scrollIntoView/);
});

test('does not ship the previous all-in-one conditional workspace template', () => {
  assert.equal(fs.existsSync(path.join(root, 'views', 'account', 'workspace.ejs')), false);
  assert.equal(fs.existsSync(path.join(root, 'views', 'account', 'projects.ejs')), false);
  assert.doesNotMatch(allViews, /requestedWorkspaceView|isProjectView/);
});

test('renders every independent workspace page with the Worker template runtime', () => {
  const sharedLocals = {
    title: 'Workbench',
    page: 'account',
    user: { id: 1, name: 'Test Designer', email: 'designer@example.com' },
    account: { id: 1, name: 'Test Designer', email: 'designer@example.com', created_at: '2026-09-01' },
    projects: [],
    images: [],
    workspaceStats: { totalProjects: 0, projects3d: 0, whiteMockups: 0, storageBytes: 0 },
    pageStyles: [],
    metaDescription: '',
    metaRobots: 'noindex,nofollow',
    structuredData: null,
    t: key => key
  };
  const pages = [
    ['account/overview', 'overview'],
    ['account/projects-3d', 'projects3d'],
    ['account/white-mockups', 'whiteMockups'],
    ['account/settings', 'settings']
  ];
  pages.forEach(([template, viewName]) => {
    const html = workerTemplates.render(template, sharedLocals);
    assert.match(html, new RegExp(`data-workspace-view="${viewName}"`));
    assert.match(html, new RegExp(`href="${viewName === 'overview' ? '/account' : viewName === 'projects3d' ? '/account/projects/3d' : viewName === 'whiteMockups' ? '/account/projects/white-mockups' : '/account/settings'}"[^>]*aria-current="page"`));
  });
});

test('provides working project and account management actions', () => {
  assert.match(route, /router\.patch\('\/api\/projects\/:id'/);
  assert.match(route, /router\.post\('\/api\/projects\/:id\/duplicate'/);
  assert.match(route, /router\.delete\('\/api\/user-images\/:id'/);
  assert.match(route, /router\.patch\('\/api\/account'/);
  assert.match(runtime, /data-project-action/);
  assert.doesNotMatch(runtime, /workspaceProjectSearch|workspaceViewToggle|applyProjectFilter/);
});

test('proxies only the signed-in user\'s stored project textures', () => {
  assert.match(route, /router\.get\('\/api\/project-texture', requireUser/);
  assert.match(route, /SELECT url, mime_type FROM user_images WHERE user_id = \? AND url = \? LIMIT 1/);
  assert.match(route, /\^image\\\/\(\?:png\|jpe\?g\|webp\)\$/i);
  assert.match(route, /Cache-Control', 'private, max-age=300'/);
});

test('shows project cards without the removed collection header and tools', () => {
  assert.match(projects3dView, /workspace-project-list/);
  assert.match(whiteMockupsView, /workspace-project-list/);
  assert.doesNotMatch(allViews, /id="projectsTitle"|workspace-project-tools|workspaceProjectSearch|workspaceViewToggle|workspaceEmptyFilter/);
});

test('shows complete 3D project covers without hover cropping', () => {
  assert.match(projects3dView, /workspace-project-card workspace-project-card-3d/);
  assert.match(projects3dView, /workspace-project-image workspace-project-image-3d/);
  assert.match(overviewView, /data-project-type="<%= recentProject\.projectType %>"/);
  assert.match(styles, /\.workspace-project-grid \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);[^}]*gap: 14px;/);
  assert.match(styles, /\.workspace-project-image-3d \{[\s\S]*?aspect-ratio: 4 \/ 5;[\s\S]*?padding: 0;[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.workspace-project-image-3d img \{[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?object-fit: contain;/);
  assert.match(styles, /\.workspace-project-card-3d:hover \.workspace-project-image-3d img \{ transform: none; \}/);
  assert.match(route, /account-workspace\.css\?v=20260914-entitlements-v12/);
});

test('shows the signed-in user plan and live allowance usage', () => {
  assert.match(route, /getUserEntitlements\(req\.session\.user\.id\)/);
  assert.match(route, /router\.get\('\/api\/account\/entitlements', requireUser/);
  assert.match(overviewView, /Current plan/);
  assert.match(overviewView, /Try-on Credits/);
  assert.match(overviewView, /Image storage/);
  assert.match(styles, /\.workspace-plan-usage/);
});

test('uses the responsive ClozDesign product visual system for the workspace', () => {
  assert.match(styles, /--ws-ink: var\(--ui-ink, #1d1d1f\)/);
  assert.match(styles, /--ws-canvas: var\(--ui-canvas, #f5f5f7\)/);
  assert.match(styles, /grid-template-columns: 248px minmax\(0, 1fr\)/);
  assert.match(styles, /position: sticky/);
  assert.match(styles, /height: calc\(100vh - var\(--navbar-height\)\)/);
  assert.match(styles, /\.workspace-project-grid/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /grid-template-columns: 68px minmax\(0, 1fr\)/);
  assert.match(styles, /\.workspace-nav a span,[\s\S]*\.workspace-nav a b \{ display: none; \}/);
  assert.doesNotMatch(styles, /padding-top: calc\(var\(--navbar-height\) \+ 58px\)/);
  assert.match(styles, /prefers-reduced-motion/);
});
