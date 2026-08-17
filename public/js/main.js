function clearStaleOverlays() {
  // Defensive cleanup for stale overlays after auth redirects or browser bfcache restores.
  document.body.style.overflow = '';
  document.querySelectorAll('.design-modal').forEach(modal => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  });
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    if (!modal.dataset.keepOpen) {
      modal.style.display = 'none';
    }
  });
  document.querySelectorAll('.mobile-menu.active').forEach(menu => {
    menu.classList.remove('active');
  });
  document.querySelectorAll('.mobile-toggle[aria-expanded="true"]').forEach(toggle => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  });
}

// Mobile menu toggle
document.addEventListener('DOMContentLoaded', function() {
  clearStaleOverlays();

  const mobileToggle = document.querySelector('.mobile-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');

  if (mobileToggle && mobileMenu) {
    const setMobileMenuOpen = (isOpen) => {
      mobileMenu.classList.toggle('active', isOpen);
      mobileToggle.setAttribute('aria-expanded', String(isOpen));
      mobileToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
      mobileToggle.classList.toggle('is-open', isOpen);
    };

    mobileToggle.addEventListener('click', function() {
      setMobileMenuOpen(!mobileMenu.classList.contains('active'));
    });

    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => setMobileMenuOpen(false));
    });
  }

  const navDropdowns = document.querySelectorAll('.nav-dropdown');

  navDropdowns.forEach(dropdown => {
    const toggle = dropdown.querySelector('.dropdown-toggle');

    if (!toggle) return;

    const closeOtherDropdowns = () => {
      navDropdowns.forEach(item => {
        if (item === dropdown) return;
        item.classList.remove('is-open');
        item.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
      });
    };

    const openDropdown = () => {
      closeOtherDropdowns();
      dropdown.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
    };

    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      const shouldOpen = !dropdown.classList.contains('is-open');
      closeOtherDropdowns();
      dropdown.classList.toggle('is-open', shouldOpen);
      toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    });

    dropdown.addEventListener('mouseenter', openDropdown);
    dropdown.addEventListener('focusin', openDropdown);
  });

  // Close mobile menu when clicking outside
  document.addEventListener('click', function(e) {
    if (mobileMenu && mobileMenu.classList.contains('active')) {
      if (!mobileMenu.contains(e.target) && !mobileToggle.contains(e.target)) {
        mobileMenu.classList.remove('active');
        mobileToggle.setAttribute('aria-expanded', 'false');
        mobileToggle.setAttribute('aria-label', 'Open menu');
        mobileToggle.classList.remove('is-open');
      }
    }

    navDropdowns.forEach(dropdown => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('is-open');
        dropdown.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
      }
    });
  });

  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;

    if (mobileMenu?.classList.contains('active')) {
      mobileMenu.classList.remove('active');
      mobileToggle?.setAttribute('aria-expanded', 'false');
      mobileToggle?.setAttribute('aria-label', 'Open menu');
      mobileToggle?.classList.remove('is-open');
      mobileToggle?.focus();
    }

    navDropdowns.forEach(dropdown => {
      dropdown.classList.remove('is-open');
      dropdown.querySelector('.dropdown-toggle')?.setAttribute('aria-expanded', 'false');
    });
  });

  // Navbar scroll effect
  const navbar = document.querySelector('.navbar');
  let lastScroll = 0;

  window.addEventListener('scroll', function() {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
      navbar.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
    } else {
      navbar.style.boxShadow = 'none';
    }

    lastScroll = currentScroll;
  });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  const revealItems = document.querySelectorAll('.home-reveal, .home-reveal-card, .home-copy-reveal');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (revealItems.length && !reduceMotion && 'IntersectionObserver' in window) {
    document.body.classList.add('reveal-motion-ready');

    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, {
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.12
    });

    revealItems.forEach(item => revealObserver.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add('is-visible'));
  }
});

window.addEventListener('pageshow', clearStaleOverlays);
