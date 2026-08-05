(function () {
  'use strict';

  window.dataLayer = window.dataLayer || [];

  var STABLE_EVENTS = new Set([
    'page_view',
    'navigation_click',
    'select_content',
    'sign_up_start',
    'sign_up',
    'login_start',
    'login',
    'auth_error',
    'form_submit',
    'file_download',
    'upload_artwork',
    'begin_design',
    'design_customize',
    'design_export',
    'generate_lead',
    'tool_interaction',
    'search',
    'faq_toggle',
    'share',
    'ui_interaction'
  ]);

  function cleanText(value, maxLength) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength || 120);
  }

  function cleanKey(value, fallback) {
    var key = String(value || '')
      .toLowerCase()
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
    return key || fallback || 'unknown';
  }

  function normalizeEventName(value) {
    var name = cleanKey(value, 'ui_interaction');
    if (STABLE_EVENTS.has(name)) return name;
    if (name === 'content_share' || name.includes('share')) return 'share';
    if (name.includes('faq')) return 'faq_toggle';
    if (name.includes('registration') || name.includes('sign_up')) {
      return name.includes('success') ? 'sign_up' : 'sign_up_start';
    }
    if (name.includes('login')) return name.includes('success') ? 'login' : 'login_start';
    if (name.includes('lead') || name.includes('inquiry')) return 'generate_lead';
    if (name.includes('export') || name.includes('download_render')) return 'design_export';
    if (name.includes('download')) return 'file_download';
    if (name.includes('upload') || name.includes('file_selected')) return 'upload_artwork';
    if (name.includes('designer') || name.includes('design_now') || name.includes('designnow')) return 'begin_design';
    if (name.includes('category') || name.includes('model') || name.includes('tool') || name.includes('select')) return 'select_content';
    if (name.includes('menu') || name.includes('click')) return 'navigation_click';
    return 'ui_interaction';
  }

  function track(eventName, parameters) {
    var normalizedName = normalizeEventName(eventName);
    var eventParameters = Object.assign({
      page_path: window.location.pathname,
      page_title: document.title,
      source_event: normalizedName === cleanKey(eventName, '') ? undefined : cleanKey(eventName, undefined)
    }, parameters || {});

    Object.keys(eventParameters).forEach(function (key) {
      if (eventParameters[key] === undefined || eventParameters[key] === null || eventParameters[key] === '') {
        delete eventParameters[key];
      }
    });

    if (typeof window.gtag === 'function') {
      window.gtag('event', normalizedName, eventParameters);
    } else {
      window.dataLayer.push(Object.assign({ event: normalizedName }, eventParameters));
    }
  }

  window.trackEvent = track;

  function pageType() {
    var path = window.location.pathname;
    if (path === '/') return 'home';
    if (path === '/pricing') return 'pricing';
    if (path.startsWith('/auth/')) return 'auth';
    if (path.startsWith('/designer/')) return 'designer';
    if (path.startsWith('/3d-models/')) return path.endsWith('/edit') ? 'designer' : 'model_detail';
    if (path.startsWith('/tools/')) return 'tool_detail';
    if (path === '/tools') return 'tools';
    return 'content';
  }

  function linkLocation(element) {
    if (element.closest('.navbar, .mobile-menu')) return 'navigation';
    if (element.closest('footer')) return 'footer';
    if (element.closest('.pricing-card')) return 'pricing_card';
    if (element.closest('.model-card')) return 'model_card';
    if (element.closest('.tool-detail-hero')) return 'hero';
    return 'content';
  }

  function destination(anchor) {
    if (!anchor) return '';
    try {
      var url = new URL(anchor.href, window.location.origin);
      return url.origin === window.location.origin ? url.pathname : url.hostname + url.pathname;
    } catch (_) {
      return anchor.getAttribute('href') || '';
    }
  }

  function contentType(element) {
    if (element.closest('.model-card')) return '3d_model';
    if (element.closest('.generator-category-card')) return 'category';
    if (element.closest('.tool-card, .popular-card')) return 'tool';
    if (element.closest('.gallery-item')) return 'gallery';
    if (element.closest('.pattern-card-link')) return 'pattern';
    return 'link';
  }

  function semanticClick(element) {
    var anchor = element.closest('a[href]');
    var button = element.closest('button, [role="button"]');
    var target = anchor || button;
    if (!target) return;

    var href = anchor ? anchor.getAttribute('href') || '' : '';
    var text = cleanText(target.getAttribute('aria-label') || target.textContent);
    var common = {
      element_text: text,
      element_id: target.id || undefined,
      item_id: target.dataset.id || target.closest('[data-id]')?.dataset.id || undefined,
      item_name: target.dataset.analyticsItem || text,
      item_category: target.dataset.analyticsCategory || target.dataset.category || undefined,
      link_url: anchor ? anchor.href : undefined,
      link_path: anchor ? destination(anchor) : undefined,
      link_location: linkLocation(target)
    };

    if (target.dataset.analyticsEvent) {
      return track(target.dataset.analyticsEvent, Object.assign(common, {
        content_type: contentType(target)
      }));
    }

    if (href === '/auth/logout') return track('navigation_click', Object.assign(common, { navigation_type: 'logout' }));
    if (href.includes('/auth/register')) return track('sign_up_start', Object.assign(common, {
      plan_name: cleanText(target.closest('.pricing-card')?.querySelector('h3')?.textContent)
    }));
    if (href.includes('/auth/login')) return track('login_start', common);

    if (anchor?.hasAttribute('download')) return track('file_download', Object.assign(common, {
      file_name: href.split('/').pop()?.split('?')[0]
    }));

    if (href.startsWith('/designer/') || href.endsWith('/edit') || target.id === 'designNowBtn') {
      return track('begin_design', Object.assign(common, { design_entry: target.id || 'link' }));
    }

    if (target.matches('.filter-btn[data-filter]')) return track('select_content', Object.assign(common, {
      content_type: 'category_filter',
      item_id: target.dataset.filter
    }));

    if (target.closest('.model-card, .pattern-card-link, .popular-card, .tool-card, .gallery-item, .generator-category-card')) {
      return track('select_content', Object.assign(common, { content_type: contentType(target) }));
    }

    if (target.matches('[data-color], [data-pattern], [data-env]')) return track('design_customize', Object.assign(common, {
      control_type: target.hasAttribute('data-color') ? 'color' : target.hasAttribute('data-pattern') ? 'pattern' : 'environment',
      selected_value: target.dataset.color || target.dataset.pattern || target.dataset.env
    }));

    if (target.id === 'downloadBtn' || target.id === 'downloadRenderBtn' || target.id === 'downloadRenderModalBtn') {
      // A successful export is reported by the export function. This only records intent.
      return track('tool_interaction', Object.assign(common, { interaction_type: 'export_intent' }));
    }

    if (anchor || target.closest('.navbar, .mobile-menu, footer')) {
      return track('navigation_click', common);
    }

    track('ui_interaction', Object.assign(common, { interaction_type: cleanKey(target.dataset.action || target.id || text, 'button') }));
  }

  function formName(form) {
    if (form.action.includes('/auth/login')) return 'login';
    if (form.action.includes('/auth/register')) return 'register';
    return form.id || form.getAttribute('name') || 'form';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var type = pageType();
    track('page_view', {
      page_type: type,
      page_location: window.location.href,
      page_referrer: document.referrer || undefined
    });

    try {
      var pendingAuth = JSON.parse(sessionStorage.getItem('analytics_pending_auth') || 'null');
      if (pendingAuth) {
        var authError = document.querySelector('.auth-error, .alert-error, [data-auth-error]');
        if (type !== 'auth') {
          track(pendingAuth.type === 'register' ? 'sign_up' : 'login', { method: 'email' });
          sessionStorage.removeItem('analytics_pending_auth');
        } else if (authError) {
          track('auth_error', {
            auth_type: pendingAuth.type,
            error_message: cleanText(authError.textContent)
          });
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
      var form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      var name = formName(form);
      track('form_submit', {
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
        track('upload_artwork', {
          input_name: input.name || input.id,
          file_type: input.files[0].type || undefined,
          file_extension: input.files[0].name.split('.').pop()?.toLowerCase()
        });
      });
    });

    document.querySelectorAll('select, input[type="range"], input[type="checkbox"], input[type="radio"]').forEach(function (control) {
      control.addEventListener('change', function () {
        track('design_customize', {
          control_name: control.id || control.name || control.classList[0] || control.type,
          control_type: control.type || control.tagName.toLowerCase(),
          selected_value: control.type === 'checkbox' || control.type === 'radio' ? String(control.checked) : cleanText(control.value)
        });
      });
    });

    document.querySelectorAll('input[type="search"], .search-input').forEach(function (control) {
      control.addEventListener('change', function () {
        if (!cleanText(control.value)) return;
        track('search', { search_term: cleanText(control.value) });
      });
    });

    document.querySelectorAll('details').forEach(function (details, index) {
      details.addEventListener('toggle', function () {
        track('faq_toggle', {
          item_id: details.dataset.analyticsItem || String(index + 1),
          item_name: details.dataset.analyticsItem || cleanText(details.querySelector('summary')?.textContent),
          toggle_state: details.open ? 'open' : 'closed'
        });
      });
    });
  });
})();
