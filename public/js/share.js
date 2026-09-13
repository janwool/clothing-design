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

    const mount = document.querySelector('[data-model-share-mount]');
    const footer = document.querySelector('footer.footer');
    if (!mount && !footer) return;

    const modelName = document.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || 'this 3D model';
    const container = mount || document.createElement('div');
    if (!mount) container.className = 'container';

    const panel = document.createElement('aside');
    panel.className = 'growth-share-panel model-detail-share-panel';
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
        <button type="button" class="growth-share-action growth-share-action-primary" data-share-platform="native" aria-label="Share this model">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 10.5 13.5 4M9 4h4.5v4.5M13 10v5H4V6h5"/></svg>
          <span>Share</span>
        </button>
        <a href="#" class="growth-share-action" data-share-platform="pinterest" target="_blank" rel="noopener noreferrer" aria-label="Share on Pinterest"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="M8.5 15.5c.8-2 1.2-3.2 1.7-5.6-.7-1.5.1-4 2-4 1.5 0 2.1 1.2 2.1 2.4 0 1.8-1.1 4.4-2.8 4.4-.9 0-1.5-.8-1.3-1.8M7.6 13.5c-1.3-.8-2.1-2.3-2.1-4.1 0-2.8 2.1-5 5.2-5 2.7 0 4.6 2 4.6 4.4 0 3.1-1.7 5.4-4.2 5.4"/></svg><span>Pinterest</span></a>
        <a href="#" class="growth-share-action" data-share-platform="x" target="_blank" rel="noopener noreferrer" aria-label="Share on X"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 3.5 12 13M15.5 3.5l-11 13"/></svg><span>X</span></a>
        <a href="#" class="growth-share-action" data-share-platform="linkedin" target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="2.5" width="15" height="15"/><path d="M6 8v6M6 5.8v.1M9.3 14v-3.4c0-1.5.9-2.6 2.3-2.6 1.5 0 2.4 1 2.4 2.6V14M9.3 8.3V14"/></svg><span>LinkedIn</span></a>
        <button type="button" class="growth-share-action" data-share-platform="copy" aria-label="Copy model link"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8.2 11.8 3.6-3.6M6.2 13.8l-1 1a3.2 3.2 0 0 1-4.5-4.5l3.1-3.1a3.2 3.2 0 0 1 4.5 0M13.8 6.2l1-1a3.2 3.2 0 1 1 4.5 4.5l-3.1 3.1a3.2 3.2 0 0 1-4.5 0"/></svg><span>Copy link</span></button>
      </div>
      <p class="growth-share-status" data-share-status role="status" aria-live="polite"></p>
    `;

    container.appendChild(panel);
    if (!mount) footer.before(container);
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
