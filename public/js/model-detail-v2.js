(() => {
  'use strict';

  const chooser = document.getElementById('aiTryOnChooser');
  const previewImage = document.getElementById('aiChooserPreviewImage');
  const previewLabel = document.getElementById('aiChooserPreviewLabel');
  const continueButton = document.getElementById('aiTryOnContinue');
  const legacyLaunchButton = document.getElementById('modelMockupBtn');
  const legacyModal = document.getElementById('modelMockupModal');
  const featurePreview = document.getElementById('aiFeaturePreview');
  const chooserChoices = [...document.querySelectorAll('[data-ai-choice]')];
  const sceneButtons = [...document.querySelectorAll('[data-ai-scene]')];
  let selectedChoice = chooserChoices[0] || null;
  let selectedScene = 'Clean studio';
  let returnFocus = null;

  function updatePreviewLabel() {
    if (!previewLabel || !selectedChoice) return;
    previewLabel.textContent = `${selectedChoice.dataset.label} · ${selectedScene}`;
  }

  function selectChoice(choice) {
    if (!choice) return;
    selectedChoice = choice;
    chooserChoices.forEach((button) => {
      const active = button === choice;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
    if (previewImage) {
      previewImage.classList.add('is-changing');
      window.setTimeout(() => {
        previewImage.src = choice.dataset.baseImage;
        previewImage.alt = `${choice.dataset.label} AI model preview`;
        previewImage.classList.remove('is-changing');
      }, 110);
    }
    updatePreviewLabel();
  }

  function openChooser(event) {
    if (!chooser) return;
    returnFocus = event?.currentTarget || document.activeElement;
    chooser.hidden = false;
    chooser.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ai-chooser-open');
    chooser.querySelector('[data-ai-choice]')?.focus({ preventScroll: true });
  }

  function closeChooser() {
    if (!chooser) return;
    chooser.hidden = true;
    chooser.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ai-chooser-open');
    returnFocus?.focus?.({ preventScroll: true });
  }

  function selectedTemplate() {
    if (!selectedChoice) return null;
    const data = selectedChoice.dataset;
    return {
      baseImage: data.baseImage,
      maskImage: data.maskImage,
      depthImage: data.depthImage,
      garmentType: data.garmentType,
      exportSlug: data.exportSlug,
      canvasWidth: Number(data.canvasWidth),
      canvasHeight: Number(data.canvasHeight),
      centerX: Number(data.artworkCenterX),
      centerY: Number(data.artworkCenterY),
      baseWidth: Number(data.artworkBaseWidth),
      maxHeight: Number(data.artworkMaxHeight),
      renderLeft: Number(data.renderLeft),
      renderTop: Number(data.renderTop),
      renderRight: Number(data.renderRight),
      renderBottom: Number(data.renderBottom),
      defaultScale: Number(data.defaultScale),
      defaultWarp: Number(data.defaultWarp)
    };
  }

  function configureLegacyModal(template) {
    if (!legacyModal || !template) return;
    const datasetValues = {
      baseImage: template.baseImage,
      maskImage: template.maskImage,
      depthImage: template.depthImage,
      garmentType: template.garmentType,
      exportSlug: template.exportSlug,
      canvasWidth: template.canvasWidth,
      canvasHeight: template.canvasHeight,
      artworkCenterX: template.centerX,
      artworkCenterY: template.centerY,
      artworkBaseWidth: template.baseWidth,
      artworkMaxHeight: template.maxHeight,
      renderLeft: template.renderLeft,
      renderTop: template.renderTop,
      renderRight: template.renderRight,
      renderBottom: template.renderBottom,
      defaultScale: template.defaultScale,
      defaultWarp: template.defaultWarp
    };
    Object.entries(datasetValues).forEach(([key, value]) => {
      legacyModal.dataset[key] = String(value ?? '');
    });
    const canvas = document.getElementById('modelMockupCanvas');
    if (canvas) {
      canvas.width = template.canvasWidth;
      canvas.height = template.canvasHeight;
    }
    const title = document.getElementById('modelMockupTitle');
    if (title) title.textContent = `${selectedChoice.dataset.label} try-on`;
  }

  async function continueToStudio() {
    const template = selectedTemplate();
    if (!template || !legacyLaunchButton) return;
    configureLegacyModal(template);
    continueButton.disabled = true;
    continueButton.setAttribute('aria-busy', 'true');
    closeChooser();
    try {
      if (window.ModelMockupStudio?.setTemplate) {
        await window.ModelMockupStudio.setTemplate(template);
        window.ModelMockupStudio.open();
      } else {
        legacyLaunchButton.click();
      }
      window.trackEvent?.('begin_design', {
        design_entry: 'ai_model_chooser',
        item_id: template.exportSlug
      });
    } finally {
      continueButton.disabled = false;
      continueButton.removeAttribute('aria-busy');
    }
  }

  document.querySelectorAll('[data-ai-tryon-open]').forEach((button) => button.addEventListener('click', openChooser));
  document.querySelectorAll('[data-ai-tryon-close]').forEach((button) => button.addEventListener('click', closeChooser));
  chooserChoices.forEach((button) => button.addEventListener('click', () => selectChoice(button)));
  sceneButtons.forEach((button) => button.addEventListener('click', () => {
    selectedScene = button.dataset.aiScene;
    sceneButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-checked', String(active));
    });
    updatePreviewLabel();
  }));
  continueButton?.addEventListener('click', continueToStudio);

  document.querySelectorAll('[data-feature-model]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.modelIndex);
    const choice = chooserChoices[index];
    if (!choice) return;
    selectChoice(choice);
    document.querySelectorAll('[data-feature-model]').forEach((item) => item.classList.toggle('active', Number(item.dataset.modelIndex) === index));
    if (featurePreview) featurePreview.src = choice.dataset.baseImage;
  }));

  document.addEventListener('keydown', (event) => {
    if (!chooser || chooser.hidden || event.key !== 'Escape') return;
    event.preventDefault();
    closeChooser();
  });
})();
