import { bmp, layers, activeLayer } from '../core/layer.js';
import { writeCanvasToClipboard, extractImageFromClipboardItems } from './clipboard.js';

function createSelectionCanvas(engine) {
  const sel = engine.selection;
  if (!sel) return bmp;
  const { x, y, w, h } = sel.rect;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (sel.floatCanvas) {
    ctx.drawImage(sel.floatCanvas, 0, 0);
  } else {
    const layerCtx = layers[activeLayer].getContext('2d');
    const image = layerCtx.getImageData(x, y, w, h);
    ctx.putImageData(image, 0, 0);
  }
  return canvas;
}

export async function copySelection(engine) {
  const source = createSelectionCanvas(engine);
  await writeCanvasToClipboard(source);
}

export async function cutSelection(engine) {
  const sel = engine.selection;
  if (!sel) {
    throw new Error('Selection is required to perform cut');
  }
  await copySelection(engine);
  const { x, y, w, h } = sel.rect;
  const ctx = layers[activeLayer].getContext('2d');
  const before = ctx.getImageData(x, y, w, h);
  ctx.clearRect(x, y, w, h);
  const after = ctx.getImageData(x, y, w, h);
  engine.history.pushPatch({ rect: { x, y, w, h }, layer: activeLayer, before, after });
  engine.clearSelection();
  engine.requestRepaint();
}

export async function readClipboardItems(items) {
  return extractImageFromClipboardItems(items);
}
