(function () {
  'use strict';

  window.dataLayer = window.dataLayer || [];

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function analyticsKey(value, fallback) {
    const key = String(value || '')
      .toLowerCase()
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return key || fallback || 'unknown';
  }

  function uniqueEvent(parts) {
    const fullName = parts.map(function (part) { return analyticsKey(part, ''); }).filter(Boolean).join('_');
    if (fullName.length <= 40) return fullName;
    let hash = 5381;
    for (let index = 0; index < fullName.length; index++) hash = ((hash << 5) + hash) ^ fullName.charCodeAt(index);
    return fullName.slice(0, 31).replace(/_+$/, '') + '_' + (hash >>> 0).toString(36).slice(0, 8);
  }

  function destinationKey(anchor, target) {
    if (anchor) {
      const url = new URL(anchor.href, window.location.origin);
      if (url.protocol === 'javascript:') return analyticsKey(anchor.getAttribute('href'), 'history');
      const destination = url.origin === window.location.origin ? url.pathname : url.hostname + url.pathname;
      return analyticsKey(destination === '/' ? 'home' : destination, 'link');
    }
    return analyticsKey(
      target.id || target.dataset.action || target.dataset.tool || target.dataset.material ||
      target.dataset.mode || target.dataset.stop || target.dataset.filter || target.getAttribute('title') ||
      target.getAttribute('aria-label') || target.textContent,
      'button'
    );
  }

  function track(eventName, parameters) {
    if (!eventName) return;
    eventName = uniqueEvent([eventName]);
    const eventParameters = Object.assign({
      page_path: window.location.pathname,
      page_title: document.title
    }, parameters || {});

    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, eventParameters);
    } else {
      window.dataLayer.push(Object.assign({ event: eventName }, eventParameters));
    }
  }

  window.trackEvent = track;

  function pageType() {
    const path = window.location.pathname;
    if (path === '/') return 'home';
    if (path === '/pricing') return 'pricing';
    if (path.startsWith('/auth/')) return 'auth';
    if (path.startsWith('/designer/')) return 'designer';
    if (path.startsWith('/3d-models/')) return 'model_detail';
    if (path.startsWith('/tools/')) return 'tool_detail';
    if (path === '/tools') return 'tools';
    if (path.startsWith('/admin')) return 'admin';
    return 'content';
  }

  function linkLocation(element) {
    if (element.closest('.navbar, .mobile-menu')) return 'navigation';
    if (element.closest('footer')) return 'footer';
    if (element.closest('.pricing-card')) return 'pricing_card';
    if (element.closest('.model-card')) return 'model_card';
    return 'content';
  }

  function semanticClick(element) {
    const anchor = element.closest('a[href]');
    const button = element.closest('button, [role="button"]');
    const target = anchor || button;
    if (!target) return;

    const href = anchor ? anchor.getAttribute('href') || '' : '';
    const text = cleanText(target.getAttribute('aria-label') || target.textContent);
    const common = {
      element_text: text,
      element_id: target.id || undefined,
      item_id: target.dataset.id || target.closest('[data-id]')?.dataset.id || undefined,
      link_url: anchor ? anchor.href : undefined,
      link_location: linkLocation(target)
    };

    const menu = target.closest('.navbar, .mobile-menu, .dropdown-menu, .user-menu');
    const categoryCard = target.closest('.generator-category-card');
    const listItem = target.closest('.model-card, .pattern-card-link, .popular-card, .tool-card, .gallery-item');

    if (target.dataset.analyticsEvent) return track(target.dataset.analyticsEvent, Object.assign(common, {
      item_name: target.dataset.analyticsItem || text,
      item_category: target.dataset.analyticsCategory || target.dataset.category || undefined
    }));

    if (target.matches('.filter-btn[data-filter]')) return track(uniqueEvent(['category', target.dataset.filter, 'select']), Object.assign(common, {
      category_name: target.dataset.filter,
      selection_source: 'filter'
    }));
    if (categoryCard) return track(uniqueEvent(['category', destinationKey(anchor, target), 'select']), Object.assign(common, {
      category_name: cleanText(categoryCard.querySelector('h3, h2, .category-name')?.textContent || target.textContent),
      category_url: anchor?.href,
      selection_source: 'category_list'
    }));
    if (menu) {
      track(uniqueEvent(['menu', destinationKey(anchor, target), target.matches('.dropdown-toggle, .user-toggle, .mobile-toggle') ? 'toggle' : 'click']), Object.assign(common, {
      menu_name: target.closest('.mobile-menu') ? 'mobile_menu' : target.closest('.user-menu') ? 'user_menu' : target.closest('.dropdown-menu') ? 'tools_dropdown' : 'main_navigation',
      menu_item: text,
      menu_action: target.matches('.dropdown-toggle, .user-toggle, .mobile-toggle') ? 'toggle' : 'select'
      }));
      if (!anchor) return;
    }
    if (listItem && anchor) {
      const listType = listItem.matches('.pattern-card-link') || listItem.closest('[data-category]')?.querySelector('.pattern-card-link') ? 'pattern' : listItem.matches('.popular-card, .tool-card') ? 'tool' : listItem.matches('.gallery-item') ? 'gallery' : 'model';
      return track(uniqueEvent([listType, destinationKey(anchor, target), 'select']), Object.assign(common, {
      list_type: listType,
      item_name: cleanText(listItem.querySelector('h3, h2, .model-name, .tool-title')?.textContent || target.getAttribute('aria-label') || target.textContent),
      item_category: listItem.dataset.category || listItem.closest('[data-category]')?.dataset.category
    }));
    }

    if (href === '/auth/logout') return track('logout', common);
    if (href.includes('/auth/register')) {
      const planName = cleanText(target.closest('.pricing-card')?.querySelector('h3')?.textContent);
      return track(target.closest('.pricing-card') ? uniqueEvent(['pricing', planName, 'select']) : 'registration_start', Object.assign(common, {
        plan_name: planName
      }));
    }
    if (href.includes('/auth/login')) return track('login_start', common);
    if (anchor?.hasAttribute('download')) return track(uniqueEvent(['file', href.split('/').pop()?.split('?')[0], 'download']), Object.assign(common, {
      file_name: href.split('/').pop()?.split('?')[0]
    }));
    if (href.startsWith('/designer/') || target.id === 'designNowBtn') return track(uniqueEvent(['designer', destinationKey(anchor, target), 'start']), common);
    if (target.id === 'downloadBtn' || target.id === 'downloadRenderBtn' || target.id === 'downloadRenderModalBtn') {
      return track(uniqueEvent(['design', target.id, 'export']), Object.assign(common, { export_format: 'png' }));
    }
    if (target.matches('[data-color]')) return track(uniqueEvent(['designer', target.dataset.target, target.dataset.color, 'select']), Object.assign(common, {
      color: target.dataset.color,
      design_target: target.dataset.target
    }));
    if (target.matches('[data-pattern]')) return track(uniqueEvent(['designer', 'pattern', target.dataset.pattern, 'select']), Object.assign(common, {
      pattern: target.dataset.pattern
    }));
    if (target.matches('[data-env]')) return track(uniqueEvent(['designer', 'environment', target.dataset.env, 'select']), Object.assign(common, {
      environment: target.dataset.env
    }));
    if (menu) return;
    if (anchor && (href.startsWith('/') || anchor.origin === window.location.origin)) {
      return track(uniqueEvent([pageType(), destinationKey(anchor, target), 'click']), common);
    }
    track(uniqueEvent([pageType(), destinationKey(anchor, target), 'click']), common);
  }

  function formName(form) {
    if (form.action.includes('/auth/login')) return 'login';
    if (form.action.includes('/auth/register')) return 'register';
    return form.id || form.getAttribute('name') || 'form';
  }

  document.addEventListener('DOMContentLoaded', function () {
    const type = pageType();
    track('page_view', {
      page_type: type,
      page_location: window.location.href,
      referrer: document.referrer || undefined
    });

    try {
      const pendingAuth = JSON.parse(sessionStorage.getItem('analytics_pending_auth') || 'null');
      if (pendingAuth) {
        const authError = document.querySelector('.auth-error, .alert-error, [data-auth-error]');
        if (type !== 'auth') {
          track(pendingAuth.type + '_success');
          sessionStorage.removeItem('analytics_pending_auth');
        } else if (authError) {
          track(pendingAuth.type + '_failure', { error_message: cleanText(authError.textContent) });
          sessionStorage.removeItem('analytics_pending_auth');
        }
      }
    } catch (_) {
      sessionStorage.removeItem('analytics_pending_auth');
    }

    document.addEventListener('click', function (event) {
      semanticClick(event.target);
    });

    document.addEventListener('submit', function (event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const name = formName(form);
      track(name === 'login' ? 'login_submit' : name === 'register' ? 'registration_submit' : uniqueEvent([pageType(), name, 'submit']), {
        form_name: name,
        form_id: form.id || undefined,
        form_action: form.action
      });
      if (name === 'login' || name === 'register') {
        sessionStorage.setItem('analytics_pending_auth', JSON.stringify({ type: name }));
      }
    });

    document.querySelectorAll('input[type="file"]').forEach(function (input) {
      input.addEventListener('change', function () {
        if (!input.files?.length) return;
        track(uniqueEvent([pageType(), input.name || input.id, 'file_selected']), {
          input_name: input.name || input.id,
          file_type: input.files[0].type || undefined,
          file_extension: input.files[0].name.split('.').pop()?.toLowerCase()
        });
      });
    });

    document.querySelectorAll('select, input[type="range"], input[type="checkbox"], input[type="radio"], input[type="search"], .search-input').forEach(function (control) {
      control.addEventListener('change', function () {
        const controlKey = control.id || control.name || control.classList[0] || control.type;
        const parameters = {
          control_name: controlKey,
          control_type: control.type || control.tagName.toLowerCase()
        };
        if (control.matches('select, input[type="range"], input[type="checkbox"], input[type="radio"]')) {
          parameters.selected_value = control.type === 'checkbox' || control.type === 'radio' ? String(control.checked) : cleanText(control.value);
        }
        track(uniqueEvent([pageType(), controlKey, 'change']), parameters);
      });
    });

    document.querySelectorAll('details').forEach(function (details, index) {
      details.addEventListener('toggle', function () {
        track(details.dataset.analyticsEvent || uniqueEvent([pageType(), 'faq', index + 1, 'toggle']), {
          item_name: details.dataset.analyticsItem || cleanText(details.querySelector('summary')?.textContent),
          toggle_state: details.open ? 'open' : 'closed'
        });
      });
    });
  });
})();
