(() => {
  const buttons = Array.from(document.querySelectorAll('[data-guide-filter]'));
  const cards = Array.from(document.querySelectorAll('[data-guide-category]'));
  const status = document.getElementById('guide-filter-status');
  if (!buttons.length || !cards.length) return;

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const category = button.dataset.guideFilter;
      let visible = 0;
      buttons.forEach(item => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      cards.forEach(card => {
        const show = category === 'all' || card.dataset.guideCategory === category;
        card.hidden = !show;
        if (show) visible += 1;
      });
      if (status) status.textContent = `${visible} ${visible === 1 ? 'guide' : 'guides'} shown`;
    });
  });
})();
