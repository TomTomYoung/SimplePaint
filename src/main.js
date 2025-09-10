import { PaintApp } from './app.js';
import { toHex } from './utils/helpers.js';
import { drawEllipsePath, floodFill } from './utils/drawing.js';
import { cancelTextEditing as cancelTextEdit, createTextEditor, isTextEditing } from './managers/text-editor.js';
import { layers, activeLayer, bmp } from './layer.js';

const app = new PaintApp();

window.toHex = toHex;
window.selectTool = (id) => app.selectTool(id);
window.cancelTextEditing = (commit = false) => cancelTextEdit(commit, layers, activeLayer, app.engine);
window.createTextEditor = (x, y, store) =>
  createTextEditor(x, y, store, app.engine, app.domManager.elements.editorLayer, layers, activeLayer);
window.isTextEditing = isTextEditing;
window.floodFill = floodFill;
window.drawEllipsePath = drawEllipsePath;
window.engine = app.engine;
window.bmp = bmp;
window.layers = layers;
window.activeLayer = activeLayer;

window.addEventListener('load', () => app.boot());

document.addEventListener(
  'pointerdown',
  (e) => {
    if (isTextEditing() && !e.target?.closest?.('.text-editor')) {
      window.cancelTextEditing(true);
      app.engine.requestRepaint();
    }
  },
  { capture: true }
);
