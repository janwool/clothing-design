const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../public/js/model-designer.js'), 'utf8');
class SvgNode {
  constructor(name, attrs = {}) {
    this.localName = name; this.attrs = {...attrs}; this.children = []; this.properties = {};
    this.classList = {contains: value => (this.attrs.class || '').split(' ').includes(value)};
    this.style = {setProperty: (name, value, priority) => {this.properties[name] = {value, priority};}};
  }
  get attributes() {return Object.entries(this.attrs).map(([name, value]) => ({name, value}));}
  setAttribute(name, value) {this.attrs[name] = value;}
  getAttribute(name) {return this.attrs[name] ?? null;}
  hasAttribute(name) {return name in this.attrs;}
  removeAttribute(name) {delete this.attrs[name];}
  appendChild(node) {this.children.push(node);}
  replaceChildren() {this.children = [];}
  cloneNode() {return new SvgNode(this.localName, this.attrs);}
}
test('outline copies only piece contours, preserving transforms without duplicate IDs or fills', () => {
  const layer = new SvgNode('g', {transform: 'matrix(2 0 0 2 0 0)'});
  const group = new SvgNode('g', {transform: 'translate(10 20)'});
  group.appendChild(new SvgNode('path', {class: 'texture-template-path', id: 'front', 'data-color': '#111', d: 'M0 0L20 20Z', style: 'fill:red'}));
  group.appendChild(new SvgNode('image', {href: 'artwork.png'}));
  layer.appendChild(group);
  const defs = new SvgNode('defs');
  defs.appendChild(new SvgNode('path', {id: 'clip', d: 'M0 0'})); layer.appendChild(defs);
  const outline = new SvgNode('g');
  const start = source.indexOf('  function refreshTemplateOutline(');
  const end = source.indexOf('  function restoreTemplatePathPreview(', start);
  const ctx = {document: {getElementById: () => outline, createElementNS: (_, name) => new SvgNode(name)}};
  vm.runInNewContext(source.slice(start, end), ctx);
  ctx.refreshTemplateOutline(layer);
  assert.equal(outline.getAttribute('transform'), layer.getAttribute('transform'));
  assert.equal(outline.children.length, 1);
  assert.equal(outline.children[0].getAttribute('transform'), 'translate(10 20)');
  const contour = outline.children[0].children[0];
  assert.equal(outline.children[0].children.length, 1);
  assert.equal(contour.getAttribute('id'), null);
  assert.equal(contour.getAttribute('class'), null);
  assert.equal(contour.getAttribute('data-color'), null);
  assert.equal(contour.getAttribute('d'), 'M0 0L20 20Z');
  assert.equal(contour.properties.fill.value, 'none');
  assert.equal(contour.properties.stroke.value, '#fff');
  assert.equal(contour.getAttribute('vector-effect'), 'non-scaling-stroke');
  ctx.refreshTemplateOutline(layer);
  assert.equal(outline.children.length, 1);
});
test('editor contour overlay is excluded from texture and material map exports', () => {
  const textureExport = source.slice(source.indexOf('  function getTextureSvgDataUrl('), source.indexOf('  function getTextureSvgDataUrl(') + 1200);
  const materialExport = source.slice(source.indexOf('  async function buildPanelMaterialMaps('), source.indexOf('  async function buildPanelMaterialMaps(') + 1500);
  for (const code of [textureExport, materialExport]) assert.match(code, /querySelector\('#textureOutlineLayer'\)\?\.remove\(\)/);
});
