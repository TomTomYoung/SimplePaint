import { DEFAULT_TOOL_MANIFEST } from '../../src/tools/base/manifest.js';

function makeStarBrush(store) {
  const id = 'star-brush';
  const stamp = new Path2D('M12 2 L15 9 H22 L17 13 L19 20 L12 16 L5 20 L7 13 L2 9 H9 Z');
  let pointer = null;
  let drawing = false;

  function drawStamp(ctx, event, engine) {
    const { x, y } = event.img;
    const settings = store.getToolState(id);
    const size = settings.brushSize ?? 24;
    const half = size / 2;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = settings.primaryColor ?? '#000000';
    ctx.fill(stamp);
    ctx.restore();

    engine.expandPendingRectByRect(x - half, y - half, size, size);
  }

  return {
    id,
    cursor: 'pointer',
    onPointerDown(ctx, event, engine) {
      pointer = { ...event.img };
      drawing = true;
      engine.clearSelection();
      drawStamp(ctx, event, engine);
    },
    onPointerMove(ctx, event, engine) {
      pointer = { ...event.img };
      if (!drawing) return;
      drawStamp(ctx, event, engine);
    },
    onPointerUp(ctx, event) {
      pointer = { ...event.img };
      drawing = false;
    },
    cancel() {
      pointer = null;
      drawing = false;
    },
    drawPreview(overlayCtx) {
      if (!pointer) return;
      const settings = store.getToolState(id);
      const radius = (settings.brushSize ?? 24) / 2;
      overlayCtx.save();
      overlayCtx.strokeStyle = 'rgba(255,255,255,0.5)';
      overlayCtx.beginPath();
      overlayCtx.arc(pointer.x, pointer.y, radius, 0, Math.PI * 2);
      overlayCtx.stroke();
      overlayCtx.restore();
    },
  };
}

const STAR_BRUSH_ENTRY = Object.freeze({
  id: 'star-brush',
  factory: makeStarBrush,
  categoryId: 'drawing',
});

export function manifestWithStarBrush(manifest = DEFAULT_TOOL_MANIFEST) {
  return Object.freeze(
    manifest.map((category) =>
      category.id === 'drawing'
        ? Object.freeze({
            ...category,
            tools: Object.freeze([...category.tools, STAR_BRUSH_ENTRY]),
          })
        : category,
    ),
  );
}

export function registerStarBrush(engine, store) {
  engine.register(makeStarBrush(store));
  return 'star-brush';
}
