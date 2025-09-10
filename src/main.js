import { PaintApp } from './app.js';
import { toHex } from './utils/helpers.js';
import { drawEllipsePath, floodFill } from './utils/drawing.js';
import {
  cancelTextEditing as cancelTextEdit,
  createTextEditor as createTextEditorImpl,
  isTextEditing,
} from './managers/text-editor.js';
import { layers, activeLayer, bmp } from './layer.js';

const app = new PaintApp();

export { toHex, drawEllipsePath, floodFill, layers, activeLayer, bmp, isTextEditing };
export const engine = app.engine;
export const selectTool = (id) => app.selectTool(id);
export const cancelTextEditing = (commit = false) =>
  cancelTextEdit(commit, layers, activeLayer, app.engine);
export const createTextEditor = (x, y, store) =>
  createTextEditorImpl(
    x,
    y,
    store,
    app.engine,
    app.domManager.elements.editorLayer,
    layers,
    activeLayer,
  );

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
