(function initHomeCanvas() {
  'use strict';

  var modelStage = document.querySelector('[data-home-model-stage]');
  var modelViewer = document.querySelector('[data-home-model-viewer]');
  var modelLoading = document.querySelector('[data-home-model-loading]');
  var modelViewerRequested = false;

  function setModelReady() {
    if (!modelStage) return;
    modelStage.classList.add('is-model-ready');
    modelStage.classList.remove('is-model-error');
    modelStage.setAttribute('aria-busy', 'false');
  }

  function setModelError() {
    if (!modelStage) return;
    modelStage.classList.add('is-model-error');
    modelStage.setAttribute('aria-busy', 'false');
    if (modelLoading) modelLoading.textContent = '3D preview unavailable';
  }

  function loadModelViewer() {
    if (!modelViewer || modelViewerRequested) return;
    modelViewerRequested = true;

    window.ModelViewerElement = window.ModelViewerElement || {};
    window.ModelViewerElement.meshoptDecoderLocation = '/vendor/model-viewer/meshopt_decoder.js?v=three-0.183.0';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      modelViewer.removeAttribute('auto-rotate');
    }

    modelViewer.addEventListener('load', setModelReady, { once: true });
    modelViewer.addEventListener('error', setModelError, { once: true });
    modelViewer.addEventListener('pointerdown', function markModelInteraction() {
      modelStage.classList.add('has-interacted');
    }, { once: true });

    if (window.customElements && window.customElements.get('model-viewer')) return;

    var script = document.createElement('script');
    script.type = 'module';
    script.src = '/vendor/model-viewer/model-viewer.min.js?v=4.3.1';
    script.addEventListener('error', setModelError, { once: true });
    document.head.appendChild(script);
  }

  if (modelStage && 'IntersectionObserver' in window) {
    var modelObserver = new IntersectionObserver(function loadVisibleModel(entries) {
      if (!entries.some(function isVisible(entry) { return entry.isIntersecting; })) return;
      modelObserver.disconnect();
      loadModelViewer();
    }, { rootMargin: '500px 0px', threshold: 0.01 });
    modelObserver.observe(modelStage);
  } else {
    loadModelViewer();
  }

  var carousel = document.querySelector('[data-home-carousel]');

  if (carousel) {
    var slides = Array.prototype.slice.call(carousel.querySelectorAll('[data-home-carousel-slide]'));
    var dots = Array.prototype.slice.call(carousel.querySelectorAll('[data-home-carousel-dot]'));
    var previous = carousel.querySelector('[data-home-carousel-prev]');
    var next = carousel.querySelector('[data-home-carousel-next]');
    var activeIndex = 0;
    var timer = null;

    function render(index) {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach(function updateSlide(slide, slideIndex) {
        var previousIndex = (activeIndex - 1 + slides.length) % slides.length;
        var nextIndex = (activeIndex + 1) % slides.length;
        slide.classList.toggle('is-active', slideIndex === activeIndex);
        slide.classList.toggle('is-previous', slideIndex === previousIndex);
        slide.classList.toggle('is-next', slideIndex === nextIndex);
        slide.setAttribute('aria-hidden', slideIndex === activeIndex ? 'false' : 'true');
      });
      dots.forEach(function updateDot(dot, dotIndex) {
        dot.setAttribute('aria-current', dotIndex === activeIndex ? 'true' : 'false');
      });
    }

    function stopAutoplay() {
      if (timer) window.clearInterval(timer);
      timer = null;
    }

    function startAutoplay() {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      stopAutoplay();
      timer = window.setInterval(function autoplayNext() { render(activeIndex + 1); }, 5200);
    }

    previous.addEventListener('click', function showPrevious() { render(activeIndex - 1); startAutoplay(); });
    next.addEventListener('click', function showNext() { render(activeIndex + 1); startAutoplay(); });
    dots.forEach(function bindDot(dot) {
      dot.addEventListener('click', function showSelectedSlide() {
        render(Number(dot.getAttribute('data-home-carousel-dot')) || 0);
        startAutoplay();
      });
    });

    carousel.addEventListener('mouseenter', stopAutoplay);
    carousel.addEventListener('mouseleave', startAutoplay);
    carousel.addEventListener('focusin', stopAutoplay);
    carousel.addEventListener('focusout', startAutoplay);
    render(0);
    startAutoplay();
  }

  var revealItems = Array.prototype.slice.call(document.querySelectorAll('.home-scroll-reveal'));
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('home-motion-ready');
    var revealObserver = new IntersectionObserver(function reveal(entries) {
      entries.forEach(function revealEntry(entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    revealItems.forEach(function observeItem(item) { revealObserver.observe(item); });
  } else {
    revealItems.forEach(function showItem(item) { item.classList.add('is-visible'); });
  }
})();
