(function () {
  'use strict';

  window.dataLayer = window.dataLayer || [];

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function track(eventName, parameters) {
    if (!eventName) return;
    window.dataLayer.push(Object.assign({
      event: eventName,
      page_path: window.location.pathname,
      page_title: document.title
    }, parameters || {}));
  }

  window.trackEvent = track;

  function pageType() {
    const path = window.location.pathname;
    if (path === '/') return 'home';
    if (path === '/pricing') return 'pricing';
    if (path.startsWith('/auth/')) return 'auth';
    if (path.startsWith('/designer/')) return 'designer';
    if (path.startsWith('/3d-models/')) return 'model_detail';
    if (path.startsWith('/patterns/')) return 'pattern_detail';
    if (path === '/patterns') return 'patterns';
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
      link_url: anchor ? anchor.href : undefined,
      link_location: linkLocation(target)
    };

    const menu = target.closest('.navbar, .mobile-menu, .dropdown-menu, .user-menu');
    const categoryCard = target.closest('.generator-category-card');
    const listItem = target.closest('.model-card, .pattern-card-link, .popular-card, .tool-card, .gallery-item');

    if (target.matches('.filter-btn[data-filter]')) return track('category_select', Object.assign(common, {
      category_name: target.dataset.filter,
      selection_source: 'filter'
    }));
    if (categoryCard) return track('category_select', Object.assign(common, {
      category_name: cleanText(categoryCard.querySelector('h3, h2, .category-name')?.textContent || target.textContent),
      category_url: anchor?.href,
      selection_source: 'category_list'
    }));
    if (menu) {
      track('menu_click', Object.assign(common, {
      menu_name: target.closest('.mobile-menu') ? 'mobile_menu' : target.closest('.user-menu') ? 'user_menu' : target.closest('.dropdown-menu') ? 'tools_dropdown' : 'main_navigation',
      menu_item: text,
      menu_action: target.matches('.dropdown-toggle, .user-toggle, .mobile-toggle') ? 'toggle' : 'select'
      }));
      if (!anchor) return;
    }
    if (listItem && anchor) return track('list_item_select', Object.assign(common, {
      list_type: listItem.matches('.pattern-card-link') || listItem.closest('[data-category]')?.querySelector('.pattern-card-link') ? 'pattern' : listItem.matches('.popular-card, .tool-card') ? 'tool' : listItem.matches('.gallery-item') ? 'gallery' : 'model',
      item_name: cleanText(listItem.querySelector('h3, h2, .model-name, .tool-title')?.textContent || target.getAttribute('aria-label') || target.textContent),
      item_category: listItem.dataset.category || listItem.closest('[data-category]')?.dataset.category
    }));

    if (href === '/auth/logout') return track('logout', common);
    if (href.includes('/auth/register')) {
      return track(target.closest('.pricing-card') ? 'select_plan' : 'registration_start', Object.assign(common, {
        plan_name: cleanText(target.closest('.pricing-card')?.querySelector('h3')?.textContent)
      }));
    }
    if (href.includes('/auth/login')) return track('login_start', common);
    if (anchor?.hasAttribute('download')) return track('file_download', Object.assign(common, {
      file_name: href.split('/').pop()?.split('?')[0]
    }));
    if (href.startsWith('/designer/') || target.id === 'designNowBtn') return track('designer_start', common);
    if (target.id === 'downloadBtn' || target.id === 'downloadRenderBtn' || target.id === 'downloadRenderModalBtn') {
      return track('design_export', Object.assign(common, { export_format: 'png' }));
    }
    if (target.matches('[data-color]')) return track('designer_color_change', Object.assign(common, {
      color: target.dataset.color,
      design_target: target.dataset.target
    }));
    if (target.matches('[data-pattern]')) return track('designer_pattern_change', Object.assign(common, {
      pattern: target.dataset.pattern
    }));
    if (target.matches('[data-env]')) return track('designer_environment_change', Object.assign(common, {
      environment: target.dataset.env
    }));
    if (menu) return;
    if (anchor && (href.startsWith('/') || anchor.origin === window.location.origin)) {
      return track(linkLocation(target) === 'navigation' ? 'navigation_click' : 'link_click', common);
    }
    track('button_click', common);
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
      track(name === 'login' ? 'login_submit' : name === 'register' ? 'registration_submit' : 'form_submit', {
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
        track('file_upload_selected', {
          input_name: input.name || input.id,
          file_type: input.files[0].type || undefined,
          file_extension: input.files[0].name.split('.').pop()?.toLowerCase()
        });
      });
    });
  });
})();
