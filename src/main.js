import { PaintApp } from './app.js';
import { toHex } from './utils/color.js';
import { drawEllipsePath, floodFill as floodFillImpl } from './utils/drawing.js';
import {
  cancelTextEditing as cancelTextEdit,
  createTextEditor as createTextEditorImpl,
  isTextEditing,
} from './managers/text-editor.js';
import { layers, activeLayer, bmp } from './core/layer.js';

function createEngineStub() {
  const context = {
    canvas: { width: 0, height: 0 },
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    clearRect() {},
    putImageData() {},
    drawImage() {},
    getImageData(_x = 0, _y = 0, width = 0, height = 0) {
      const Ctor = globalThis.ImageData || class { constructor() {} };
      return new Ctor(width, height);
    },
    createImageData(width = 0, height = 0) {
      const Ctor = globalThis.ImageData || class { constructor() {} };
      return new Ctor(width, height);
    },
  };
  return {
    ctx: context,
    beginStrokeSnapshot() {},
    finishStrokeToHistory() {},
    requestRepaint() {},
    expandPendingRect() {},
    expandPendingRectByRect() {},
    clearSelection() {},
    selection: null,
    history: { pushPatch() {} },
  };
}

function hasDOM() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (typeof document.createElement !== 'function') return false;
  if (typeof document.getElementById !== 'function') return false;
  return Boolean(document.getElementById('base'));
}

let app = null;
export let engine = createEngineStub();

if (hasDOM()) {
  app = new PaintApp();
  engine = app.engine;

  window.addEventListener('load', () => app.boot());

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (isTextEditing() && !e.target?.closest?.('.text-editor')) {
        cancelTextEditing(true);
        app.engine.requestRepaint();
      }
    },
    { capture: true },
  );
}

export const floodFill = (ctx, x0, y0, rgba, th = 0) =>
  floodFillImpl(ctx, bmp, x0, y0, rgba, th);

export { toHex, drawEllipsePath, layers, activeLayer, bmp, isTextEditing };
export const selectTool = (id) => app?.selectTool?.(id);
export const cancelTextEditing = (commit = false) => {
  if (!app) return;
  cancelTextEdit(commit, layers, activeLayer, app.engine);
};
export const createTextEditor = (x, y, store) => {
  if (!app) return null;
  return createTextEditorImpl(
    x,
    y,
    store,
    app.engine,
    app.domManager.elements.editorLayer,
    layers,
    activeLayer,
  );
};
