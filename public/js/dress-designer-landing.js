(() => {
  const page = document.querySelector('.dress-page');
  if (!page) return;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if ('IntersectionObserver' in window && !preference.matches) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: '0px 0px -32px 0px' });
    page.querySelectorAll(':scope > section > .dress-shell > *').forEach((content) => {
      if (!content.classList) return;
      const split = content.matches('.dress-hero-grid, .dress-design-layout, .dress-export-layout, .dress-production-overview');
      const groups = split ? [...content.children] : [content];
      const targets = groups.flatMap(target => getComputedStyle(target).display === 'contents' ? [...target.children] : [target]);
      targets.forEach((target, index) => {
        const order = split ? index : [...content.parentElement.children].indexOf(content);
        target.style.setProperty('--dress-reveal-delay', `${Math.min(order, 3) * 100}ms`);
        target.classList.add('dress-reveal');
        revealObserver.observe(target);
      });
    });
  }
  page.querySelectorAll('[data-tryon-demo]').forEach((figure) => {
    const result = figure.querySelector('.dress-tryon-result');
    if (!result) return;
    const images = [...figure.querySelectorAll('img')];
    let visible = false;
    const update = () => figure.classList.toggle('is-active', visible && !document.hidden && !preference.matches && images.every(image => image.complete && image.naturalWidth));
    images.forEach(image => { image.addEventListener('load', update); image.addEventListener('error', update); });
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); }, { threshold: .15 });
      observer.observe(figure);
    } else { visible = true; }
    update();
  });
  page.querySelectorAll('[data-dress-video]').forEach((figure) => {
    const video = figure.querySelector('video');
    if (!video) return;
    let visible = false;
    let failed = false;
    let attempt = 0;
    const update = () => {
      const token = ++attempt;
      if (!visible || document.hidden || preference.matches || failed) {
        video.pause();
        figure.classList.remove('is-playing');
        return;
      }
      if (!video.getAttribute('src')) video.src = video.dataset.src;
      video.muted = true;
      const play = video.play();
      if (play) play.then(() => {
        if (token === attempt) figure.classList.add('is-playing');
      }).catch(() => {
        if (token === attempt) figure.classList.remove('is-playing');
      });
    };
    video.addEventListener('error', () => { failed = true; update(); });
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        update();
      }, { threshold: .08 });
      observer.observe(figure);
    } else { visible = true; }
    update();
  });
  page.querySelectorAll('[data-dress-carousel]').forEach((viewport) => {
    const group = viewport.querySelector('[data-carousel-group]');
    if (!group || group.children.length < 2) return;
    const copy = group.cloneNode(true);
    copy.removeAttribute('data-carousel-group');
    copy.setAttribute('aria-hidden', 'true');
    copy.querySelectorAll('a').forEach((link) => { link.tabIndex = -1; });
    // The second identical group lets native horizontal scrolling wrap seamlessly.
    group.parentNode.append(copy);
    let visible = false;
    let hovered = false;
    let focused = false;
    let touching = false;
    let resumeAt = 0;
    let frame = 0;
    let previous = 0;
    let position = viewport.scrollLeft;
    const active = () => visible && !document.hidden && !preference.matches;
    const tick = (now) => {
      frame = 0;
      if (!active()) { previous = 0; return; }
      const elapsed = previous ? Math.min(now - previous, 64) : 0;
      previous = now;
      if (!hovered && !focused && !touching && now >= resumeAt) {
        const width = group.getBoundingClientRect().width;
        if (width > 0) {
          position = (position + elapsed * .036) % width;
          viewport.scrollLeft = position;
        }
      } else {
        position = viewport.scrollLeft;
      }
      frame = window.requestAnimationFrame(tick);
    };
    const update = () => {
      copy.hidden = preference.matches;
      previous = 0;
      position = viewport.scrollLeft;
      if (active() && !frame) frame = window.requestAnimationFrame(tick);
      if (!active() && frame) { window.cancelAnimationFrame(frame); frame = 0; }
    };
    const manual = () => { resumeAt = performance.now() + 1800; position = viewport.scrollLeft; };
    viewport.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') hovered = true; });
    viewport.addEventListener('pointerleave', () => { hovered = false; });
    viewport.addEventListener('focusin', () => { focused = true; });
    viewport.addEventListener('focusout', (event) => { focused = viewport.contains(event.relatedTarget); });
    viewport.addEventListener('touchstart', () => { touching = true; }, { passive: true });
    const release = () => { touching = false; manual(); };
    viewport.addEventListener('touchend', release, { passive: true });
    viewport.addEventListener('touchcancel', release, { passive: true });
    viewport.addEventListener('wheel', manual, { passive: true });
    viewport.addEventListener('scroll', () => {
      const width = group.getBoundingClientRect().width;
      if (!preference.matches && width > 0 && viewport.scrollLeft >= width) {
        viewport.scrollLeft -= width;
      }
      position = viewport.scrollLeft;
    }, { passive: true });
    viewport.addEventListener('keydown', (event) => {
      if (event.target !== viewport || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const distance = group.children[0].getBoundingClientRect().width + parseFloat(getComputedStyle(group).gap);
      viewport.scrollBy({ left: distance * (event.key === 'ArrowRight' ? 1 : -1), behavior: 'auto' });
      manual();
    });
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; update(); });
      observer.observe(viewport);
    } else { visible = true; }
    update();
  });
  page.querySelectorAll('[data-motion]').forEach((figure) => {
    const picture = figure.querySelector('picture');
    const image = figure.querySelector('img');
    let visible = image.loading === 'eager';
    let failed = false;
    const update = () => {
      const playing = visible && !preference.matches && !failed;
      const src = playing ? image.dataset.animation : image.dataset.poster;
      if (image.getAttribute('src') !== src) image.src = src;
    };
    preference.addEventListener('change', update);
    const usePoster = () => {
      if (failed) return;
      failed = true;
      picture.querySelector('source')?.remove();
      image.src = image.dataset.poster;
    };
    image.addEventListener('error', usePoster);
    // An eager image can fail before this deferred script attaches its listener.
    if (image.complete && !image.naturalWidth) usePoster();
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        update();
      }, { threshold: .08 });
      observer.observe(figure);
    } else {
      visible = true;
    }
    update();
  });
})();
