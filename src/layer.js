import { updateLayerList as panelUpdateLayerList } from './gui/panels.js';

export const bmp = document.createElement('canvas');
export const bctx = bmp.getContext('2d', { willReadFrequently: true });
export const clipCanvas = document.createElement('canvas');
const clipCtx = clipCanvas.getContext('2d');

export const layers = [];
export let activeLayer = 0;

export function flattenLayers(ctx) {
  ctx.clearRect(0, 0, bmp.width, bmp.height);
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (!l.visible) continue;
    ctx.save();
    ctx.globalAlpha = l.opacity ?? 1;
    ctx.globalCompositeOperation = l.mode || 'source-over';
    if (l.clip && i > 0) {
      clipCtx.clearRect(0, 0, bmp.width, bmp.height);
      clipCtx.drawImage(layers[i - 1], 0, 0);
      clipCtx.globalCompositeOperation = 'source-in';
      clipCtx.drawImage(l, 0, 0);
      ctx.drawImage(clipCanvas, 0, 0);
    } else {
      ctx.drawImage(l, 0, 0);
    }
    ctx.restore();
  }
}

export function renderLayers() {
  flattenLayers(bctx);
}

export function updateLayerList(engine) {
  const callbacks = {
    onSelect: i => setActiveLayer(i, engine),
    onVisibility: (i, visible) => {
      layers[i].visible = visible;
      renderLayers();
      engine.requestRepaint();
    },
    onOpacity: (i, opacity) => {
      layers[i].opacity = opacity;
      renderLayers();
      engine.requestRepaint();
    },
    onBlendMode: (i, mode) => {
      layers[i].mode = mode;
      renderLayers();
      engine.requestRepaint();
    },
    onClip: (i, clip) => {
      layers[i].clip = clip;
      renderLayers();
      engine.requestRepaint();
    },
    onRename: (i, name) => {
      layers[i].name = name;
      updateLayerList(engine);
    },
    onMove: (from, to) => moveLayer(from, to, engine)
  };
  panelUpdateLayerList(layers, activeLayer, callbacks);
}

export function setActiveLayer(i, engine) {
  if (i < 0 || i >= layers.length) return;
  activeLayer = i;
  updateLayerList(engine);
  renderLayers();
  engine.requestRepaint();
}

export function moveLayer(from, to, engine) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= layers.length ||
    to >= layers.length
  ) return;
  const [l] = layers.splice(from, 1);
  layers.splice(to, 0, l);
  engine.history.stack.forEach(p => {
    if (p.layer === from) p.layer = to;
    else if (from < to && p.layer > from && p.layer <= to) p.layer--;
    else if (to < from && p.layer >= to && p.layer < from) p.layer++;
  });
  setActiveLayer(to, engine);
  renderLayers();
  updateLayerList(engine);
}

export function addLayer(engine) {
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.visible = true;
  c.opacity = 1;
  c.mode = 'source-over';
  c.clip = false;
  if (c._id == null)
    c._id =
      crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : 'L' + Date.now() + Math.random().toString(16).slice(2);
  if (typeof c.name !== 'string' || !c.name)
    c.name = `Layer ${layers.length + 1}`;
  const idx = Math.min(activeLayer + 1, layers.length);
  layers.splice(idx, 0, c);
  setActiveLayer(idx, engine);
}

export function deleteLayer(engine) {
  if (layers.length <= 1) return;

  const orig = engine.history.stack;
  let removedBefore = 0;
  const filtered = [];
  orig.forEach((p, i) => {
    if (p.layer === activeLayer) {
      if (i <= engine.history.index) removedBefore++;
      return;
    }
    if (p.layer > activeLayer) p.layer--;
    filtered.push(p);
  });
  engine.history.stack = filtered;
  engine.history.index = Math.max(
    -1,
    Math.min(filtered.length - 1, engine.history.index - removedBefore)
  );

  layers.splice(activeLayer, 1);
  if (activeLayer >= layers.length) activeLayer = layers.length - 1;
  setActiveLayer(activeLayer, engine);
}
