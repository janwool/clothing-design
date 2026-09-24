(() => {
  'use strict';

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  let nextId = 0;

  function render({ name, label, value, options }) {
    const id = `cloz-dropdown-${++nextId}`;
    const selected = options.find(option => String(option.value) === String(value)) || options[0];
    if (!selected) return '';
    return `<div class="cloz-dropdown" data-cloz-dropdown="${escapeHtml(name)}">
      <button type="button" class="cloz-dropdown-trigger" data-cloz-trigger aria-label="${escapeHtml(label)}: ${escapeHtml(selected.label)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}"><span data-cloz-value>${escapeHtml(selected.label)}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg></button>
      <div class="cloz-dropdown-menu" id="${id}" role="listbox" aria-label="${escapeHtml(label)}" hidden>${options.map(option => `<button type="button" class="cloz-dropdown-option ${String(option.value) === String(value) ? 'selected' : ''}" data-cloz-option="${escapeHtml(option.value)}" role="option" aria-selected="${String(option.value) === String(value)}" tabindex="-1"><span>${escapeHtml(option.label)}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg></button>`).join('')}</div>
    </div>`;
  }

  function bind(container, onChange, { isDisabled = () => false } = {}) {
    function close() {
      container.querySelectorAll('.cloz-dropdown.open').forEach(root => {
        root.classList.remove('open', 'open-up');
        root.querySelector('[data-cloz-trigger]').setAttribute('aria-expanded', 'false');
        root.querySelector('.cloz-dropdown-menu').hidden = true;
      });
    }

    function open(root, focusSelected = false) {
      close();
      const menu = root.querySelector('.cloz-dropdown-menu');
      menu.hidden = false;
      root.classList.add('open');
      root.querySelector('[data-cloz-trigger]').setAttribute('aria-expanded', 'true');
      const spaceBelow = container.getBoundingClientRect().bottom - root.getBoundingClientRect().bottom;
      const spaceAbove = root.getBoundingClientRect().top - container.getBoundingClientRect().top;
      root.classList.toggle('open-up', spaceBelow < menu.offsetHeight + 8 && spaceAbove > spaceBelow);
      if (focusSelected) (root.querySelector('.cloz-dropdown-option.selected') || root.querySelector('.cloz-dropdown-option'))?.focus();
    }

    function choose(root, option) {
      const name = root.dataset.clozDropdown;
      const value = option.dataset.clozOption;
      const label = option.querySelector('span').textContent;
      root.querySelector('[data-cloz-value]').textContent = label;
      const trigger = root.querySelector('[data-cloz-trigger]');
      trigger.setAttribute('aria-label', `${root.querySelector('[role="listbox"]').getAttribute('aria-label')}: ${label}`);
      root.querySelectorAll('.cloz-dropdown-option').forEach(item => {
        const selected = item === option;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-selected', String(selected));
      });
      close();
      trigger.focus();
      onChange(name, value);
    }

    container.addEventListener('click', event => {
      const root = event.target.closest('.cloz-dropdown');
      if (!root || !container.contains(root)) return;
      if (isDisabled()) return;
      const option = event.target.closest('[data-cloz-option]');
      if (option) { choose(root, option); return; }
      if (event.target.closest('[data-cloz-trigger]')) root.classList.contains('open') ? close() : open(root);
    });
    container.addEventListener('keydown', event => {
      const root = event.target.closest('.cloz-dropdown');
      if (!root || !container.contains(root)) return;
      if (isDisabled()) return;
      const options = [...root.querySelectorAll('.cloz-dropdown-option')];
      const current = options.indexOf(document.activeElement);
      if (event.key === 'Escape' && root.classList.contains('open')) {
        event.preventDefault(); event.stopPropagation(); close(); root.querySelector('[data-cloz-trigger]').focus(); return;
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        if (!root.classList.contains('open')) open(root);
        const selected = options.findIndex(option => option.classList.contains('selected'));
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : current < 0 ? selected : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[index]?.focus();
      }
    });
    container.addEventListener('focusout', event => {
      const root = event.target.closest('.cloz-dropdown');
      if (root) requestAnimationFrame(() => { if (!root.contains(document.activeElement)) close(); });
    });
    document.addEventListener('pointerdown', event => { if (!container.contains(event.target)) close(); });
    return { close };
  }

  window.ClozDropdown = { render, bind };
})();
