(function initializeClozColorPicker() {
  'use strict';

  const RECENT_KEY = 'clozdesign-recent-solid-colors';
  let popover = null;
  let active = null;
  let color = '#ffffff';
  let hsv = { h: 0, s: 0, v: 1 };
  let recent = [];
  let mode = 'solid';
  let angle = 90;
  let stops = [];
  let activeStopId = 1;
  let nextStopId = 3;

  function normalizeHex(value) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(value || '').trim());
    return match ? `#${match[1].toLowerCase()}` : null;
  }

  function parsePaint(value) {
    const solid = normalizeHex(value);
    if (solid) return { mode: 'solid', color: solid, angle: 90, stops: [] };
    const match = /^linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,\s*(.+)\)$/i.exec(String(value || '').trim());
    if (match) {
      const parsedStops = match[2].split(/,\s*(?=#)/).map((part, index) => {
        const stop = /^(#[0-9a-f]{6})\s+(\d+(?:\.\d+)?)%$/i.exec(part.trim());
        return stop ? { id: index + 1, color: normalizeHex(stop[1]), position: Math.max(0, Math.min(100, Number(stop[2]))) } : null;
      });
      if (Number.isFinite(Number(match[1])) && parsedStops.length >= 2 && parsedStops.length <= 12 && parsedStops.every(Boolean)) {
        return {
          mode: 'gradient',
          color: parsedStops[0].color,
          angle: ((Number(match[1]) % 360) + 360) % 360,
          stops: parsedStops.sort((left, right) => left.position - right.position)
        };
      }
    }
    return { mode: 'solid', color: '#ffffff', angle: 90, stops: [] };
  }

  function gradientCss(gradientStops, gradientAngle) {
    const normalizedAngle = ((Math.round(gradientAngle) % 360) + 360) % 360;
    return `linear-gradient(${normalizedAngle}deg, ${[...gradientStops]
      .sort((left, right) => left.position - right.position)
      .map(stop => `${stop.color} ${Math.round(stop.position * 100) / 100}%`).join(', ')})`;
  }

  function paintValue() {
    return mode === 'gradient' ? gradientCss(stops, angle) : color;
  }

  function canvasFillStyle(context, value, bounds) {
    const paint = parsePaint(value);
    if (paint.mode === 'solid') return paint.color;
    const { x, y, width, height } = bounds;
    const radians = paint.angle * Math.PI / 180;
    const dx = Math.sin(radians) * width / 2;
    const dy = -Math.cos(radians) * height / 2;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const gradient = context.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    paint.stops.forEach(stop => gradient.addColorStop(stop.position / 100, stop.color));
    return gradient;
  }

  function rgbToHsv(hex) {
    const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
    const max = Math.max(...rgb);
    const min = Math.min(...rgb);
    const difference = max - min;
    let h = 0;
    if (difference) {
      if (max === rgb[0]) h = ((rgb[1] - rgb[2]) / difference) % 6;
      else if (max === rgb[1]) h = (rgb[2] - rgb[0]) / difference + 2;
      else h = (rgb[0] - rgb[1]) / difference + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h, s: max ? difference / max : 0, v: max };
  }

  function hsvToHex(h, s, v) {
    const chroma = v * s;
    const segment = h / 60;
    const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
    const rgb = segment < 1 ? [chroma, secondary, 0]
      : segment < 2 ? [secondary, chroma, 0]
        : segment < 3 ? [0, chroma, secondary]
          : segment < 4 ? [0, secondary, chroma]
            : segment < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
    const offset = v - chroma;
    return `#${rgb.map(channel => Math.round((channel + offset) * 255).toString(16).padStart(2, '0')).join('')}`;
  }

  function readRecent() {
    try {
      const value = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(value) ? value.map(normalizeHex).filter(Boolean).slice(0, 7) : [];
    } catch (error) {
      return [];
    }
  }

  function rememberColor(value) {
    recent = [value, ...recent.filter(item => item !== value)].slice(0, 7);
    try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (error) { /* Storage can be unavailable. */ }
    renderRecent();
  }

  function renderRecent() {
    if (!popover) return;
    const section = popover.querySelector('.recent-colors');
    const list = section.querySelector('[data-recent-colors]');
    section.hidden = !recent.length;
    list.replaceChildren();
    recent.forEach(value => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.recentColor = value;
      button.style.setProperty('--recent-color', value);
      button.setAttribute('aria-label', `Use ${value}`);
      button.classList.toggle('active', value === color);
      list.append(button);
    });
  }

  function emit(commit = false) {
    const value = paintValue();
    active?.onChange?.(value);
    if (commit) {
      rememberColor(color);
      active?.onCommit?.(value);
    }
  }

  function renderGradient() {
    if (!popover) return;
    popover.querySelectorAll('[data-mode]').forEach(button => {
      const selected = button.dataset.mode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const editor = popover.querySelector('[data-gradient-editor]');
    editor.hidden = mode !== 'gradient';
    if (mode !== 'gradient') return;
    const track = popover.querySelector('[data-gradient-track]');
    track.style.background = gradientCss(stops, 90);
    const layer = popover.querySelector('[data-gradient-stop-layer]');
    layer.replaceChildren();
    stops.forEach(stop => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `gradient-stop-handle${stop.id === activeStopId ? ' active' : ''}`;
      button.dataset.stopId = String(stop.id);
      button.style.setProperty('--stop-position', `${stop.position}%`);
      button.style.setProperty('--stop-color', stop.color);
      button.setAttribute('aria-label', `Select color stop at ${Math.round(stop.position)} percent`);
      button.setAttribute('aria-pressed', String(stop.id === activeStopId));
      button.innerHTML = '<span aria-hidden="true"></span>';
      layer.append(button);
    });
    popover.querySelector('[data-gradient-angle]').value = String(Math.round(angle));
    popover.querySelector('[data-add-stop]').disabled = stops.length >= 12;
    popover.querySelector('[data-remove-stop]').disabled = stops.length <= 2;
  }

  function render() {
    if (!popover) return;
    renderGradient();
    popover.querySelector('[data-color-area]').style.background =
      `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(hsv.h, 1, 1)})`;
    const areaCursor = popover.querySelector('.color-area-cursor');
    areaCursor.style.left = `${hsv.s * 100}%`;
    areaCursor.style.top = `${(1 - hsv.v) * 100}%`;
    const area = popover.querySelector('[data-color-area]');
    area.setAttribute('aria-valuenow', String(Math.round(hsv.v * 100)));
    area.setAttribute('aria-valuetext', `Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`);
    const hue = popover.querySelector('[data-hue-field]');
    hue.querySelector('.hue-field-cursor').style.top = `${hsv.h / 360 * 100}%`;
    hue.setAttribute('aria-valuenow', String(Math.round(hsv.h)));
    popover.querySelector('[data-color-hex]').value = color.toUpperCase();
    renderRecent();
  }

  function setColor(value, commit = false) {
    const normalized = normalizeHex(value);
    if (!normalized) return false;
    color = normalized;
    hsv = rgbToHsv(color);
    if (mode === 'gradient') {
      const stop = stops.find(item => item.id === activeStopId);
      if (stop) stop.color = color;
    }
    render();
    emit(commit);
    return true;
  }

  function position() {
    if (!popover || !active) return;
    const rect = active.anchor.getBoundingClientRect();
    const width = popover.offsetWidth || 284;
    const height = popover.offsetHeight || 290;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const below = rect.bottom + 10;
    const top = below + height <= window.innerHeight - 12
      ? below : Math.max(12, rect.top - height - 10);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function close() {
    if (!active) return;
    active.anchor.setAttribute('aria-expanded', 'false');
    popover?.remove();
    popover = null;
    active = null;
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
  }

  function onOutsidePointer(event) {
    if (!popover?.contains(event.target) && !active?.anchor.contains(event.target)) close();
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    const anchor = active?.anchor;
    close();
    anchor?.focus();
  }

  function handleDrag(field, event, update) {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    event.preventDefault();
    field.setPointerCapture(event.pointerId);
    const move = pointer => {
      const rect = field.getBoundingClientRect();
      update(Math.max(0, Math.min(1, (pointer.clientX - rect.left) / rect.width)),
        Math.max(0, Math.min(1, (pointer.clientY - rect.top) / rect.height)));
      color = hsvToHex(hsv.h, hsv.s, hsv.v);
      if (mode === 'gradient') {
        const stop = stops.find(item => item.id === activeStopId);
        if (stop) stop.color = color;
      }
      render();
      emit();
    };
    const finish = pointer => {
      field.removeEventListener('pointermove', move);
      field.removeEventListener('pointerup', finish);
      field.removeEventListener('pointercancel', finish);
      if (pointer.type === 'pointerup') emit(true);
    };
    field.addEventListener('pointermove', move);
    field.addEventListener('pointerup', finish);
    field.addEventListener('pointercancel', finish);
    move(event);
  }

  function open(options) {
    if (!options?.anchor) return;
    if (active?.anchor === options.anchor) { close(); return; }
    close();
    active = options;
    const initial = parsePaint(options.value);
    mode = initial.mode;
    angle = initial.angle;
    stops = initial.stops;
    activeStopId = stops[0]?.id || 1;
    nextStopId = Math.max(2, ...stops.map(stop => stop.id)) + 1;
    color = initial.color;
    hsv = rgbToHsv(color);
    recent = readRecent();
    popover = document.createElement('div');
    popover.className = 'color-popover cloz-color-picker visible';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', options.label || 'Choose a color');
    popover.innerHTML = `
      <div class="cloz-color-picker-heading"><strong>Color</strong><button type="button" data-close aria-label="Close color picker">×</button></div>
      <div class="color-mode" role="group" aria-label="Color type"><button type="button" data-mode="solid">Solid</button><button type="button" data-mode="gradient">Gradient</button></div>
      <div class="gradient-editor" data-gradient-editor hidden>
        <div class="gradient-stop-track" data-gradient-track role="group" aria-label="Gradient color stops"><div class="gradient-stop-layer" data-gradient-stop-layer></div></div>
        <div class="cloz-gradient-actions"><button type="button" data-add-stop>Add stop</button><button type="button" data-reverse>Reverse</button><button type="button" data-remove-stop>Remove</button></div>
        <label class="gradient-angle-field"><span>Angle</span><input type="number" data-gradient-angle min="0" max="359" aria-label="Gradient angle"><i>°</i></label>
      </div>
      <div class="color-spectrum">
        <div class="color-area" data-color-area role="slider" tabindex="0" aria-label="Saturation and brightness" aria-valuemin="0" aria-valuemax="100"><span class="color-area-cursor"></span></div>
        <div class="hue-field" data-hue-field role="slider" tabindex="0" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><span class="hue-field-cursor"></span></div>
      </div>
      <div class="color-value-row">
        <label class="color-field"><span>HEX</span><input data-color-hex maxlength="7" spellcheck="false" aria-label="Hex color"></label>
        <button class="eyedropper-button" type="button" data-eyedropper aria-label="Pick a color from the screen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m19 3 2 2-3.5 3.5-2-2L19 3ZM14.5 7.5l2 2-8.8 8.8-3.8.8.8-3.8 8.8-8.8Z"/></svg></button>
      </div>
      <div class="recent-colors" hidden><span>Recent</span><div data-recent-colors role="group" aria-label="Recent colors"></div></div>
    `;
    if (!('EyeDropper' in window)) popover.querySelector('[data-eyedropper]').hidden = true;
    document.body.append(popover);
    options.anchor.setAttribute('aria-expanded', 'true');
    render();
    position();
    popover.querySelector('[data-close]').addEventListener('click', close);
    popover.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.mode === mode) return;
      mode = button.dataset.mode;
      if (mode === 'gradient' && stops.length < 2) {
        stops = [{ id: 1, color, position: 0 }, { id: 2, color: '#ffffff', position: 100 }];
        activeStopId = 1;
        nextStopId = 3;
      }
      render();
      position();
      emit(true);
    }));
    const track = popover.querySelector('[data-gradient-track]');
    track.addEventListener('pointerdown', event => {
      if (event.button !== 0 && event.pointerType !== 'touch') return;
      event.preventDefault();
      const stopButton = event.target.closest('[data-stop-id]');
      const rect = track.getBoundingClientRect();
      const position = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
      if (stopButton) activeStopId = Number(stopButton.dataset.stopId);
      else if (stops.length < 12) {
        activeStopId = nextStopId++;
        stops.push({ id: activeStopId, color, position });
      } else return;
      const selected = stops.find(stop => stop.id === activeStopId);
      color = selected.color;
      hsv = rgbToHsv(color);
      track.setPointerCapture(event.pointerId);
      const move = pointer => {
        selected.position = Math.max(0, Math.min(100, (pointer.clientX - rect.left) / rect.width * 100));
        render();
        emit();
      };
      const finish = pointer => {
        track.removeEventListener('pointermove', move);
        track.removeEventListener('pointerup', finish);
        track.removeEventListener('pointercancel', finish);
        if (pointer.type === 'pointerup') emit(true);
      };
      track.addEventListener('pointermove', move);
      track.addEventListener('pointerup', finish);
      track.addEventListener('pointercancel', finish);
      if (stopButton) render();
      else move(event);
    });
    popover.querySelector('[data-add-stop]').addEventListener('click', () => {
      if (stops.length >= 12) return;
      const selected = stops.find(stop => stop.id === activeStopId) || stops[0];
      activeStopId = nextStopId++;
      stops.push({ id: activeStopId, color, position: Math.min(100, selected.position + 10) });
      render();
      emit(true);
    });
    popover.querySelector('[data-reverse]').addEventListener('click', () => {
      stops.forEach(stop => { stop.position = 100 - stop.position; });
      render();
      emit(true);
    });
    popover.querySelector('[data-remove-stop]').addEventListener('click', () => {
      if (stops.length <= 2) return;
      stops = stops.filter(stop => stop.id !== activeStopId);
      activeStopId = stops[0].id;
      color = stops[0].color;
      hsv = rgbToHsv(color);
      render();
      emit(true);
    });
    const angleField = popover.querySelector('[data-gradient-angle]');
    angleField.addEventListener('input', () => {
      if (angleField.value === '') return;
      const nextAngle = Number(angleField.value);
      if (!Number.isFinite(nextAngle)) return;
      angle = ((nextAngle % 360) + 360) % 360;
      emit();
    });
    angleField.addEventListener('change', () => { render(); emit(true); });
    popover.querySelector('[data-color-area]').addEventListener('pointerdown', event => {
      handleDrag(event.currentTarget, event, (x, y) => { hsv.s = x; hsv.v = 1 - y; });
    });
    popover.querySelector('[data-hue-field]').addEventListener('pointerdown', event => {
      handleDrag(event.currentTarget, event, (x, y) => { hsv.h = Math.min(359.99, y * 360); });
    });
    popover.querySelectorAll('[role="slider"]').forEach(slider => slider.addEventListener('keydown', event => {
      const direction = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1
        : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      const step = event.shiftKey ? 0.1 : 0.02;
      if (slider.dataset.hueField !== undefined) hsv.h = (hsv.h + direction * (event.shiftKey ? 15 : 2) + 360) % 360;
      else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) hsv.s = Math.max(0, Math.min(1, hsv.s + direction * step));
      else hsv.v = Math.max(0, Math.min(1, hsv.v + direction * step));
      setColor(hsvToHex(hsv.h, hsv.s, hsv.v), true);
    }));
    const hexField = popover.querySelector('[data-color-hex]');
    hexField.addEventListener('change', () => { if (!setColor(hexField.value, true)) hexField.value = color.toUpperCase(); });
    hexField.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); hexField.blur(); } });
    popover.querySelector('[data-recent-colors]').addEventListener('click', event => {
      const button = event.target.closest('[data-recent-color]');
      if (button) setColor(button.dataset.recentColor, true);
    });
    popover.querySelector('[data-eyedropper]').addEventListener('click', async () => {
      try {
        const result = await new window.EyeDropper().open();
        if (active) setColor(result.sRGBHex, true);
      } catch (error) { /* The user can cancel the eyedropper. */ }
    });
    document.addEventListener('pointerdown', onOutsidePointer, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
  }

  window.ClozColorPicker = Object.freeze({ open, close, parsePaint, canvasFillStyle });
}());
