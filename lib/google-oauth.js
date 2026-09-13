const { randomBytes, timingSafeEqual } = require('node:crypto');

const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_OAUTH_TIMEOUT_MS = 10000;

function getEnvValue(name) {
  return process.env[name] || (globalThis.__WORKER_ENV__ && globalThis.__WORKER_ENV__[name]) || '';
}

function getGoogleRedirectUri(req) {
  const configured = String(getEnvValue('GOOGLE_REDIRECT_URI') || '').trim();
  if (configured) return configured;
  const host = String(req.get('host') || '').trim();
  const protocol = String(req.protocol || 'https').trim();
  return `${protocol}://${host}/auth/google/callback`;
}

function getGoogleOAuthConfig(req) {
  const clientId = String(getEnvValue('GOOGLE_CLIENT_ID') || '').trim();
  const clientSecret = String(getEnvValue('GOOGLE_CLIENT_SECRET') || '').trim();
  return {
    clientId,
    clientSecret,
    redirectUri: getGoogleRedirectUri(req),
    enabled: Boolean(clientId && clientSecret)
  };
}

function isGoogleAuthConfigured() {
  return Boolean(
    String(getEnvValue('GOOGLE_CLIENT_ID') || '').trim() &&
    String(getEnvValue('GOOGLE_CLIENT_SECRET') || '').trim()
  );
}

function createOAuthState() {
  return randomBytes(32).toString('base64url');
}

function oauthStatesMatch(expected, actual) {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const actualBuffer = Buffer.from(String(actual || ''), 'utf8');
  return expectedBuffer.length > 0 &&
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);
}

function buildGoogleAuthorizationUrl({ clientId, redirectUri, state }) {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

async function fetchJson(url, options, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_OAUTH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${label} failed with status ${response.status}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function exchangeGoogleAuthorizationCode({ code, clientId, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });
  const tokens = await fetchJson(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  }, 'Google token exchange');
  if (!tokens.access_token) throw new Error('Google token exchange returned no access token');
  return tokens;
}

async function fetchGoogleUserProfile(accessToken) {
  const profile = await fetchJson(GOOGLE_USERINFO_ENDPOINT, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` }
  }, 'Google user profile');
  const email = String(profile.email || '').trim().toLowerCase();
  if (!profile.sub || !email || profile.email_verified !== true) {
    throw new Error('Google account did not provide a verified email');
  }
  return {
    subject: String(profile.sub),
    email,
    name: String(profile.name || email.split('@')[0] || 'ClozDesign user').trim().slice(0, 100)
  };
}

module.exports = {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  exchangeGoogleAuthorizationCode,
  fetchGoogleUserProfile,
  getGoogleOAuthConfig,
  isGoogleAuthConfigured,
  oauthStatesMatch
};
