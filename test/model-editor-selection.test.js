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

test('redraws selection controls when canvas zoom changes', () => {
  const zoomFunction = runtime.match(/function applyCanvasZoom[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(zoomFunction, /requestAnimationFrame\(\(\) => renderSelection\(\)\)/);
});

test('keeps editor overlays aligned to the scrolled canvas viewport', () => {
  assert.match(runtime, /const visibleLeft = textureCanvasArea\.scrollLeft \+ 8/);
  assert.match(runtime, /const visibleTop = textureCanvasArea\.scrollTop \+ 8/);
});

test('closes the color popover before closing the design modal with Escape', () => {
  assert.match(runtime, /if \(colorPopover\.classList\.contains\('visible'\)\) closeColorPopover\(\);\s*else closeModal\(\);/);
});

test('labels the canvas pan tool according to its behavior', () => {
  const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'model-detail.ejs'), 'utf8');
  assert.match(view, /id="toolPan" title="Pan Canvas"/);
  assert.match(view, /<span>Pan<\/span>/);
});
