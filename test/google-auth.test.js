const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  oauthStatesMatch
} = require('../lib/google-oauth');

const root = path.join(__dirname, '..');
const authRoute = fs.readFileSync(path.join(root, 'routes', 'auth.js'), 'utf8');
const loginView = fs.readFileSync(path.join(root, 'views', 'auth', 'login.ejs'), 'utf8');
const registerView = fs.readFileSync(path.join(root, 'views', 'auth', 'register.ejs'), 'utf8');
const modelDetail = fs.readFileSync(path.join(root, 'views', 'model-detail.ejs'), 'utf8');
const modelDetailStyles = fs.readFileSync(path.join(root, 'public', 'css', 'model-detail-v2.css'), 'utf8');
const workerTemplateBuilder = fs.readFileSync(path.join(root, 'scripts', 'generate-worker-templates.js'), 'utf8');

test('builds a minimal Google OpenID Connect authorization request', () => {
  const state = createOAuthState();
  const url = new URL(buildGoogleAuthorizationUrl({
    clientId: 'client.apps.googleusercontent.com',
    redirectUri: 'https://www.cloz-design.com/auth/google/callback',
    state
  }));

  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.pathname, '/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'client.apps.googleusercontent.com');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://www.cloz-design.com/auth/google/callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid profile email');
  assert.equal(url.searchParams.get('state'), state);
  assert.equal(url.searchParams.get('prompt'), 'select_account');
  assert.equal(oauthStatesMatch(state, state), true);
  assert.equal(oauthStatesMatch(state, `${state}x`), false);
});

test('protects the Google callback and reuses the existing account session', () => {
  assert.match(authRoute, /req\.session\.googleOAuth = \{[\s\S]*state,[\s\S]*next: nextPath,[\s\S]*createdAt: Date\.now\(\)/);
  assert.match(authRoute, /Date\.now\(\) - Number\(pending\.createdAt\) < 10 \* 60 \* 1000/);
  assert.match(authRoute, /oauthStatesMatch\(pending\.state, req\.query\?\.state\)/);
  assert.match(authRoute, /fetchGoogleUserProfile\(tokens\.access_token\)/);
  assert.match(authRoute, /SELECT id, email, name FROM users WHERE email = \?/);
  assert.match(authRoute, /req\.session\.user = \{ id: user\.id, email: user\.email, name: user\.name \|\| profile\.name \}/);
  assert.match(authRoute, /res\.redirect\(nextPath \|\| '\/tools\/t-shirt-mockup-generator'\)/);
});

test('offers Google sign-in on account pages and in the model login modal', () => {
  assert.match(loginView, /googleAuthEnabled[\s\S]*Continue with Google/);
  assert.match(registerView, /googleAuthEnabled[\s\S]*Continue with Google/);
  assert.match(modelDetail, /googleAuthEnabled[\s\S]*id="modelGoogleLogin"[\s\S]*Continue with Google/);
  assert.match(modelDetail, /googleLogin\?\.addEventListener\('click'[\s\S]*sessionStorage\.setItem\(resumeCustomizeKey/);
  assert.match(modelDetailStyles, /\.model-google-login \{[\s\S]*?display: flex;/);
  assert.match(workerTemplateBuilder, /'oauthError',[\s\S]*'googleAuthEnabled',[\s\S]*'googleAuthUrl'/);
});
