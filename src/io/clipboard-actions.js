import {
  bmp,
  layers,
  activeLayer,
  markLayerPreviewDirty,
  flattenLayers,
} from '../core/layer.js';
import { writeCanvasToClipboard, extractImageFromClipboardItems } from './clipboard.js';

function createFlattenedCanvas(rect = null) {
  const composite = document.createElement('canvas');
  composite.width = bmp.width;
  composite.height = bmp.height;
  flattenLayers(composite.getContext('2d'));

  if (!rect) return composite;

  const cropped = document.createElement('canvas');
  cropped.width = rect.w;
  cropped.height = rect.h;
  cropped
    .getContext('2d')
    .drawImage(composite, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return cropped;
}

function createSelectionCanvas(engine, scope = 'layer') {
  const sel = engine.selection;
  if (!sel) {
    if (scope === 'canvas') {
      return createFlattenedCanvas();
    }
    const active = layers[activeLayer];
    return active ?? bmp;
  }
  const { x, y, w, h } = sel.rect;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (sel.floatCanvas) {
    ctx.drawImage(sel.floatCanvas, 0, 0);
  } else {
    if (scope === 'canvas') {
      const flattened = createFlattenedCanvas(sel.rect);
      ctx.drawImage(flattened, 0, 0);
    } else {
      const layerCtx = layers[activeLayer].getContext('2d');
      const image = layerCtx.getImageData(x, y, w, h);
      ctx.putImageData(image, 0, 0);
    }
  }
  return canvas;
}

export async function copySelection(engine, scope = 'layer') {
  const source = createSelectionCanvas(engine, scope);
  await writeCanvasToClipboard(source);
}

export async function cutSelection(engine, scope = 'layer') {
  const sel = engine.selection;
  if (!sel) {
    throw new Error('Selection is required to perform cut');
  }
  await copySelection(engine, scope);
  const { x, y, w, h } = sel.rect;
  const targets = scope === 'canvas' ? layers : [layers[activeLayer]];
  targets.forEach((layer, idx) => {
    if (!layer) return;
    const ctx = layer.getContext('2d');
    const before = ctx.getImageData(x, y, w, h);
    ctx.clearRect(x, y, w, h);
    const after = ctx.getImageData(x, y, w, h);
    const layerIndex = scope === 'canvas' ? idx : activeLayer;
    engine.history.pushPatch({ rect: { x, y, w, h }, layer: layerIndex, before, after });
    markLayerPreviewDirty(layerIndex);
  });
  engine.clearSelection();
  engine.requestRepaint();
}

export async function readClipboardItems(items) {
  return extractImageFromClipboardItems(items);
}
