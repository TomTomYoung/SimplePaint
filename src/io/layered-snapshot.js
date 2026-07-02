import {
  bmp,
  clipCanvas,
  layers,
  activeLayer,
  renderLayers,
  updateLayerList,
  setActiveLayer,
  markLayerPreviewDirty,
} from '../core/layer.js';
import { cloneVectorLayer, createEmptyVectorLayer } from '../core/vector-layer-state.js';

const SNAPSHOT_VERSION = 2;
const VALID_LAYER_TYPES = new Set(['raster', 'vector', 'text']);

const normaliseLayerType = layer => {
  const type = typeof layer?.layerType === 'string' ? layer.layerType : 'raster';
  return VALID_LAYER_TYPES.has(type) ? type : 'raster';
};

const serialiseLayer = layer => {
  const type = normaliseLayerType(layer);
  const entry = {
    id: typeof layer._id === 'string' ? layer._id : null,
    name: typeof layer.name === 'string' ? layer.name : '',
    type,
    visible: layer.visible !== false,
    opacity: Number.isFinite(layer.opacity) ? layer.opacity : 1,
    mode: typeof layer.mode === 'string' && layer.mode ? layer.mode : 'source-over',
    clip: layer.clip === true,
    dataURL: layer.toDataURL('image/png'),
  };

  if (type === 'vector') {
    entry.vectorData = cloneVectorLayer(layer.vectorData ?? null);
  }

  return entry;
};

export function createLayeredSnapshot(engine) {
  return {
    version: SNAPSHOT_VERSION,
    width: bmp.width,
    height: bmp.height,
    activeLayer,
    layers: layers.map(serialiseLayer),
    store: engine?.store?.getState?.() ?? null,
    selection: null,
    ts: Date.now(),
  };
}

function loadCanvasFromDataURL(dataURL, width, height) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    if (!dataURL) {
      resolve(canvas);
      return;
    }

    const image = new Image();
    image.onload = () => {
      canvas.getContext('2d').drawImage(image, 0, 0);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error('Failed to load layer snapshot image'));
    image.src = dataURL;
  });
}

function applyLayerMetadata(canvas, entry, index) {
  const type = VALID_LAYER_TYPES.has(entry?.type) ? entry.type : 'raster';
  canvas.visible = entry?.visible !== false;
  canvas.opacity = Number.isFinite(entry?.opacity) ? entry.opacity : 1;
  canvas.mode = typeof entry?.mode === 'string' && entry.mode ? entry.mode : 'source-over';
  canvas.clip = entry?.clip === true;
  canvas.layerType = type;
  canvas.vectorData = type === 'vector'
    ? cloneVectorLayer(entry?.vectorData ?? createEmptyVectorLayer())
    : null;
  canvas._id = typeof entry?.id === 'string' && entry.id
    ? entry.id
    : `L${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
  canvas.name = typeof entry?.name === 'string' && entry.name
    ? entry.name
    : type === 'vector'
      ? `Vector Layer ${index + 1}`
      : `Layer ${index + 1}`;
  return canvas;
}

export async function applyLayeredSnapshot({ engine, fitToScreen, snapshot }) {
  if (!snapshot || snapshot.version !== SNAPSHOT_VERSION || !Array.isArray(snapshot.layers)) {
    throw new TypeError('Unsupported layered snapshot');
  }

  const width = Math.max(1, Number.parseInt(snapshot.width, 10) || 1);
  const height = Math.max(1, Number.parseInt(snapshot.height, 10) || 1);

  bmp.width = width;
  bmp.height = height;
  clipCanvas.width = width;
  clipCanvas.height = height;
  layers.length = 0;

  const entries = snapshot.layers.length > 0
    ? snapshot.layers
    : [{ type: 'raster', name: 'Layer 1', visible: true, opacity: 1, mode: 'source-over', clip: false }];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const canvas = await loadCanvasFromDataURL(entry?.dataURL, width, height);
    layers.push(applyLayerMetadata(canvas, entry, index));
  }

  if (snapshot.store && engine?.store?.replaceState) {
    engine.store.replaceState(snapshot.store, { silent: true });
  }

  if (engine?.clearSelection) {
    engine.clearSelection();
  }

  renderLayers();
  layers.forEach(layer => markLayerPreviewDirty(layer));

  const requestedActiveLayer = Number.isInteger(snapshot.activeLayer) ? snapshot.activeLayer : 0;
  const nextActiveLayer = Math.min(Math.max(requestedActiveLayer, 0), layers.length - 1);
  setActiveLayer(nextActiveLayer, engine);

  if (typeof fitToScreen === 'function') {
    fitToScreen();
  }
  updateLayerList(engine);
  engine?.requestRepaint?.();
}

export function isLayeredSnapshot(snapshot) {
  return snapshot?.version === SNAPSHOT_VERSION && Array.isArray(snapshot.layers);
}
