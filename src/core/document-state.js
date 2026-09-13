import { bmp, layers, activeLayer, replaceDocumentLayers } from './layer.js';
import { cloneVectorLayer } from './vector-layer-state.js';

// Full document snapshots are reserved for structural edits. Strokes use pixel patches.
export function captureDocumentState() {
  return {
    width: bmp.width,
    height: bmp.height,
    activeLayer,
    layers: layers.map(layer => ({
      id: layer._id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      mode: layer.mode,
      clip: layer.clip,
      layerType: layer.layerType,
      vectorData: layer.vectorData ? cloneVectorLayer(layer.vectorData) : null,
      pixels: layer.getContext('2d').getImageData(0, 0, layer.width, layer.height),
    })),
  };
}

export function restoreDocumentState(state, engine) {
  const restored = state.layers.map(entry => {
    const canvas = document.createElement('canvas');
    canvas.width = state.width;
    canvas.height = state.height;
    canvas.getContext('2d').putImageData(entry.pixels, 0, 0);
    Object.assign(canvas, {
      _id: entry.id, name: entry.name, visible: entry.visible,
      opacity: entry.opacity, mode: entry.mode, clip: entry.clip,
      layerType: entry.layerType,
      vectorData: entry.vectorData ? cloneVectorLayer(entry.vectorData) : null,
    });
    return canvas;
  });
  replaceDocumentLayers(restored, state.width, state.height, state.activeLayer, engine);
}
