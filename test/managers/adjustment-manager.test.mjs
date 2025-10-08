import test from 'node:test';
import assert from 'node:assert/strict';

const previousImageData = globalThis.ImageData;

class MockImageData {
  constructor(dataOrWidth, width, height) {
    if (dataOrWidth instanceof Uint8ClampedArray) {
      this.data = dataOrWidth;
      this.width = width ?? 0;
      this.height = height ?? 0;
    } else {
      const w = Number(dataOrWidth) || 0;
      const h = Number(width) || 0;
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  }
}

globalThis.ImageData = MockImageData;

function createMockCanvas(label = '') {
  const canvas = {
    width: 0,
    height: 0,
    _ctx: null,
    getContext(type, options) {
      if (type !== '2d') return null;
      if (!this._ctx) {
        const context = {
          clearRectCalls: [],
          drawImageCalls: [],
          getImageDataCalls: [],
          putImageDataCalls: [],
          imageData: null,
          clearRect(...args) {
            this.clearRectCalls.push(args);
          },
          drawImage(...args) {
            this.drawImageCalls.push(args);
            const [source] = args;
            if (source && source._ctx?.imageData) {
              const { data, width, height } = source._ctx.imageData;
              this.imageData = new ImageData(new Uint8ClampedArray(data), width, height);
            }
          },
          getImageData(x, y, w, h) {
            const width = w ?? canvas.width ?? 0;
            const height = h ?? canvas.height ?? 0;
            if (!this.imageData || this.imageData.width !== width || this.imageData.height !== height) {
              this.imageData = new ImageData(width, height);
            }
            const copy = new ImageData(new Uint8ClampedArray(this.imageData.data), width, height);
            const entry = { args: [x, y, w, h], result: copy };
            this.getImageDataCalls.push(entry);
            return copy;
          },
          putImageData(imageData, x, y) {
            this.putImageDataCalls.push([imageData, x, y]);
            this.imageData = new ImageData(
              new Uint8ClampedArray(imageData.data),
              imageData.width,
              imageData.height,
            );
          },
        };
        this._ctx = context;
      }
      return this._ctx;
    },
    toString() {
      return label ? `[MockCanvas:${label}]` : '[MockCanvas]';
    },
  };
  return canvas;
}

function createDocumentEnvironment() {
  const previousDocument = globalThis.document;
  const doc = {
    _elements: {},
    getElementById(id) {
      return this._elements[id] ?? null;
    },
    createElement(tag) {
      if (tag === 'canvas') {
        return createMockCanvas(tag);
      }
      return {
        tagName: String(tag).toUpperCase(),
        style: {},
        children: [],
      };
    },
  };
  globalThis.document = doc;
  return {
    doc,
    restore() {
      if (previousDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = previousDocument;
      }
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
    adjBrightness: { id: 'adjBrightness', value: String(config.brightness) },
    adjContrast: { id: 'adjContrast', value: String(config.contrast) },
    adjSaturation: { id: 'adjSaturation', value: String(config.saturation) },
    adjHue: { id: 'adjHue', value: String(config.hue) },
    adjInvert: { id: 'adjInvert', checked: Boolean(config.invert) },
  };
  return document._elements;
}

const { restore } = createDocumentEnvironment();
const layerModule = await import('../../src/core/layer.js');
layerModule.bmp.width = 32;
layerModule.bmp.height = 32;
const { AdjustmentManager } = await import('../../src/managers/adjustment-manager.js');

test.after(() => {
  restore();
  if (previousImageData === undefined) {
    delete globalThis.ImageData;
  } else {
    globalThis.ImageData = previousImageData;
  }
});

test('resetToDefaults restores slider values and checkbox state', () => {
  const elements = resetAdjustmentControls({
    brightness: '12',
    contrast: '-4',
    saturation: '18',
    hue: '45',
    invert: true,
  });
  const manager = new AdjustmentManager({}, [], 0);

  manager.resetToDefaults();

  assert.strictEqual(elements.adjBrightness.value, 0);
  assert.strictEqual(elements.adjContrast.value, 0);
  assert.strictEqual(elements.adjSaturation.value, 0);
  assert.strictEqual(elements.adjHue.value, 0);
  assert.strictEqual(elements.adjInvert.checked, false);
});

test('updatePreview prefers floating selection and requests repaint', () => {
  resetAdjustmentControls({
    brightness: '10',
    contrast: '5',
    saturation: '-3',
    hue: '90',
    invert: true,
  });

  let repaintCalls = 0;
  const floatCanvas = createMockCanvas('float');
  floatCanvas.width = 8;
  floatCanvas.height = 6;
  floatCanvas.getContext('2d').imageData = new ImageData(8, 6);
  const engine = {
    selection: {
      floatCanvas,
      pos: { x: 12, y: 24 },
    },
    filterPreview: null,
    requestRepaint() {
      repaintCalls += 1;
    },
  };
  const manager = new AdjustmentManager(engine, [], 0);

  manager.updatePreview();

  const preview = engine.filterPreview;
  assert.ok(preview);
  assert.notStrictEqual(preview.canvas, floatCanvas);
  assert.strictEqual(preview.canvas.width, 8);
  assert.strictEqual(preview.canvas.height, 6);
  assert.deepEqual(engine.filterPreview, {
    canvas: preview.canvas,
    x: 12,
    y: 24,
  });
  assert.equal(floatCanvas.getContext('2d').getImageDataCalls.length, 1);
  assert.equal(layerModule.bmp.getContext('2d').getImageDataCalls.length, 0);
  assert.equal(preview.canvas.getContext('2d').putImageDataCalls.length, 1);
  assert.equal(repaintCalls, 1);
});

test('applyFilter commits preview to the active layer and records history', () => {
  resetAdjustmentControls();

  let repaintCalls = 0;
  let beginSnapshotCalls = 0;
  let pushedPatch = null;
  const targetLayer = createMockCanvas('layer');
  const layersRef = [targetLayer];
  const engine = {
    selection: null,
    filterPreview: null,
    beginStrokeSnapshot() {
      beginSnapshotCalls += 1;
    },
    requestRepaint() {
      repaintCalls += 1;
    },
    history: {
      pushPatch(payload) {
        pushedPatch = payload;
      },
    },
  };
  const manager = new AdjustmentManager(engine, layersRef, 0);
  layerModule.bmp.width = 5;
  layerModule.bmp.height = 7;
  layerModule.bmp.getContext('2d').imageData = new ImageData(5, 7);
  manager.updatePreview();

  assert.deepEqual(engine.filterPreview, {
    canvas: engine.filterPreview.canvas,
    x: 0,
    y: 0,
  });
  assert.equal(repaintCalls, 1);

  const previewCanvas = engine.filterPreview.canvas;
  const { width: previewWidth, height: previewHeight } = previewCanvas;
  assert.strictEqual(previewWidth, 5);
  assert.strictEqual(previewHeight, 7);

  manager.applyFilter();

  assert.equal(beginSnapshotCalls, 1);
  assert.equal(repaintCalls, 2);
  assert.strictEqual(engine.filterPreview, null);

  const ctx = targetLayer._ctx;
  assert.deepEqual(ctx.clearRectCalls, [[0, 0, 5, 7]]);
  assert.deepEqual(ctx.drawImageCalls, [[previewCanvas, 0, 0]]);
  assert.equal(ctx.getImageDataCalls.length, 2);
  assert.deepEqual(ctx.getImageDataCalls[0].args, [0, 0, 5, 7]);
  assert.deepEqual(ctx.getImageDataCalls[1].args, [0, 0, 5, 7]);

  assert.ok(pushedPatch);
  assert.deepEqual(pushedPatch.rect, { x: 0, y: 0, w: 5, h: 7 });
  assert.strictEqual(pushedPatch.before, ctx.getImageDataCalls[0].result);
  assert.strictEqual(pushedPatch.after, ctx.getImageDataCalls[1].result);
});
