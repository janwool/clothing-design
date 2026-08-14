const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const shareScript = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'share.js'), 'utf8');

function runShareScript(pathname) {
  let domReady;
  let mountedPanel = null;
  let insertedContainer = null;
  let insertedIntoCustomizationForm = null;

  const customizationFormFooter = {
    before(container) {
      insertedIntoCustomizationForm = container;
    }
  };

  const footer = {
    before(container) {
      insertedContainer = container;
      mountedPanel = container.child;
    }
  };

  const document = {
    addEventListener(event, handler) {
      if (event === 'DOMContentLoaded') domReady = handler;
    },
    createElement(tagName) {
      if (tagName === 'div') {
        return {
          appendChild(child) { this.child = child; }
        };
      }
      return {
        dataset: {},
        setAttribute(name, value) { this[name] = value; },
        querySelectorAll() { return []; },
        querySelector() { return null; }
      };
    },
    querySelector(selector) {
      if (selector === '[data-growth-share]') return mountedPanel;
      if (selector === 'footer') return customizationFormFooter;
      if (selector === 'footer.footer') return footer;
      if (selector === 'h1') return { textContent: ' Hoodie 3D Model 01 ' };
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-growth-share]' && mountedPanel) return [mountedPanel];
      return [];
    }
  };

  const window = {
    document,
    location: { href: `https://www.cloz-design.com${pathname}`, origin: 'https://www.cloz-design.com', pathname }
  };

  vm.runInNewContext(shareScript, {
    URL,
    URLSearchParams,
    console,
    document,
    navigator: {},
    window
  });
  domReady();

  return { insertedContainer, insertedIntoCustomizationForm, mountedPanel };
}

test('mounts a tracked share panel on categorized 3D model detail pages', () => {
  const { insertedContainer, insertedIntoCustomizationForm, mountedPanel } = runShareScript('/3d-models/hoodie-mockup/hoodie-model-01');

  assert.equal(insertedContainer.className, 'container');
  assert.equal(insertedIntoCustomizationForm, null);
  assert.equal(mountedPanel.dataset.shareSurface, 'model-detail');
  assert.equal(mountedPanel.dataset.shareTitle, 'Hoodie 3D Model 01');
  assert.equal(mountedPanel['aria-label'], 'Share Hoodie 3D Model 01');
  assert.match(mountedPanel.innerHTML, /Pinterest/);
  assert.match(mountedPanel.innerHTML, /Copy link/);
});

test('does not mount the model share panel on unrelated pages', () => {
  const { insertedContainer, mountedPanel } = runShareScript('/blog/how-to-place-a-chest-print');

  assert.equal(insertedContainer, null);
  assert.equal(mountedPanel, null);
});
