(function initializeUserProjects() {
  'use strict';

  function currentReturnUrl() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function goToSignIn() {
    window.location.assign(`/auth/login?next=${encodeURIComponent(currentReturnUrl())}`);
  }

  async function request(url, options) {
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
    const projectId = new URLSearchParams(window.location.search).get('project');
    if (!projectId) return null;
    const result = await request(`/api/projects/${encodeURIComponent(projectId)}`);
    if (result.project?.projectType !== expectedType) throw new Error('This project belongs to a different editor.');
    return result.project;
  }

  window.UserProjects = Object.freeze({ goToSignIn, listImages, loadProjectFromUrl, request, saveProject, uploadImage });
}());
