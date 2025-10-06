import { bmp, clipCanvas, layers, activeLayer, renderLayers, updateLayerList, addLayer } from '../core/layer.js';

function configureLayerDimensions(width, height) {
  layers.forEach((layer) => {
    layer.width = width;
    layer.height = height;
    layer.getContext('2d').clearRect(0, 0, width, height);
  });
}

export function createDocument({ engine, fitToScreen, width = 1280, height = 720, backgroundColor = '#ffffff' }) {
  bmp.width = width;
  bmp.height = height;
  clipCanvas.width = width;
  clipCanvas.height = height;

  layers.length = 0;
  addLayer(engine);
  configureLayerDimensions(width, height);

  const ctx = layers[0].getContext('2d');
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (engine?.clearSelection) {
    engine.clearSelection();
  }

  renderLayers();
  if (typeof fitToScreen === 'function') {
    fitToScreen();
  }
  updateLayerList(engine);
}

export function applyCanvasToActiveLayer(canvas) {
  const ctx = layers[activeLayer].getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  renderLayers();
}

export function positionFloatingSelection(engine, canvas, width, height) {
  const cx = Math.floor(bmp.width / 2 - width / 2);
  const cy = Math.floor(bmp.height / 2 - height / 2);
  engine.selection = {
    rect: { x: cx, y: cy, w: width, h: height },
    floatCanvas: canvas,
    pos: { x: cx, y: cy },
  };
  engine.requestRepaint();
}

export function applySnapshotToDocument({ engine, fitToScreen, image }) {
  const { width, height, dataURL } = image;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      createDocument({ engine, fitToScreen, width, height, backgroundColor: '#ffffff' });
      applyCanvasToActiveLayer(img);
      engine.requestRepaint();
      resolve();
    };
    img.onerror = () => reject(new Error('Failed to restore snapshot image'));
    img.src = dataURL;
  });
}
