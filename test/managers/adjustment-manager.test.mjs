import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockDomEnvironment, resetCanvasContext } from '../helpers/mock-dom.js';

const env = installMockDomEnvironment({ trackCanvasImageData: true });
const layerModule = await import('../../src/core/layer.js');
layerModule.bmp.width = 32;
layerModule.bmp.height = 32;
layerModule.layers.length = 0;
layerModule.layers.push(layerModule.bmp);
const { AdjustmentManager } = await import('../../src/managers/adjustment-manager.js');

const { document } = env;

function createValueElement(id, initialValue) {
  let current = String(initialValue);
  return {
    id,
    get value() {
      return current;
    },
    set value(next) {
      current = String(next);
    },
  };
}

function createCheckboxElement(id, initialChecked) {
  let current = Boolean(initialChecked);
  return {
    id,
    get checked() {
      return current;
    },
    set checked(next) {
      current = Boolean(next);
    },
  };
}

function resetAdjustmentControls(values = {}) {
  const defaults = {
    brightness: '0',
    contrast: '0',
    saturation: '0',
    hue: '0',
    invert: false,
  };
  const config = { ...defaults, ...values };
  document._elements = {
    adjustPanel: { id: 'adjustPanel' },
    adjBrightness: createValueElement('adjBrightness', config.brightness),
    adjContrast: createValueElement('adjContrast', config.contrast),
    adjSaturation: createValueElement('adjSaturation', config.saturation),
    adjHue: createValueElement('adjHue', config.hue),
    adjInvert: createCheckboxElement('adjInvert', config.invert),
  };
  return document._elements;
}

function createAdjustmentManager(overrides = {}) {
  const history = [];
  const engine = {
    repaintRequests: [],
    selection: null,
    filterPreview: null,
    history: {
      patches: history,
      pushPatch(patch) {
        this.patches.push(patch);
      },
    },
    beginStrokeSnapshotCalls: 0,
    beginStrokeSnapshot() {
      this.beginStrokeSnapshotCalls += 1;
    },
    requestRepaint(area) {
      this.repaintRequests.push(area ?? null);
    },
    ...overrides,
  };

  if (!engine.history) {
    engine.history = {
      patches: history,
      pushPatch(patch) {
        this.patches.push(patch);
      },
    };
  } else if (!engine.history.patches) {
    engine.history.patches = [];
    const originalPush = engine.history.pushPatch?.bind(engine.history);
    engine.history.pushPatch = (patch) => {
      engine.history.patches.push(patch);
      if (originalPush) originalPush(patch);
    };
  }

  const layers = overrides.layers ?? layerModule.layers;
  const activeLayerIndex = overrides.activeLayerIndex ?? 0;
  const manager = new AdjustmentManager(engine, layers, activeLayerIndex);

  return { manager, engine, history: engine.history.patches };
}

function createMockCanvas(label = '') {
  const canvas = env.createCanvas({ label, trackImageData: true });
  return canvas;
}

function fillImageData(imageData, value) {
  imageData.data.fill(value);
  return imageData;
}

test.after(() => {
  env.restore();
});

function getControlElements() {
  return {
    panel: document._elements.adjustPanel,
    brightness: document._elements.adjBrightness,
    contrast: document._elements.adjContrast,
    saturation: document._elements.adjSaturation,
    hue: document._elements.adjHue,
    invert: document._elements.adjInvert,
  };
}

test('resetToDefaults restores slider values and checkbox state', () => {
  resetAdjustmentControls({
    brightness: '12',
    contrast: '-4',
    saturation: '18',
    hue: '22',
    invert: true,
  });

  const { manager } = createAdjustmentManager();
  manager.resetToDefaults();

  const elements = getControlElements();
  assert.equal(elements.brightness.value, '0');
  assert.equal(elements.contrast.value, '0');
  assert.equal(elements.saturation.value, '0');
  assert.equal(elements.hue.value, '0');
  assert.equal(elements.invert.checked, false);
});

test('updatePreview prefers floating selection and requests repaint', () => {
  resetAdjustmentControls();
  const { manager, engine } = createAdjustmentManager();

  const floatCanvas = createMockCanvas('float');
  floatCanvas.width = 4;
  floatCanvas.height = 4;
  const floatCtx = floatCanvas.getContext('2d');
  floatCtx.imageData = fillImageData(new ImageData(4, 4), 10);

  engine.selection = {
    floatCanvas,
    pos: { x: 3, y: 5 },
    rect: { x: 3, y: 5, w: 4, h: 4 },
  };

  manager.updatePreview();

  assert.equal(engine.repaintRequests.length, 1);
  assert.ok(engine.filterPreview);
  assert.equal(engine.filterPreview.x, 3);
  assert.equal(engine.filterPreview.y, 5);
  const previewCtx = engine.filterPreview.canvas.getContext('2d');
  assert.equal(previewCtx.putImageDataCalls.length, 1);
});

