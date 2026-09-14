const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAuthReturnPath,
  getHeaderLoginUrl,
  safeReturnPath
} = require('../lib/auth-return-path');

function request({ originalUrl = '/', next, referer, host = 'www.cloz-design.com' } = {}) {
  return {
    originalUrl,
    protocol: 'https',
    body: {},
    query: next === undefined ? {} : { next },
    headers: { host, ...(referer ? { referer } : {}) },
    get(name) {
      return this.headers[String(name).toLowerCase()];
    }
  };
}

test('adds the current page and query string to global sign-in links', () => {
  assert.equal(
    getHeaderLoginUrl(request({ originalUrl: '/mockups/hoodie?color=black' })),
    '/auth/login?next=%2Fmockups%2Fhoodie%3Fcolor%3Dblack'
  );
});

test('uses an explicit local next path after authentication', () => {
  assert.equal(
    getAuthReturnPath(request({ next: '/pricing?plan=pro' })),
    '/pricing?plan=pro'
  );
});

test('falls back to a same-site referring page when next is missing', () => {
  assert.equal(
    getAuthReturnPath(request({ referer: 'https://www.cloz-design.com/blog/fit-guide?size=m' })),
    '/blog/fit-guide?size=m'
  );
});

test('rejects external, protocol-relative, and auth return targets', () => {
  assert.equal(safeReturnPath('https://example.com/steal'), '');
  assert.equal(safeReturnPath('//example.com/steal'), '');
  assert.equal(getAuthReturnPath(request({ next: '/auth/login' })), '');
  assert.equal(
    getAuthReturnPath(request({ referer: 'https://example.com/mockups' })),
    ''
  );
});
