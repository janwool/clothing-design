(function () {
  'use strict';

  var cards = Array.from(document.querySelectorAll('.mockups-masonry-card, .white-catalog-card'));
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!cards.length || reducedMotion.matches || !('IntersectionObserver' in window)) return;

  var observer = new IntersectionObserver(function (entries) {
    var entering = entries.filter(function (entry) { return entry.isIntersecting; });
    entering.forEach(function (entry, index) {
      entry.target.style.setProperty('--catalog-reveal-delay', Math.min(index, 3) * 60 + 'ms');
      entry.target.classList.add('is-catalog-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });

  document.body.classList.add('catalog-motion-ready');
  cards.forEach(function (card) { observer.observe(card); });

  function showAll() {
    observer.disconnect();
    document.body.classList.remove('catalog-motion-ready');
  }
  reducedMotion.addEventListener('change', function (event) { if (event.matches) showAll(); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) showAll(); });
  // Keyboard navigation must never focus a visually hidden result.
  document.addEventListener('focusin', function (event) {
    var card = event.target.closest('.mockups-masonry-card, .white-catalog-card');
    if (card) {
      card.style.setProperty('--catalog-reveal-delay', '0ms');
      card.classList.add('is-catalog-visible');
      observer.unobserve(card);
    }
  });
}());
