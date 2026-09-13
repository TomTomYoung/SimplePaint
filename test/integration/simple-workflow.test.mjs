import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createCanvas, Image, ImageData } from '@napi-rs/canvas';

// DOM event integration with a real raster backend. This does not replace browser layout QA.
const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://simplepaint.test/' });
const { window } = dom;
for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLCanvasElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'localStorage']) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? window : window[name] });
}
Object.assign(globalThis, { Image, ImageData, ResizeObserver: class { observe() {} }, requestAnimationFrame: () => 1, cancelAnimationFrame() {} });
window.matchMedia = () => ({ matches: false, addEventListener() {} });
const backing = new WeakMap();
const contexts = new WeakMap();
const native = element => {
  if (!(element instanceof window.HTMLCanvasElement)) return element;
  if (!backing.has(element)) backing.set(element, createCanvas(element.width || 1, element.height || 1));
  return backing.get(element);
};
for (const name of ['width', 'height']) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLCanvasElement.prototype, name);
  Object.defineProperty(window.HTMLCanvasElement.prototype, name, {
    ...descriptor, set(value) { descriptor.set.call(this, value); if (backing.has(this)) backing.get(this)[name] = Math.max(1, value); },
  });
}
window.HTMLCanvasElement.prototype.getContext = function(type) {
  if (type !== '2d') return null;
  if (!contexts.has(this)) {
    const ctx = native(this).getContext('2d');
    contexts.set(this, new Proxy(ctx, {
      get(target, key) {
        if (key === 'drawImage') return (image, ...args) => target.drawImage(native(image), ...args);
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, key, value) { target[key] = value; return true; },
    }));
  }
  return contexts.get(this);
};
window.HTMLCanvasElement.prototype.toDataURL = function(...args) { return native(this).toDataURL(...args); };
window.HTMLCanvasElement.prototype.toBlob = function(callback, mime, quality) { native(this).toBuffer(mime || 'image/png').then?.(callback); };
for (const element of document.querySelectorAll('#base, #overlay, #canvasArea')) {
  element.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 128, bottom: 128, width: 128, height: 128 });
  element.setPointerCapture = () => {};
  element.hasPointerCapture = () => false;
}
for (const id of ['base', 'overlay', 'editorLayer']) globalThis[id] = document.getElementById(id);
// Prevent the legacy main-module auto-boot; start the app explicitly below.
const getById = document.getElementById.bind(document);
document.getElementById = id => id === 'base' ? null : getById(id);
const { PaintApp } = await import('../../src/app.js');
document.getElementById = getById;
const { createDocument } = await import('../../src/io/document.js');
const { layers, bmp, addLayer, addVectorLayer, deleteLayer, moveLayer, setActiveLayer } = await import('../../src/core/layer.js');
const { initToolbar } = await import('../../src/gui/toolbar.js');
const { initLayerPanel } = await import('../../src/gui/panels.js');
const { initToolPropsPanel } = await import('../../src/gui/tool-props.js');
const { createLayeredSnapshot, applyLayeredSnapshot } = await import('../../src/io/layered-snapshot.js');
const { applySnapshotToDocument } = await import('../../src/io/document.js');
const { createAutosaveController } = await import('../../src/io/autosave.js');
const { renderDocumentCanvas } = await import('../../src/io/export-actions.js');
const { constrainDimensions } = await import('../../src/gui/document-dialogs.js');
globalThis.getCanvasArea = () => document.getElementById('canvasArea');
const app = new PaintApp();
initToolbar();
initLayerPanel();
initToolPropsPanel(app.store, app.engine);
const area = document.getElementById('canvasArea');
const click = id => document.getElementById(id).click();
const pixel = (layer, x, y) => Array.from(layer.getContext('2d').getImageData(x, y, 1, 1).data);
function reset() {
  createDocument({ engine: app.engine, width: 32, height: 24 });
  app.engine.vp.zoom = 1; app.engine.vp.panX = 0; app.engine.vp.panY = 0;
  app.selectTool('brush');
  app.store.setToolState('brush', { primaryColor: '#ff0000', brushSize: 4, opacity: 1 });
}
function pointer(type, x, y) {
  area.dispatchEvent(new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
}
function stroke(x = 6, y = 6) {
  pointer('pointerdown', x, y); pointer('pointermove', x + 8, y); pointer('pointerup', x + 8, y);
}
const key = (code, options = {}) => window.dispatchEvent(new window.KeyboardEvent('keydown', { code, key: code.slice(3).toLowerCase(), bubbles: true, cancelable: true, ...options }));

test('basic controls are unique; a click draws a dot and one shortcut undoes exactly one stroke', () => {
  reset();
  assert.equal(document.querySelectorAll('.basic-tools .tool').length, 10);
  assert.equal(document.querySelectorAll('[data-tool="select-free"]').length, 0);
  const ids = Array.from(document.querySelectorAll('[id]'), el => el.id);
  assert.equal(new Set(ids).size, ids.length);
  pointer('pointerdown', 6, 6); pointer('pointerup', 6, 6);
  assert.deepEqual(pixel(layers[0], 6, 6), [255, 0, 0, 255]);
  stroke(18, 15);
  key('KeyZ', { ctrlKey: true });
  assert.deepEqual(pixel(layers[0], 6, 6), [255, 0, 0, 255]);
  assert.deepEqual(pixel(layers[0], 18, 15), [255, 255, 255, 255]);
  key('KeyZ', { ctrlKey: true, shiftKey: true });
  assert.deepEqual(pixel(layers[0], 18, 15), [255, 0, 0, 255]);
});

test('clear, flips and both resize modes preserve reversible pixels and dimensions', () => {
  reset(); stroke();
  const before = pixel(layers[0], 6, 6);
  app.clearAllLayers(); assert.deepEqual(pixel(layers[0], 6, 6), [255, 255, 255, 255]);
  app.engine.undo(); assert.deepEqual(pixel(layers[0], 6, 6), before);
  app.flipCanvas('h'); assert.deepEqual(pixel(layers[0], 25, 6), before);
  app.engine.undo(); assert.deepEqual(pixel(layers[0], 6, 6), before);
  app.resizeCanvas(64, 48, 'image'); assert.equal(bmp.width, 64); assert.deepEqual(pixel(layers[0], 13, 13), before);
  app.engine.undo(); assert.equal(bmp.width, 32); assert.equal(bmp.height, 24);
  app.resizeCanvas(64, 48, 'canvas'); assert.deepEqual(pixel(layers[0], 6, 6), before); assert.equal(pixel(layers[0], 40, 30)[3], 0);
  app.engine.undo(); app.engine.redo(); assert.equal(bmp.width, 64); assert.equal(pixel(layers[0], 40, 30)[3], 0);
});

test('layer add/delete/move and earlier strokes undo on the correct layer', () => {
  reset(); stroke(); const firstId = layers[0]._id;
  click('addLayerBtn'); assert.equal(layers.length, 2);
  app.store.setToolState('brush', { primaryColor: '#0000ff' }); stroke(8, 12);
  const secondId = layers[1]._id;
  moveLayer(1, 0, app.engine); assert.equal(layers[0]._id, secondId);
  app.engine.undo(); assert.equal(layers[0]._id, firstId);
  deleteLayer(app.engine); assert.equal(layers.length, 1);
  app.engine.undo(); assert.equal(layers.length, 2); assert.deepEqual(pixel(layers[1], 8, 12), [0, 0, 255, 255]);
  app.engine.undo(); assert.equal(pixel(layers[1], 8, 12)[3], 0);
  assert.deepEqual(pixel(layers[0], 6, 6), [255, 0, 0, 255]);
  app.engine.undo(); assert.equal(layers.length, 1);
  app.engine.undo(); assert.deepEqual(pixel(layers[0], 6, 6), [255, 255, 255, 255]);
});

test('layered restore retains hidden pixels, metadata, vector data and active layer', async () => {
  reset(); stroke(); addLayer(app.engine); stroke(8, 12);
  Object.assign(layers[1], { name: '隠した色', visible: false, opacity: .45, mode: 'multiply', clip: true });
  addVectorLayer(app.engine); layers[2].name = '線';
  const snapshot = createLayeredSnapshot(app.engine);
  reset();
  await applyLayeredSnapshot({ engine: app.engine, snapshot });
  assert.equal(layers.length, 3);
  assert.equal(layers[1].name, '隠した色'); assert.equal(layers[1].visible, false);
  assert.equal(layers[1].opacity, .45); assert.equal(layers[1].mode, 'multiply'); assert.equal(layers[1].clip, true);
  assert.deepEqual(pixel(layers[1], 8, 12), [255, 0, 0, 255]);
  assert.deepEqual(createLayeredSnapshot(app.engine).layers[2].vectorData, snapshot.layers[2].vectorData);
  assert.equal(createLayeredSnapshot(app.engine).activeLayer, 2);
  assert.equal(app.engine.history.canUndo(), false);
  const before = createLayeredSnapshot(app.engine);
  const broken = structuredClone(before); broken.layers[1].dataURL = 'data:image/png;base64,broken';
  await assert.rejects(applyLayeredSnapshot({ engine: app.engine, snapshot: broken }));
  assert.deepEqual(createLayeredSnapshot(app.engine).layers, before.layers);
});

test('legacy flattened snapshots restore and JPEG uses a white matte', async () => {
  reset(); stroke(); const dataURL = layers[0].toDataURL('image/png');
  await applySnapshotToDocument({ engine: app.engine, snapshot: { width: 32, height: 24, dataURL } });
  assert.deepEqual(pixel(layers[0], 6, 6), [255, 0, 0, 255]);
  layers[0].getContext('2d').clearRect(0, 0, 32, 24);
  assert.equal(pixel(renderDocumentCanvas({ format: 'png' }), 1, 1)[3], 0);
  assert.deepEqual(pixel(renderDocumentCanvas({ format: 'jpg' }), 1, 1), [255, 255, 255, 255]);
});

test('sliders remain mounted while editing, and eyedropper returns to a reusable drawing tool', () => {
  reset();
  const input = document.querySelector('[name="brushSize"]');
  input.value = '12'; input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(app.store.getToolState('brush').brushSize, 12);
  assert.equal(document.querySelector('[name="brushSize"]'), input);
  assert.equal(document.querySelector('[name="smoothAlpha"]'), null);
  stroke();
  document.querySelector('[data-tool="eyedropper"]').click();
  pointer('pointerdown', 6, 6); pointer('pointerup', 6, 6);
  assert.equal(app.store.getState().toolId, 'brush');
  document.querySelector('[data-tool="eyedropper"]').click();
  assert.equal(app.store.getState().toolId, 'eyedropper');
  input.focus();
  input.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true, bubbles: true }));
  assert.equal(app.engine.history.canUndo(), true);
});

