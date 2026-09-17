(function cameraRelativeStudioLightModule(globalScope) {
  'use strict';

  const installations = new WeakMap();
  const degreesToRadians = Math.PI / 180;

  function modelSceneFor(element) {
    if (!element) return null;
    const sceneSymbol = Object.getOwnPropertySymbols(element)
      .find((symbol) => symbol.description === 'scene');
    return sceneSymbol ? element[sceneSymbol] : null;
  }

  function rotationForCamera(theta, referenceAzimuthDeg = -16, azimuthOffsetDeg = 0) {
    const referenceTheta = Number(referenceAzimuthDeg) * degreesToRadians;
    const offset = Number(azimuthOffsetDeg) * degreesToRadians;
    return referenceTheta - Number(theta) + offset;
  }

  function currentEnvironmentMatches(element, expectedEnvironment) {
    if (!expectedEnvironment) return true;
    if (typeof element.environmentImage === 'string') {
      return element.environmentImage === expectedEnvironment;
    }
    const attributeValue = element.getAttribute?.('environment-image');
    return attributeValue === expectedEnvironment;
  }

  function sync(element, options = {}) {
    const scene = modelSceneFor(element);
    if (!scene?.environmentRotation?.set) return false;

    const expectedEnvironment = options.environmentImage
      || element.dataset?.cameraRelativeStudioLight
      || '';
    const isStudioEnvironment = currentEnvironmentMatches(element, expectedEnvironment);
    const orbit = element.getCameraOrbit?.();
    const referenceAzimuthDeg = options.referenceAzimuthDeg
      ?? Number(element.dataset?.studioLightReferenceAzimuth || -16);
    const azimuthOffsetDeg = options.azimuthOffsetDeg
      ?? Number(element.dataset?.studioLightAzimuthOffset || 0);
    const rotation = isStudioEnvironment && Number.isFinite(orbit?.theta)
      ? rotationForCamera(orbit.theta, referenceAzimuthDeg, azimuthOffsetDeg)
      : 0;

    scene.environmentRotation.set(0, rotation, 0);
    if (scene.backgroundRotation?.set) scene.backgroundRotation.set(0, rotation, 0);
    scene.queueRender?.();
    if (element.dataset) {
      element.dataset.cameraRelativeLightReady = 'true';
      element.dataset.studioLightRotationY = rotation.toFixed(6);
    }
    return true;
  }

  function install(element, options = {}) {
    if (!element) return () => {};
    const existing = installations.get(element);
    if (existing) {
      existing.options = { ...existing.options, ...options };
      existing.schedule();
      return existing.cleanup;
    }

    const state = {
      frame: 0,
      options: { ...options },
      schedule: null,
      cleanup: null
    };
    const requestFrame = globalScope?.requestAnimationFrame
      ? globalScope.requestAnimationFrame.bind(globalScope)
      : (callback) => setTimeout(callback, 0);
    const cancelFrame = globalScope?.cancelAnimationFrame
      ? globalScope.cancelAnimationFrame.bind(globalScope)
      : clearTimeout;

    state.schedule = () => {
      if (state.frame) return;
      state.frame = requestFrame(() => {
        state.frame = 0;
        sync(element, state.options);
      });
    };
    state.cleanup = () => {
      if (state.frame) cancelFrame(state.frame);
      ['camera-change', 'environment-change', 'load'].forEach((eventName) => {
        element.removeEventListener?.(eventName, state.schedule);
      });
      installations.delete(element);
    };

    ['camera-change', 'environment-change', 'load'].forEach((eventName) => {
      element.addEventListener?.(eventName, state.schedule, { passive: true });
    });
    installations.set(element, state);
    state.schedule();
    globalScope?.customElements?.whenDefined?.('model-viewer').then(state.schedule);
    return state.cleanup;
  }

  function installAll(root = globalScope?.document) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('[data-camera-relative-studio-light]').forEach((element) => install(element));
  }

  const api = { install, installAll, rotationForCamera, sync };
  if (globalScope) globalScope.CameraRelativeStudioLight = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (globalScope?.document) {
    if (globalScope.document.readyState === 'loading') {
      globalScope.document.addEventListener('DOMContentLoaded', () => installAll(), { once: true });
    } else {
      installAll();
    }

    if (globalScope.MutationObserver) {
      new globalScope.MutationObserver((records) => {
        records.forEach((record) => record.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('[data-camera-relative-studio-light]')) install(node);
          installAll(node);
        }));
      }).observe(globalScope.document.documentElement, { childList: true, subtree: true });
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
