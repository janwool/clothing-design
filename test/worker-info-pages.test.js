const assert = require('node:assert/strict');
const test = require('node:test');

const workerTemplates = require('../src/worker-templates.cjs');

const sharedLocals = {
  title: 'ClozDesign information',
  page: 'information',
  user: null,
  pageStyles: [],
  structuredData: null,
  t: key => key,
  eyebrow: 'Information',
  heading: 'Information page',
  sections: []
};

test('renders privacy and terms pages with the Worker template runtime', () => {
  for (const page of ['Privacy', 'Terms']) {
    const html = workerTemplates.render('legal', {
      ...sharedLocals,
      eyebrow: page,
      heading: `${page} overview`,
      updatedAt: 'September 13, 2026'
    });

    assert.match(html, new RegExp(`${page} overview`));
    assert.match(html, /Last updated September 13, 2026/);
  }
});

test('renders the contact page with the Worker template runtime', () => {
  const html = workerTemplates.render('info-page', {
    ...sharedLocals,
    eyebrow: 'Contact',
    heading: 'Get help with a clothing mockup',
    intro: 'Choose the support path that matches your request.'
  });

  assert.match(html, /Get help with a clothing mockup/);
  assert.match(html, /Choose the support path that matches your request/);
});
