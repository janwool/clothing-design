(function initBrandHomepage() {
  'use strict';

  var startDesign = document.querySelector('[data-home-start-design]');
  var signingIn = false;
  if (startDesign) startDesign.addEventListener('click', async function start(event) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (startDesign.dataset.requiresLogin !== 'true' || !window.AccountLoginDialog) return;
    event.preventDefault();
    if (signingIn) return;
    signingIn = true;
    try {
      var signedIn = await window.AccountLoginDialog.open({ title: 'Sign in to start designing', next: '/mockups' });
      if (signedIn) {
        startDesign.dataset.requiresLogin = 'false';
        window.location.assign('/mockups');
      }
    } finally { signingIn = false; }
  });

  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var stage = document.querySelector('[data-home-model-stage]');
  var viewer = document.querySelector('[data-home-model-viewer]');
  var errorPanel = document.querySelector('[data-home-model-error]');
  var retry = document.querySelector('[data-home-model-retry]');
  var hint = document.querySelector('[data-home-model-hint]');
  var requested = false;
  var initializationAttempts = 0;
  var ready = false;
  var timeout;

  function showFailure() {
    ready = false;
    window.clearTimeout(timeout);
    stage.classList.remove('is-model-ready', 'is-live');
    stage.classList.add('is-model-error');
    stage.setAttribute('aria-busy', 'false');
    viewer.setAttribute('tabindex', '-1');
    if (errorPanel) errorPanel.hidden = false;
  }

  function showReady() {
    ready = true;
    window.clearTimeout(timeout);
    stage.classList.remove('is-model-error');
    stage.classList.add('is-model-ready');
    stage.setAttribute('aria-busy', 'false');
    viewer.setAttribute('tabindex', '0');
    if (errorPanel) errorPanel.hidden = true;
    // Keep the approved collection composition until a natural drag/focus gesture.
    // The live model is initialized beforehand; there is no loading button.
    if (viewer.model && viewer.model.materials) {
      viewer.model.materials.forEach(function setIvory(material) {
        if (material.pbrMetallicRoughness) {
          material.pbrMetallicRoughness.setBaseColorFactor([0.91, 0.90, 0.87, 1]);
        }
      });
    }
  }

  function showInteractive() {
    if (!ready) return;
    stage.classList.add('is-live');
    if (hint) hint.textContent = 'Drag to rotate · Scroll to zoom';
  }

  function initializeModel() {
    if (!viewer || requested) return;
    requested = true;
    stage.setAttribute('aria-busy', 'true');
    if (errorPanel) errorPanel.hidden = true;
    timeout = window.setTimeout(function checkModel() { if (!ready) showFailure(); }, 25000);
    if (window.customElements && window.customElements.get('model-viewer')) {
      if (viewer.loaded) showReady();
      return;
    }
    window.ModelViewerElement = window.ModelViewerElement || {};
    window.ModelViewerElement.meshoptDecoderLocation = '/vendor/model-viewer/meshopt_decoder.js?v=three-0.183.0';
    var script = document.createElement('script');
    script.type = 'module';
    // Browsers cache failed module imports. Give a retry a fresh module URL.
    script.src = '/vendor/model-viewer/model-viewer.min.js?v=4.3.1' + (initializationAttempts++ ? '&retry=' + Date.now() : '');
    script.addEventListener('error', function onScriptError() {
      requested = false;
      script.remove();
      showFailure();
    }, { once: true });
    document.head.appendChild(script);
  }

  if (stage && viewer) {
    viewer.addEventListener('load', showReady);
    viewer.addEventListener('error', showFailure);
    stage.addEventListener('pointerdown', showInteractive);
    stage.addEventListener('focusin', showInteractive);
    if (retry) retry.addEventListener('click', function retryModel(event) {
      event.stopPropagation();
      ready = false;
      stage.classList.remove('is-model-error');
      var source = viewer.getAttribute('src');
      viewer.removeAttribute('src');
      window.requestAnimationFrame(function restoreSource() { viewer.setAttribute('src', source); });
      requested = false;
      initializeModel();
    });
    if ('IntersectionObserver' in window) {
      var modelObserver = new IntersectionObserver(function preload(entries) {
        if (!entries.some(function visible(entry) { return entry.isIntersecting; })) return;
        modelObserver.disconnect();
        initializeModel();
      }, { rootMargin: '500px 0px', threshold: 0.01 });
      modelObserver.observe(stage);
    } else {
      initializeModel();
    }
  }

  var items = Array.prototype.slice.call(document.querySelectorAll('.home-scroll-reveal'));
  function showAll() { items.forEach(function show(item) { item.classList.add('is-visible'); }); }
  if (!('IntersectionObserver' in window) || motion.matches) {
    showAll();
    return;
  }
  var observer = new IntersectionObserver(function reveal(entries) {
    entries.forEach(function show(entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -24px 0px', threshold: 0.05 });
  items.forEach(function stagger(item) {
    var siblings = Array.prototype.filter.call(item.parentElement.children, function isReveal(node) {
      return node.classList.contains('home-scroll-reveal');
    });
    item.style.setProperty('--home-reveal-delay', Math.max(0, siblings.indexOf(item)) * 100 + 'ms');
  });
  document.documentElement.classList.add('home-motion-ready');
  window.requestAnimationFrame(function firstPaint() {
    window.requestAnimationFrame(function observe() {
      if (motion.matches) { showAll(); return; }
      items.forEach(function watch(item) { observer.observe(item); });
    });
  });
  motion.addEventListener('change', function update(event) {
    if (!event.matches) return;
    observer.disconnect();
    showAll();
  });
})();
