(() => {
  const banner = document.querySelector('[data-offer-expires]');
  if (!banner) return;
  function refresh() {
    if (Date.now() >= Date.parse(banner.dataset.offerExpires)) {
      banner.remove();
      document.body.classList.remove('has-opening-offer');
      clearInterval(timer);
    }
  }
  const timer = setInterval(refresh, 60000);
  refresh();
  document.addEventListener('visibilitychange', refresh);
})();
