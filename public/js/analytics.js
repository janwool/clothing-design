(function () {
  'use strict';

  window.dataLayer = window.dataLayer || [];

  var DEFAULT_AUTH_RETURN_PATH = '/tools/t-shirt-mockup-generator';

  function cleanText(value, maxLength) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength || 120);
  }

  function cleanKey(value, fallback, maxLength) {
    var key = String(value || '')
      .toLowerCase()
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, maxLength || 80);
    return key || fallback || 'unknown';
  }

  function eventHash(value) {
    var hash = 2166136261;
    for (var index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(36).slice(0, 6).padStart(6, '0');
  }

  // GA4 event names are limited to 40 characters. Keep the functional name
  // readable and add a deterministic suffix only when a name must be shortened.
  function directEventName(value) {
    var name = cleanKey(value, 'unknown_event', 512);
    if (!/^[a-z]/.test(name)) name = 'event_' + name;
    if (name.length <= 40) return name;
    return name.slice(0, 33).replace(/_+$/g, '') + '_' + eventHash(name);
  }

  function namedEvent() {
    return directEventName(Array.from(arguments).filter(Boolean).join('_'));
  }

  function track(eventName, parameters) {
    var analyticsEventName = directEventName(eventName);
    var eventParameters = Object.assign({
      page_path: window.location.pathname,
      page_title: document.title
    }, parameters || {});

    Object.keys(eventParameters).forEach(function (key) {
      if (eventParameters[key] === undefined || eventParameters[key] === null || eventParameters[key] === '') {
        delete eventParameters[key];
      }
    });

    if (typeof window.gtag === 'function') {
      window.gtag('event', analyticsEventName, eventParameters);
    } else {
      window.dataLayer.push(Object.assign({ event: analyticsEventName }, eventParameters));
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
    if (path === '/white-mockups') return 'white_mockups_library';
    if (path.startsWith('/white-mockups/')) return 'white_mockup_detail';
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

  function localPath(value) {
    if (!value) return '';
    try {
      var url = new URL(value, window.location.origin);
      return url.origin === window.location.origin ? url.pathname : '';
    } catch (_) {
      return '';
    }
  }

  function authReturnPathFromUrl(value) {
    if (!value) return '';
    try {
      var url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin) return '';
      return localPath(url.searchParams.get('next'));
    } catch (_) {
      return '';
    }
  }

  function authContext(type, method, requestedReturnPath) {
    var returnPath = localPath(requestedReturnPath);
    return {
      type: type,
      method: method,
      auth_entry_path: window.location.pathname,
      auth_return_path: returnPath || DEFAULT_AUTH_RETURN_PATH,
      auth_return_mode: returnPath ? 'requested_page' : 'default'
    };
  }

  function savePendingAuth(context) {
    sessionStorage.setItem('analytics_pending_auth', JSON.stringify(context));
  }

  function contentType(element) {
    if (element.closest('.model-card')) return '3d_model';
    if (element.closest('.generator-category-card')) return 'category';
    if (element.closest('.tool-card, .popular-card')) return 'tool';
    if (element.closest('.gallery-item')) return 'gallery';
    if (element.closest('.pattern-card-link')) return 'pattern';
    return 'link';
  }

  function targetKey(target, anchor) {
    var href = anchor ? destination(anchor) : '';
    return cleanKey(
      target.dataset.analyticsItem ||
      target.dataset.action ||
      target.dataset.id ||
      target.dataset.plan ||
      target.dataset.filter ||
      target.id ||
      target.getAttribute('aria-label') ||
      target.textContent ||
      href,
      anchor ? 'link' : 'button'
    );
  }

  function semanticClick(element) {
    var anchor = element.closest('a[href]');
    var button = element.closest('button, [role="button"]');
    var target = anchor || button;
    if (!target) return;
    if (target.closest('[data-analytics-managed="true"]')) return;

    var href = anchor ? anchor.getAttribute('href') || '' : '';
    var text = cleanText(target.getAttribute('aria-label') || target.textContent);
    var type = pageType();
    var location = linkLocation(target);
    var functionalTarget = targetKey(target, anchor);
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

    if (href === '/auth/logout') return track(namedEvent(type, 'logout', 'click'), common);
    if (href.includes('/auth/google')) {
      var googleType = window.location.pathname === '/auth/register' ? 'register' : 'login';
      var googleContext = authContext(googleType, 'google', authReturnPathFromUrl(anchor.href));
      savePendingAuth(googleContext);
      return track(namedEvent('auth', 'google', googleType, 'start'), Object.assign(common, googleContext));
    }
    if (href.includes('/auth/register')) {
      var registerContext = authContext('register', undefined, authReturnPathFromUrl(anchor.href));
      var planName = cleanKey(target.dataset.plan || target.closest('.pricing-card')?.querySelector('h2, h3')?.textContent, 'account');
      return track(namedEvent(type, planName, 'signup', 'start'), Object.assign(common, registerContext, {
        plan_name: planName,
        billing_interval: target.dataset.billing
      }));
    }
    if (href.includes('/auth/login')) {
      return track(namedEvent(type, 'login', 'start'), Object.assign(common,
        authContext('login', undefined, authReturnPathFromUrl(anchor.href))
      ));
    }

    if (anchor?.hasAttribute('download')) return track(namedEvent(type, functionalTarget, 'download'), Object.assign(common, {
      file_name: href.split('/').pop()?.split('?')[0]
    }));

    if (href.startsWith('/designer/') || href.endsWith('/edit') || target.id === 'designNowBtn') {
      return track(namedEvent(type, functionalTarget, 'design', 'start'), Object.assign(common, { design_entry: target.id || 'link' }));
    }

    if (target.matches('.filter-btn[data-filter]')) return track(namedEvent(type, target.dataset.filter, 'filter', 'select'), Object.assign(common, {
      content_type: 'category_filter',
      item_id: target.dataset.filter
    }));

    if (target.closest('.model-card, .pattern-card-link, .popular-card, .tool-card, .gallery-item, .generator-category-card')) {
      return track(namedEvent(type, contentType(target), functionalTarget, 'select'), Object.assign(common, { content_type: contentType(target) }));
    }

    if (target.matches('[data-color], [data-pattern], [data-env]')) {
      var designControlType = target.hasAttribute('data-color') ? 'color' : target.hasAttribute('data-pattern') ? 'pattern' : 'environment';
      return track(namedEvent(type, designControlType, 'change'), Object.assign(common, {
        control_type: designControlType,
        selected_value: target.dataset.color || target.dataset.pattern || target.dataset.env
      }));
    }

    if (target.id === 'downloadBtn' || target.id === 'downloadRenderBtn' || target.id === 'downloadRenderModalBtn' || target.id === 'renderCurrentModelBtn') {
      // A successful export is reported by the export function. This only records intent.
      return track(namedEvent(type, functionalTarget, 'export', 'click'), common);
    }

    if (anchor || target.closest('.navbar, .mobile-menu, footer')) {
      return track(namedEvent(type, location, functionalTarget, 'click'), common);
    }

    track(namedEvent(type, location, functionalTarget, 'click'), common);
  }

  function formName(form) {
    if (form.action.includes('/auth/login')) return 'login';
    if (form.action.includes('/auth/register')) return 'register';
    return form.id || form.getAttribute('name') || 'form';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var type = pageType();
    track(namedEvent(type, 'page', 'view'), {
      page_type: type,
      page_location: window.location.href,
      page_referrer: document.referrer || undefined
    });

    try {
      var pendingAuth = JSON.parse(sessionStorage.getItem('analytics_pending_auth') || 'null');
      if (pendingAuth) {
        var authError = document.querySelector('.auth-error, .alert-error, [data-auth-error]');
        if (type !== 'auth') {
          track(namedEvent('auth', pendingAuth.method || 'email', pendingAuth.type, 'success'), {
            method: pendingAuth.method || 'email',
            auth_entry_path: pendingAuth.auth_entry_path,
            auth_return_path: pendingAuth.auth_return_path || DEFAULT_AUTH_RETURN_PATH,
            auth_return_mode: pendingAuth.auth_return_mode || 'default',
            auth_redirect_status: window.location.pathname === (pendingAuth.auth_return_path || DEFAULT_AUTH_RETURN_PATH)
              ? 'matched'
              : 'unexpected'
          });
          sessionStorage.removeItem('analytics_pending_auth');
        } else if (authError) {
          track(namedEvent('auth', pendingAuth.method || 'email', pendingAuth.type, 'error'), {
            auth_type: pendingAuth.type,
            method: pendingAuth.method || 'email',
            auth_entry_path: pendingAuth.auth_entry_path,
            auth_return_path: pendingAuth.auth_return_path || DEFAULT_AUTH_RETURN_PATH,
            auth_return_mode: pendingAuth.auth_return_mode || 'default',
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
      track(namedEvent(type, name, 'form', 'submit'), {
        form_name: name,
        form_id: form.id || undefined,
        form_action: form.action
      });
      if (name === 'login' || name === 'register') {
        var nextInput = form.querySelector('[name="next"]');
        savePendingAuth(authContext(name, 'email', nextInput?.value));
      }
    });

    document.querySelectorAll('input[type="file"]').forEach(function (input) {
      input.addEventListener('change', function () {
        if (input.closest('[data-analytics-managed="true"]')) return;
        if (!input.files?.length) return;
        track(namedEvent(type, input.name || input.id || 'artwork', 'file', 'upload'), {
          input_name: input.name || input.id,
          file_type: input.files[0].type || undefined,
          file_extension: input.files[0].name.split('.').pop()?.toLowerCase()
        });
      });
    });

    document.querySelectorAll('select, input[type="range"], input[type="checkbox"], input[type="radio"]').forEach(function (control) {
      control.addEventListener('change', function () {
        if (control.closest('[data-analytics-managed="true"]')) return;
        var controlName = control.id || control.name || control.classList[0] || control.type;
        track(namedEvent(type, controlName, 'change'), {
          control_name: controlName,
          control_type: control.type || control.tagName.toLowerCase(),
          selected_value: control.type === 'checkbox' || control.type === 'radio' ? String(control.checked) : cleanText(control.value)
        });
      });
    });

    document.querySelectorAll('input[type="search"], .search-input').forEach(function (control) {
      control.addEventListener('change', function () {
        if (!cleanText(control.value)) return;
        track(namedEvent(type, control.id || control.name || 'site', 'search'), { search_term: cleanText(control.value) });
      });
    });

    document.querySelectorAll('details').forEach(function (details, index) {
      details.addEventListener('toggle', function () {
        var state = details.open ? 'open' : 'close';
        var configuredName = details.dataset.analyticsEvent
          ? details.dataset.analyticsEvent.replace(/_toggle$/, '_' + state)
          : namedEvent(type, 'faq', details.dataset.analyticsItem || String(index + 1), state);
        track(configuredName, {
          item_id: details.dataset.analyticsItem || String(index + 1),
          item_name: details.dataset.analyticsItem || cleanText(details.querySelector('summary')?.textContent),
          toggle_state: details.open ? 'open' : 'closed'
        });
      });
    });
  });
})();
