(function initializeUserProjects() {
  'use strict';

  const adminProjectId = new URLSearchParams(window.location.search).get('adminProject');
  const isAdminPreview = Boolean(adminProjectId);
  function textureUrl(url) {
    const endpoint = isAdminPreview ? `/admin/projects/${encodeURIComponent(adminProjectId)}/texture` : '/api/project-texture';
    return `${endpoint}?url=${encodeURIComponent(url)}`;
  }

  function currentReturnUrl() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function goToSignIn() {
    window.location.assign(`/auth/login?next=${encodeURIComponent(currentReturnUrl())}`);
  }

  async function request(url, options) {
    if (isAdminPreview && !['GET', 'HEAD'].includes(String(options?.method || 'GET').toUpperCase())) {
      throw new Error('Administrator preview does not save changes.');
    }
    const controller = options?.signal ? null : new AbortController();
    const timeout = controller ? window.setTimeout(() => controller.abort(), 45000) : null;
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        signal: options?.signal || controller?.signal,
        headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) }
      });
      let result = {};
      try { result = await response.json(); } catch (error) { result = {}; }
      if (!response.ok) {
        const requestError = new Error(result.error || 'Request failed.');
        requestError.status = response.status;
        requestError.loginUrl = result.loginUrl;
        requestError.code = result.code;
        requestError.resource = result.resource;
        requestError.upgradeUrl = result.upgradeUrl;
        requestError.entitlements = result.entitlements;
        window.UpgradeModal?.handleLimit(result);
        throw requestError;
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The upload timed out. Please try again.');
      throw error;
    } finally {
      if (timeout) window.clearTimeout(timeout);
    }
  }

  async function uploadImage(dataUrl, name, purpose) {
    const result = await request('/api/user-images', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, name, purpose: purpose || 'artwork' })
    });
    return result.image;
  }

  async function listImages(purpose) {
    const query = purpose ? `?purpose=${encodeURIComponent(purpose)}` : '';
    const result = await request(`/api/user-images${query}`);
    return Array.isArray(result.images) ? result.images : [];
  }

  async function saveProject(project) {
    const result = await request('/api/projects', { method: 'POST', body: JSON.stringify(project) });
    return result.project;
  }

  async function loadProjectFromUrl(expectedType) {
    const projectId = adminProjectId || new URLSearchParams(window.location.search).get('project');
    if (!projectId) return null;
    const result = await request(isAdminPreview
      ? `/admin/projects/${encodeURIComponent(projectId)}/design`
      : `/api/projects/${encodeURIComponent(projectId)}`);
    if (result.project?.projectType !== expectedType) throw new Error('This project belongs to a different editor.');
    return result.project;
  }

  if (isAdminPreview) {
    const notice = document.createElement('div');
    notice.setAttribute('role', 'status');
    notice.textContent = 'Administrator preview — changes are not saved. ';
    notice.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:100000;padding:12px 18px;background:#17252a;color:white;border-radius:8px;font:14px sans-serif';
    const back = document.createElement('a');
    back.href = '/admin/projects';
    back.textContent = 'Back to projects';
    back.style.color = 'white';
    notice.appendChild(back);
    document.body.appendChild(notice);
  }

  window.UserProjects = Object.freeze({ isAdminPreview, textureUrl, goToSignIn, listImages, loadProjectFromUrl, request, saveProject, uploadImage });
}());
