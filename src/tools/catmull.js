import { catmullRomSpline } from '../spline.js';
import { bctx } from '../layer.js';
import { engine } from '../main.js';

export function makeCatmull(store) {
  let pts = [],
    fresh = true;
  const reset = () => {
    pts = [];
    fresh = true;
  };
  function finalize(ctx, eng) {
    if (pts.length < 4) {
      reset();
      eng.requestRepaint();
      return;
    }
    const s = store.getState();
    const cr = catmullRomSpline(pts);
    ctx.save();
    ctx.lineWidth = s.brushSize;
    ctx.strokeStyle = s.primaryColor;
    ctx.beginPath();
    ctx.moveTo(cr[0].x + 0.5, cr[0].y + 0.5);
    for (let i = 1; i < cr.length; i++)
      ctx.lineTo(cr[i].x + 0.5, cr[i].y + 0.5);
    ctx.stroke();
    ctx.restore();
    let minX = cr[0].x,
      maxX = cr[0].x,
      minY = cr[0].y,
      maxY = cr[0].y;
    cr.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
    eng.expandPendingRectByRect(
      minX - s.brushSize,
      minY - s.brushSize,
      maxX - minX + s.brushSize * 2,
      maxY - minY + s.brushSize * 2,
    );
    eng.finishStrokeToHistory();
    eng.requestRepaint();
    reset();
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finalize(bctx, engine);
  });
  return {
    id: 'catmull',
    cursor: 'crosshair',
    previewRect: null,
    cancel() {
      reset();
      engine.requestRepaint();
    },
    onPointerDown(ctx, ev, eng) {
      console.log(ev);
      // Double click: add point then finalize
      if (ev.button === 0 && ev.detail === 2) {
        if (pts.length === 0) eng.beginStrokeSnapshot();
        pts.push({ ...ev.img });
        finalize(ctx, eng);
        return;
        }
      if (fresh) {
        pts = [];
        fresh = false;
      }
      pts.push({ ...ev.img });
    },
    onPointerMove() {},
    onPointerUp() {},
    drawPreview(octx) {
      if (pts.length > 1) {
        const cr = catmullRomSpline(pts);
        octx.save();
        octx.lineWidth = store.getState().brushSize;
        octx.strokeStyle = store.getState().primaryColor;
        octx.beginPath();
        octx.moveTo(cr[0].x + 0.5, cr[0].y + 0.5);
        for (let i = 1; i < cr.length; i++)
          octx.lineTo(cr[i].x + 0.5, cr[i].y + 0.5);
        octx.stroke();
        octx.restore();
      }
    },
  };
}
