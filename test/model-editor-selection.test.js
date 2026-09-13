const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtime = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'model-designer.js'),
  'utf8'
);
const styles = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'css', 'style.css'),
  'utf8'
);
const view = fs.readFileSync(
  path.join(__dirname, '..', 'views', 'model-detail.ejs'),
  'utf8'
);

test('recognizes two stationary pointer releases without stealing a quick follow-up drag', () => {
  assert.doesNotMatch(runtime, /isTextDoubleClick|lastTextClick/);
  assert.match(runtime, /textureSvg\.addEventListener\('dblclick'/);
  assert.match(runtime, /mode === 'move' && !active\.moved && state\.selected\?\.dataset\.type === 'text'/);
  assert.match(runtime, /Math\.hypot\([\s\S]*?\) > 4/);
  assert.match(runtime, /now - previous\.time <= 500/);
  assert.match(runtime, /if \(shouldEditText\) requestAnimationFrame\(\(\) => editTextElement\(clickedText\)\)/);
  assert.match(runtime, /state\.active = \{\s*mode: 'move'/);
});

test('treats text as a movable object until edit mode is active', () => {
  const textBoxStyles = styles.match(/\.texture-text-box \{[\s\S]*?\n\}/)?.[0] || '';
  const editingStyles = styles.match(/\.texture-text-box\.is-editing \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(textBoxStyles, /cursor: move/);
  assert.match(textBoxStyles, /user-select: none/);
  assert.match(editingStyles, /cursor: text/);
  assert.match(editingStyles, /user-select: text/);
  assert.match(styles, /\.texture-element\[data-type="text"\] \.texture-content \{\s*pointer-events: all/);
});

test('reuses the active text editor and removes its event listeners on close', () => {
  assert.match(runtime, /state\.textEditor\?\.group === group && textBox\.getAttribute\('contenteditable'\) === 'true'/);
  assert.match(runtime, /textBox\.removeEventListener\('keydown', handleKeydown\)/);
  assert.match(runtime, /state\.textEditor = \{\s*group,/);
  assert.doesNotMatch(runtime, /range\.collapse\(false\)/);
});

test('makes the selected text box itself movable and editable', () => {
  assert.match(runtime, /class: 'selection-text-hit-area',[\s\S]*?'data-action': 'move'/);
  assert.match(runtime, /event\.target\.closest\('\.selection-text-hit-area'\) \? state\.selected : null/);
  assert.match(runtime, /state\.selected\.dataset\.type === 'text'[\s\S]*?state\.textEditor\?\.group === state\.selected/);
  assert.match(styles, /\.selection-text-hit-area \{[\s\S]*?pointer-events: all;[\s\S]*?cursor: move;/);
});

test('removes selection controls while text editing and restores them after close', () => {
  assert.match(runtime, /&& !isEditingText\) \{/);
  assert.match(runtime, /state\.textEditor = null;\s*renderSelection\(\);/);
  assert.match(runtime, /state\.textEditor = \{[\s\S]*?renderSelection\(\);\s*requestAnimationFrame/);
});

test('redraws selection controls when canvas zoom changes', () => {
  const zoomFunction = runtime.match(/function applyCanvasZoom[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(zoomFunction, /requestAnimationFrame\(\(\) => renderSelection\(\)\)/);
});

test('rotates the canvas view in quarter turns without rotating the exported texture', () => {
  assert.match(view, /id="canvasRotate"[^>]*aria-label="Rotate canvas clockwise/);
  assert.match(view, /class="texture-canvas-frame" id="textureCanvasFrame"/);
  assert.match(runtime, /canvasRotation: 0/);
  assert.match(runtime, /state\.canvasRotation = \(state\.canvasRotation \+ 90\) % 360/);
  assert.match(runtime, /const isQuarterTurn = state\.canvasRotation % 180 !== 0/);
  assert.match(runtime, /resizeCursor\(handle, data\.rotate \+ state\.canvasRotation\)/);
  assert.match(runtime, /exportSvg\.style\.removeProperty\('--canvas-rotation'\)/);
  assert.match(styles, /transform: rotate\(var\(--canvas-rotation, 0deg\)\)/);
});

test('keeps editor overlays aligned to the scrolled canvas viewport', () => {
  assert.match(runtime, /const visibleLeft = textureCanvasArea\.scrollLeft \+ 8/);
  assert.match(runtime, /const visibleTop = textureCanvasArea\.scrollTop \+ 8/);
});

test('closes transient editor overlays before closing the design modal with Escape', () => {
  assert.match(runtime, /if \(colorPopover\.classList\.contains\('visible'\)\) closeColorPopover\(\);/);
  assert.match(runtime, /else if \(imageAssetTray && !imageAssetTray\.hidden\)/);
  assert.match(runtime, /else if \(designAppearancePanel\?\.classList\.contains\('is-mobile-open'\)\)/);
  assert.match(runtime, /else closeModal\(\);/);
});

test('keeps the compact primary rail focused on visible editor tools', () => {
  assert.match(view, /id="toolImage" title="Add Image"/);
  assert.match(view, /id="toolColor" title="Garment color"/);
  assert.match(view, /id="toolMaterial" title="Garment material"/);
  assert.doesNotMatch(view, /id="toolPan"/);
});
