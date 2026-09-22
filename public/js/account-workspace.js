(function initializeAccountWorkspace() {
  'use strict';

  const projectGrid = document.getElementById('workspaceProjectGrid');
  const renameDialog = document.getElementById('workspaceRenameDialog');
  const renameInput = document.getElementById('workspaceRenameInput');
  const renameConfirm = document.getElementById('workspaceRenameConfirm');
  const profileForm = document.getElementById('workspaceProfileForm');
  const toast = document.getElementById('workspaceToast');
  let activeCard = null;
  let toastTimer = 0;

  function showToast(message, isError) {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('is-error', Boolean(isError));
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    let result = {};
    try { result = await response.json(); } catch (error) { result = {}; }
    if (!response.ok) {
      const requestError = new Error(result.error || 'Request failed.');
      requestError.status = response.status;
      throw requestError;
    }
    return result;
  }

  function closeProjectMenus(except) {
    document.querySelectorAll('.workspace-project-card').forEach(card => {
      if (card === except) return;
      card.querySelector('.workspace-card-menu')?.setAttribute('hidden', '');
      card.querySelector('[data-project-menu-button]')?.setAttribute('aria-expanded', 'false');
    });
  }

  projectGrid?.addEventListener('click', async event => {
    const card = event.target.closest('.workspace-project-card');
    if (!card) return;
    const menuButton = event.target.closest('[data-project-menu-button]');
    if (menuButton) {
      const menu = card.querySelector('.workspace-card-menu');
      const willOpen = menu.hasAttribute('hidden');
      closeProjectMenus(card);
      menu.toggleAttribute('hidden', !willOpen);
      menuButton.setAttribute('aria-expanded', String(willOpen));
      return;
    }
    const actionButton = event.target.closest('[data-project-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.projectAction;
    closeProjectMenus();
    if (action === 'rename') {
      activeCard = card;
      renameInput.value = card.querySelector('[data-project-title]')?.textContent.trim() || '';
      renameDialog?.showModal();
      window.setTimeout(() => renameInput?.select(), 40);
      return;
    }
    if (action === 'duplicate') {
      actionButton.disabled = true;
      try {
        await api(`/api/projects/${encodeURIComponent(card.dataset.projectId)}/duplicate`, { method: 'POST', body: '{}' });
        showToast('Project duplicated.');
        window.setTimeout(() => window.location.reload(), 450);
      } catch (error) {
        actionButton.disabled = false;
        showToast(error.message, true);
      }
      return;
    }
    if (action === 'delete' && window.confirm('Delete this project? It will be removed from your workspace but still counts toward your project creation allowance. Its uploaded files will remain stored.')) {
      try {
        await api(`/api/projects/${encodeURIComponent(card.dataset.projectId)}`, { method: 'DELETE' });
        card.style.opacity = '0';
        card.style.transform = 'scale(.96)';
        window.setTimeout(() => card.remove(), 220);
        showToast('Project deleted.');
      } catch (error) {
        showToast(error.message, true);
      }
    }
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.workspace-project-card')) closeProjectMenus();
  });

  renameConfirm?.addEventListener('click', async event => {
    event.preventDefault();
    const name = String(renameInput?.value || '').trim();
    if (!activeCard || !name) return renameInput?.focus();
    renameConfirm.disabled = true;
    try {
      const result = await api(`/api/projects/${encodeURIComponent(activeCard.dataset.projectId)}`, {
        method: 'PATCH', body: JSON.stringify({ name })
      });
      activeCard.dataset.projectName = result.project.name.toLocaleLowerCase();
      activeCard.querySelectorAll('[data-project-title] a').forEach(link => { link.textContent = result.project.name; });
      activeCard.querySelectorAll('img').forEach(image => { image.alt = `${result.project.name} preview`; });
      renameDialog.close();
      showToast('Project renamed.');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      renameConfirm.disabled = false;
    }
  });

  profileForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = profileForm.querySelector('[type="submit"]');
    const name = document.getElementById('workspaceProfileName')?.value.trim();
    submit.disabled = true;
    try {
      await api('/api/account', { method: 'PATCH', body: JSON.stringify({ name }) });
      showToast('Account name updated.');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });

}());
