const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canonicalUrl,
  getCanonicalRedirect,
  normalizePathname
} = require('../lib/url-policy');

function request({
  host = 'www.cloz-design.com',
  method = 'GET',
  originalUrl = '/',
  path = '/',
  protocol = 'https',
  forwardedProto
} = {}) {
  const headers = {
    host,
    ...(forwardedProto ? { 'x-forwarded-proto': forwardedProto } : {})
  };
  return {
    method,
    originalUrl,
    path,
    protocol,
    get(name) {
      return headers[String(name).toLowerCase()];
    }
  };
}

test('canonical URLs always use the public production origin', () => {
  assert.equal(canonicalUrl('/tools/t-shirt-mockup-generator/'), 'https://www.cloz-design.com/tools/t-shirt-mockup-generator');
});

test('normalizes trailing slashes except for the root', () => {
  assert.equal(normalizePathname('/'), '/');
  assert.equal(normalizePathname('/blog/example///'), '/blog/example');
});

test('redirects noncanonical protocol and host while preserving query parameters', () => {
  const redirect = getCanonicalRedirect(request({
    forwardedProto: 'http',
    host: 'cloz-design.com',
    originalUrl: '/mockups/?page=2',
    path: '/mockups/'
  }));
  assert.equal(redirect, 'https://www.cloz-design.com/mockups?page=2');
});

test('does not redirect an already canonical request', () => {
  assert.equal(getCanonicalRedirect(request({
    originalUrl: '/mockups',
    path: '/mockups'
  })), null);
});

test('keeps localhost for local trailing-slash redirects', () => {
  const redirect = getCanonicalRedirect(request({
    host: 'localhost:3000',
    protocol: 'http',
    originalUrl: '/blog/example/',
    path: '/blog/example/'
  }));
  assert.equal(redirect, 'http://localhost:3000/blog/example');
});

test('does not redirect unsafe methods at the application layer', () => {
  assert.equal(getCanonicalRedirect(request({
    host: 'cloz-design.com',
    method: 'POST',
    protocol: 'http'
  })), null);
});
