(function () {
  'use strict';

  function campaignUrl(platform, surface) {
    const canonical = document.querySelector('link[rel="canonical"]')?.href || window.location.href;
    const url = new URL(canonical, window.location.origin);
    url.searchParams.set('utm_source', platform);
    url.searchParams.set('utm_medium', 'organic-social');
    url.searchParams.set('utm_campaign', 'content-share');
    url.searchParams.set('utm_content', surface || 'page');
    return url.href;
  }

  function shareDestination(platform, url, title, image) {
    if (platform === 'pinterest') {
      const params = new URLSearchParams({ url, description: title });
      if (image) params.set('media', image);
      return `https://www.pinterest.com/pin/create/button/?${params}`;
    }
    if (platform === 'x') {
      return `https://twitter.com/intent/tweet?${new URLSearchParams({ url, text: title })}`;
    }
    if (platform === 'linkedin') {
      return `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url })}`;
    }
    return url;
  }

  function report(platform, surface, result) {
    if (typeof window.trackEvent !== 'function') return;
    window.trackEvent('share', {
      method: platform,
      content_type: surface,
      item_id: window.location.pathname,
      share_result: result || 'opened'
    });
  }

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Copy unavailable');
  }

  function mountModelSharePanel() {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const isModelDetail = pathParts[0] === '3d-models' && pathParts.length >= 2 && pathParts.length <= 3;
    if (!isModelDetail || document.querySelector('[data-growth-share]')) return;

    const footer = document.querySelector('footer.footer');
    if (!footer) return;

    const modelName = document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || 'this 3D model';
    const container = document.createElement('div');
    container.className = 'container';

    const panel = document.createElement('aside');
    panel.className = 'growth-share-panel';
    panel.dataset.growthShare = '';
    panel.dataset.shareSurface = 'model-detail';
    panel.dataset.shareTitle = modelName;
    panel.setAttribute('aria-label', `Share ${modelName}`);
    panel.innerHTML = `
      <div class="growth-share-copy">
        <span>Share this 3D model</span>
        <strong>Useful work should travel.</strong>
        <p>Know a designer who needs this editable garment? Send them the model.</p>
      </div>
      <div class="growth-share-actions" aria-label="Share options">
        <button type="button" class="growth-share-action growth-share-action-primary" data-share-platform="native">
          <span aria-hidden="true">↗</span> Share
        </button>
        <a href="#" class="growth-share-action" data-share-platform="pinterest" target="_blank" rel="noopener noreferrer">Pinterest</a>
        <a href="#" class="growth-share-action" data-share-platform="x" target="_blank" rel="noopener noreferrer">X</a>
        <a href="#" class="growth-share-action" data-share-platform="linkedin" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        <button type="button" class="growth-share-action" data-share-platform="copy">Copy link</button>
      </div>
      <p class="growth-share-status" data-share-status role="status" aria-live="polite"></p>
    `;

    container.appendChild(panel);
    footer.before(container);
  }

  document.addEventListener('DOMContentLoaded', function () {
    mountModelSharePanel();

    document.querySelectorAll('[data-growth-share]').forEach(function (panel) {
      const surface = panel.dataset.shareSurface || 'page';
      const title = panel.dataset.shareTitle || document.title;
      const image = document.querySelector('meta[property="og:image"]')?.content || '';
      const status = panel.querySelector('[data-share-status]');

      panel.querySelectorAll('a[data-share-platform]').forEach(function (link) {
        const platform = link.dataset.sharePlatform;
        link.href = shareDestination(platform, campaignUrl(platform, surface), title, image);
        link.addEventListener('click', function () {
          report(platform, surface);
        });
      });

      panel.querySelector('[data-share-platform="native"]')?.addEventListener('click', async function () {
        const url = campaignUrl('native-share', surface);
        if (!navigator.share) {
          try {
            await copyText(url);
            status.textContent = 'Link copied — ready to send.';
            report('native-share', surface, 'copied');
          } catch (_) {
            status.textContent = 'Copy failed. Use the copy-link button.';
            report('native-share', surface, 'failed');
          }
          return;
        }
        try {
          await navigator.share({ title, text: title, url });
          status.textContent = 'Shared.';
          report('native-share', surface, 'shared');
        } catch (error) {
          if (error?.name !== 'AbortError') report('native-share', surface, 'failed');
        }
      });

      panel.querySelector('[data-share-platform="copy"]')?.addEventListener('click', async function () {
        try {
          await copyText(campaignUrl('copy-link', surface));
          status.textContent = 'Tracked link copied.';
          report('copy-link', surface, 'copied');
        } catch (_) {
          status.textContent = 'Could not copy. Please copy the address bar URL.';
          report('copy-link', surface, 'failed');
        }
      });
    });
  });
})();