test('size constraints preserve ratio; paused autosave cannot replace recovery data', async () => {
  assert.deepEqual(constrainDimensions(640, 720, 1280, 720, 'width'), { width: 640, height: 360 });
  assert.deepEqual(constrainDimensions(1280, 180, 1280, 720, 'height'), { width: 320, height: 180 });
  let saves = 0;
  const saved = { version: 2, layers: [{ dataURL: 'previous' }] };
  const controller = createAutosaveController({ autosaveInterval: 0, snapshotDocument: () => ({}), sessionManager: { load: async () => saved, save: async () => { saves++; } } });
  await controller.pause(); controller.scheduleSave(); await controller.saveNow();
  assert.equal(await controller.check(), true); assert.equal(saves, 0);
  await controller.resume({ immediate: true }); assert.equal(saves, 1);
  await controller.dispose();
});

test('remaining interface initialisers work with the simplified markup', async () => {
  const { initToolDropdowns } = await import('../../src/gui/tool-dropdowns.js');
  const { initToolSearchOverlay } = await import('../../src/gui/tool-search-overlay.js');
  const { initShortcutOverlay } = await import('../../src/gui/shortcuts-overlay.js');
  const { initPanelHeaders } = await import('../../src/gui/panels.js');
  const { initWorkspaceLayoutControls } = await import('../../src/gui/workspace-layout.js');
  initToolDropdowns(); initToolSearchOverlay(); initShortcutOverlay(); initPanelHeaders(); initWorkspaceLayoutControls();
  assert.ok(document.getElementById('saveImage'));
  assert.equal(document.getElementById('savePNG'), null);
  assert.equal(document.querySelectorAll('#addLayerBtn').length, 1);
  assert.equal(document.querySelectorAll('dialog').length, 3);
});
