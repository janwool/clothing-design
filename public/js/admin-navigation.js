document.querySelector('.sidebar-toggle')?.addEventListener('click', event => {
  const open = document.querySelector('.admin-sidebar').classList.toggle('active');
  event.currentTarget.setAttribute('aria-expanded', String(open));
  event.currentTarget.setAttribute('aria-label', open ? 'Close admin navigation' : 'Open admin navigation');
});
