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
}

// Mobile menu toggle
document.addEventListener('DOMContentLoaded', function() {
  clearStaleOverlays();

  const mobileToggle = document.querySelector('.mobile-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');

  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', function() {
      mobileMenu.classList.toggle('active');
    });
  }

  // Close mobile menu when clicking outside
  document.addEventListener('click', function(e) {
    if (mobileMenu && mobileMenu.classList.contains('active')) {
      if (!mobileMenu.contains(e.target) && !mobileToggle.contains(e.target)) {
        mobileMenu.classList.remove('active');
      }
    }
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
});

window.addEventListener('pageshow', clearStaleOverlays);
