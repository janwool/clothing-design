(() => {
  'use strict';
  const googleEnabled = document.currentScript?.dataset.googleAuth === 'true';
  let dialog, pending, finish, returnFocus;
  function mount() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.id = 'tryOnLoginDialog';
    dialog.className = 'account-login-dialog';
    dialog.setAttribute('aria-labelledby', 'tryOnLoginTitle');
    dialog.innerHTML = `<button type="button" class="account-login-close" aria-label="Close sign in">×</button><span class="account-login-brand">ClozDesign</span><h2 id="tryOnLoginTitle">Sign in to Try-on</h2>
      ${googleEnabled ? '<a class="account-login-google" target="_top">Continue with Google</a><p class="account-login-divider">or use email</p>' : ''}
      <form><label>Email<input name="email" type="email" autocomplete="email" required autofocus></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><p class="account-login-error" role="alert"></p><button class="account-login-submit" type="submit">Sign in</button></form><p class="account-login-register">New to ClozDesign? <a target="_top">Create an account</a></p>`;
    document.body.appendChild(dialog);
    dialog.querySelector('.account-login-close').addEventListener('click', () => dialog.close());
    document.addEventListener('keydown', event => {
      if (dialog.open && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); dialog.close(); }
    }, true);
    dialog.addEventListener('close', () => {
      dialog.querySelector('form').reset();
      finish?.(dialog.returnValue === 'signed-in');
      finish = null; pending = null;
      returnFocus?.focus?.();
    });
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const button = dialog.querySelector('[type="submit"]');
      if (button.disabled) return;
      const errorBox = dialog.querySelector('[role="alert"]');
      const data = new FormData(event.target);
      button.disabled = true; button.textContent = 'Signing in…'; errorBox.textContent = '';
      try {
        const response = await fetch('/auth/login', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ email: data.get('email'), password: data.get('password'), next: location.pathname + location.search }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to sign in. Please try again.');
        if (dialog.open) dialog.close('signed-in');
      } catch (error) { errorBox.textContent = error.message || 'Unable to sign in. Please try again.'; }
      finally { button.disabled = false; button.textContent = 'Sign in'; }
    });
  }
  window.AccountLoginDialog = { open() {
    if (pending) return pending;
    mount(); returnFocus = document.activeElement;
    dialog.returnValue = '';
    dialog.querySelector('[role="alert"]').textContent = '';
    const next = new URL(location.href);
    next.searchParams.set('resumeTryOn', '1');
    const returnPath = next.pathname + next.search;
    const google = dialog.querySelector('.account-login-google');
    if (google) google.href = '/auth/google?next=' + encodeURIComponent(returnPath);
    dialog.querySelector('.account-login-register a').href = '/auth/register?next=' + encodeURIComponent(returnPath);
    pending = new Promise(resolve => { finish = resolve; });
    dialog.showModal();
    return pending;
  } };
})();
