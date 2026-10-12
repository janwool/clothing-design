(() => {
  const panel = document.querySelector('[data-ai-design]');
  if (!panel) return;
  const form = panel.querySelector('form');
  const prompt = form.elements.prompt;
  const button = form.querySelector('[type="submit"]');
  const idleStatus = panel.querySelector('[data-design-status]');
  const history = panel.querySelector('[data-design-history]');
  const scrollConversation = () => { history.scrollTop = history.scrollHeight; };
  const access = panel.querySelector('[data-design-access]');
  let busy = false;
  let reading = false;
  const references = [];
  const draftKey = `clozdesign_ai_design_draft:${location.pathname}`;
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    if (draft && Date.now() - draft.createdAt < 30 * 60 * 1000 && typeof draft.prompt === 'string') prompt.value = draft.prompt.slice(0,1000);
    sessionStorage.removeItem(draftKey);
  } catch (_) {}
  function openDesignLogin() {
    try { sessionStorage.setItem(draftKey, JSON.stringify({prompt:prompt.value,createdAt:Date.now()})); } catch (_) {}
    idleStatus.textContent = '';
    access.hidden = true;
    if (window.ModelLoginModal?.open) window.ModelLoginModal.open({intent:'ai-design'});
    else location.assign(`/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }
  const fileInput = panel.querySelector('[data-design-reference]');
  const add = panel.querySelector('[data-reference-add]');
  const grid = panel.querySelector('[data-reference-grid]');
  const referenceError = panel.querySelector('[data-reference-error]');
  function updateAttachments() {
    grid.replaceChildren();
    grid.hidden = references.length === 0;
    panel.querySelector('[data-reference-count]').textContent = `${references.length}/4 images`;
    references.forEach((reference, index) => {
      const item = document.createElement('div');
      item.className = 'ai-reference-item';
      const image = document.createElement('img');
      image.src = reference.data;
      image.alt = `Reference ${index + 1}: ${reference.name}`;
      image.title = reference.name;
      const number = document.createElement('span');
      number.textContent = index + 1;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove reference ${index + 1}`);
      remove.disabled = busy || reading;
      remove.addEventListener('click', () => {
        if (busy || reading) return;
        references.splice(index, 1);
        referenceError.textContent = '';
        updateAttachments();
        add.focus();
      });
      item.append(image, number, remove);
      grid.append(item);
    });
    add.disabled = busy || reading || references.length === 4;
    fileInput.disabled = busy || reading || references.length === 4;
    button.disabled = busy || reading;
  }
  async function readReference(file) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose PNG, JPG or WebP images.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Each reference image must be 5 MB or smaller.');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read this image. Please choose it again.'));
      reader.readAsDataURL(file);
    });
    const image = new Image();
    image.src = data;
    try { await image.decode(); } catch { throw new Error('This image could not be opened. Choose another file.'); }
    if (file.size <= 1024 * 1024 && Math.max(image.width, image.height) <= 1600) return { name: file.name, data };
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { name: file.name, data: canvas.toDataURL('image/jpeg', .85) };
  }
  add.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    if (busy || reading || !files.length) return;
    if (references.length + files.length > 4) {
      referenceError.textContent = 'Attach up to 4 images. Remove an image to add another.';
      return;
    }
    reading = true;
    referenceError.textContent = 'Preparing reference images…';
    updateAttachments();
    try {
      const selected = [];
      for (const file of files) selected.push(await readReference(file));
      references.push(...selected);
      referenceError.textContent = '';
    } catch (error) { referenceError.textContent = error.message; }
    finally { reading = false; updateAttachments(); }
  });
  prompt.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (!busy && !reading) form.requestSubmit();
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || reading || !prompt.value.trim() || !form.reportValidity()) return;
    if (panel.dataset.authenticated !== 'true') {
      openDesignLogin();
      return;
    }
    const designBrief = prompt.value.trim();
    const submittedReferences = references.map(reference => ({ ...reference }));
    const referenceImages = submittedReferences.map(reference => reference.data);
    const userMessage = document.createElement('div');
    userMessage.className = 'ai-chat-message ai-chat-user';
    userMessage.textContent = designBrief;
    if (submittedReferences.length) {
      const images = document.createElement('div');
      images.className = 'ai-chat-refs';
      submittedReferences.forEach((reference, index) => {
        const image = document.createElement('img');
        image.src = reference.data;
        image.alt = `Reference ${index + 1}: ${reference.name}`;
        images.append(image);
      });
      userMessage.append(images);
    }
    const reply = document.createElement('div');
    reply.className = 'ai-chat-message ai-chat-assistant';
    const status = document.createElement('p');
    status.className = 'ai-design-status';
    reply.append(status);
    history.append(userMessage, reply);
    idleStatus.textContent = '';
    scrollConversation();
    busy = true;
    prompt.disabled = true;
    updateAttachments();
    button.disabled = true;
    button.textContent = '…';
    button.setAttribute('aria-label', 'Generating design');
    panel.setAttribute('aria-busy', 'true');
    access.hidden = true;
    status.textContent = 'Preparing…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 420000);
    try {
      const viewer = document.querySelector('#model3dViewer model-viewer');
      if (!viewer?.loaded) throw new Error('Your garment preview is still loading. Try again once it is ready.');
      await window.ensureModelDesignerRuntime?.();
      if (!window.ModelDesignerExport?.prepareAiDesign) throw new Error('Design is temporarily unavailable. Please reload.');
      const garmentContext = await window.ModelDesignerExport.prepareAiDesign();
      const image = window.ModelDesignerExport?.capture
        ? await window.ModelDesignerExport.capture(viewer)
        : await new Promise(async (resolve, reject) => {
          try {
            const blob = await viewer.toBlob({ mimeType: 'image/png', idealAspect: false });
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Could not prepare the garment preview.'));
            reader.readAsDataURL(blob);
          } catch (error) { reject(error); }
        });
      status.textContent = 'Generating…';
      const response = await fetch('/api/ai-render-export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ mode: 'design', target: 'texture', ...garmentContext, prompt: designBrief, referenceImages, image, modelSlug: panel.dataset.modelSlug })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        if (response.status === 401) {
          panel.dataset.authenticated = 'false';
          userMessage.remove();
          reply.remove();
          openDesignLogin();
          return;
        }
        if (response.status === 401 || (response.status === 403 && ['EXPORT_UPGRADE_REQUIRED', 'INSUFFICIENT_CREDITS'].includes(data.code))) {
          access.href = response.status === 401 ? `/auth/login?next=${encodeURIComponent(location.pathname)}` : '/pricing';
          access.textContent = response.status === 401 ? 'Sign in to continue' : 'View plans';
          access.hidden = false;
          access.onclick = null;
          if (data.code === 'INSUFFICIENT_CREDITS' && window.UpgradeModal?.open) {
            const openUpgrade = () => window.UpgradeModal.open({ resource: 'designCredits' });
            access.onclick = event => { event.preventDefault(); openUpgrade(); };
            openUpgrade();
          }
        }
        throw new Error(response.status === 401 ? 'Sign in to generate a design concept.' : data.error || 'Could not generate this design. Please try again.');
      }
      const resultImage = document.createElement('img');
      resultImage.alt = 'Generated design concept';
      status.textContent = 'Applying…';
      resultImage.src = await window.ModelDesignerExport.applyAiDesign(data.image.textureUrl || data.image.url);
      resultImage.onload = scrollConversation;
      resultImage.onerror = () => { status.textContent = 'Preview unavailable. Download your image below.'; };
      const download = document.createElement('a');
      download.className = 'ai-chat-download';
      download.textContent = 'Download design ↓';
      download.href = data.image.downloadUrl;
      reply.prepend(resultImage);
      reply.append(download);
      status.textContent = 'Design applied.';
      prompt.value = '';
      references.length = 0;
      scrollConversation();
      button.setAttribute('title', 'Generate another design');
    } catch (error) {
      status.textContent = error.name === 'AbortError' ? 'Generation took too long. Check your image library before trying again.' : error.message;
      if (access.hidden) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'ai-chat-retry';
        retry.textContent = 'Retry';
        retry.addEventListener('click', () => {
          if (busy || reading) return;
          prompt.value = designBrief;
          references.splice(0, references.length, ...submittedReferences);
          updateAttachments();
          userMessage.remove();
          reply.remove();
          form.requestSubmit();
        });
        reply.append(retry);
      }
      scrollConversation();
      button.setAttribute('title', 'Try again');
    } finally {
      clearTimeout(timeout);
      busy = false;
      prompt.disabled = false;
      button.textContent = '↑';
      button.setAttribute('aria-label', 'Generate design');
      updateAttachments();
      panel.removeAttribute('aria-busy');
    }
  });
})();