test('updatePreview draws from base bitmap when selection lacks float canvas', () => {
  resetAdjustmentControls();
  const { manager, engine } = createAdjustmentManager();
  const baseCtx = layerModule.bmp.getContext('2d');
  resetCanvasContext(baseCtx);

  engine.selection = {
    floatCanvas: null,
    pos: { x: 2, y: 4 },
    rect: { x: 2, y: 4, w: 6, h: 8 },
  };

  manager.updatePreview();

  assert.equal(engine.repaintRequests.length, 1);
  assert.ok(engine.filterPreview);
  assert.equal(engine.filterPreview.canvas.width, 6);
  assert.equal(engine.filterPreview.canvas.height, 8);
  assert.equal(baseCtx.drawImageCalls.length, 0);
});

test('applyFilter commits preview to the active layer and records history', () => {
  resetAdjustmentControls();
  const { manager, engine, history } = createAdjustmentManager();
  const baseCtx = layerModule.bmp.getContext('2d');
  resetCanvasContext(baseCtx);

  const previewCanvas = createMockCanvas('preview');
  previewCanvas.width = 2;
  previewCanvas.height = 2;
  const previewCtx = previewCanvas.getContext('2d');
  previewCtx.imageData = fillImageData(new ImageData(2, 2), 50);

  engine.filterPreview = { canvas: previewCanvas, x: 1, y: 2 };

  manager.applyFilter();

  assert.equal(baseCtx.drawImageCalls.length, 1);
  assert.equal(history.length, 1);
  assert.equal(engine.repaintRequests.length, 1);
});

test('applyFilter replaces floating selection buffer without history entry', () => {
  resetAdjustmentControls();
  const { manager, engine, history } = createAdjustmentManager();

  const floatCanvas = createMockCanvas('float');
  floatCanvas.width = 2;
  floatCanvas.height = 2;
  const floatCtx = floatCanvas.getContext('2d');
  floatCtx.imageData = fillImageData(new ImageData(2, 2), 90);

  const previewCanvas = createMockCanvas('preview');
  previewCanvas.width = 2;
  previewCanvas.height = 2;
  const previewCtx = previewCanvas.getContext('2d');
  previewCtx.imageData = fillImageData(new ImageData(2, 2), 120);

  engine.selection = {
    floatCanvas,
    pos: { x: 0, y: 0 },
    rect: { x: 0, y: 0, w: 2, h: 2 },
  };

  engine.filterPreview = { canvas: previewCanvas, x: 0, y: 0 };

  manager.applyFilter();

  assert.strictEqual(engine.selection.floatCanvas, previewCanvas);
  assert.equal(history.length, 0);
  assert.equal(engine.repaintRequests.length, 1);
  assert.equal(engine.filterPreview, null);
});

test('clearPreview removes preview canvas and triggers repaint', () => {
  resetAdjustmentControls();
  const { manager, engine } = createAdjustmentManager();

  engine.filterPreview = { canvas: createMockCanvas('preview'), x: 0, y: 0 };

  manager.clearPreview();

  assert.equal(engine.filterPreview, null);
  assert.equal(engine.repaintRequests.length, 1);
});

test('startPreview delegates to updatePreview', () => {
  resetAdjustmentControls();
  const { manager } = createAdjustmentManager({
    requestRepaint() {},
  });

  const calls = [];
  manager.updatePreview = () => {
    calls.push('called');
  };

  manager.startPreview();

  assert.deepEqual(calls, ['called']);
});

test('preview results are reset between filter runs', () => {
  resetAdjustmentControls();
  const { manager, engine } = createAdjustmentManager();

  const previewCanvas = createMockCanvas('preview');
  previewCanvas.width = 4;
  previewCanvas.height = 4;
  const previewCtx = previewCanvas.getContext('2d');
  previewCtx.putImageDataCalls.push(['existing']);
  previewCtx.drawImageCalls.push(['existing']);

  engine.filterPreview = { canvas: previewCanvas, x: 0, y: 0 };
  manager.clearPreview();
  resetCanvasContext(previewCtx);

  assert.equal(previewCtx.putImageDataCalls.length, 0);
  assert.equal(previewCtx.drawImageCalls.length, 0);
});

test('selection mask data is refreshed when repainting the preview', () => {
  resetAdjustmentControls();
  const { manager, engine } = createAdjustmentManager();

  const floatCanvas = createMockCanvas('float');
  floatCanvas.width = 4;
  floatCanvas.height = 4;
  const floatCtx = floatCanvas.getContext('2d');
  floatCtx.imageData = fillImageData(new ImageData(4, 4), 40);

  engine.selection = {
    floatCanvas,
    pos: { x: 1, y: 2 },
    rect: { x: 1, y: 2, w: 4, h: 4 },
  };

  manager.updatePreview();

  const previewCtx = engine.filterPreview.canvas.getContext('2d');
  assert.equal(floatCtx.drawImageCalls.length, 0);
  assert.equal(previewCtx.putImageDataCalls.length, 1);
});
