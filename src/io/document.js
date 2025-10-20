import {
  bmp,
  clipCanvas,
  layers,
  activeLayer,
  renderLayers,
  updateLayerList,
  addLayer,
} from '../core/layer.js';
import { createEmptyVectorLayer, cloneVectorLayer } from '../core/vector-layer-state.js';

function configureLayerDimensions(width, height) {
  layers.forEach((layer) => {
    layer.width = width;
    layer.height = height;
    layer.getContext('2d').clearRect(0, 0, width, height);
  });
}

export function createDocument({
  engine,
  fitToScreen,
  width = 1280,
  height = 720,
  backgroundColor = '#ffffff',
  vectorLayer = null,
} = {}) {
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

  if (engine?.store?.set) {
    const nextLayer = vectorLayer ? cloneVectorLayer(vectorLayer) : createEmptyVectorLayer();
    engine.store.set({ vectorLayer: nextLayer });
  }

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

export function applySnapshotToDocument({ engine, fitToScreen, snapshot }) {
  const { width, height, dataURL, vectorLayer } = snapshot;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      createDocument({
        engine,
        fitToScreen,
        width,
        height,
        backgroundColor: '#ffffff',
        vectorLayer,
      });
      applyCanvasToActiveLayer(img);
      engine.requestRepaint();
      resolve();
    };
    img.onerror = () => reject(new Error('Failed to restore snapshot image'));
    img.src = dataURL;
  });
}
