import { nurbs, computeAABB } from '../../utils/geometry/index.js';
import { engine } from '../../main.js';

export function makeNURBS(store) {
  const id = 'nurbs';
  let pts = [],
    ws = [],
    hover = null;

  function finalize(ctx, eng) {
    if (pts.length < 4) return;
    const s = store.getToolState(id);
    const cr = nurbs(pts, ws);
    if (!cr.length) {
      pts = [];
      ws = [];
      hover = null;
      store.setToolState(id, { nurbsWeight: 1 });
      eng.requestRepaint();
      return;
    }
    ctx.save();
    ctx.lineWidth = s.brushSize;
    ctx.strokeStyle = s.primaryColor;
    ctx.beginPath();
    ctx.moveTo(cr[0].x + 0.5, cr[0].y + 0.5);
    for (let i = 1; i < cr.length; i++) {
      const p = cr[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      ctx.lineTo(p.x + 0.5, p.y + 0.5);
    }
    ctx.stroke();
    ctx.restore();

    const bounds = computeAABB(cr);
    if (bounds) {
      eng.expandPendingRectByRect(
        bounds.minX - s.brushSize,
        bounds.minY - s.brushSize,
        bounds.maxX - bounds.minX + s.brushSize * 2,
        bounds.maxY - bounds.minY + s.brushSize * 2,
      );
    }
    eng.finishStrokeToHistory();
    eng.requestRepaint();

    pts = [];
    ws = [];
    hover = null;
    store.setToolState(id, { nurbsWeight: 1 });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finalize(engine.ctx, engine);
  });

  return {
    id: 'nurbs',
    cursor: 'crosshair',
    previewRect: null,
    onPointerDown(ctx, ev, eng) {
      if (ev.button === 0 && ev.detail === 2) {
        if (pts.length === 0) eng.beginStrokeSnapshot();
        pts.push({ ...ev.img });
        const w = parseFloat(store.getToolState(id).nurbsWeight);
        ws.push(Number.isFinite(w) && w > 0 ? w : 1);
        finalize(ctx, eng);
        return;
      }
      if (pts.length === 0) eng.beginStrokeSnapshot();
      pts.push({ ...ev.img });
      const w = parseFloat(store.getToolState(id).nurbsWeight);
      ws.push(Number.isFinite(w) && w > 0 ? w : 1);
    },
    onPointerMove(ctx, ev) {
      hover = { ...ev.img };
    },
    onPointerUp() {},
    drawPreview(octx) {
      const s = store.getToolState(id);
      octx.save();
      octx.lineWidth = s.brushSize;
      octx.strokeStyle = s.primaryColor;

      const need = 4;
      if (pts.length >= need) {
        const srcPts = hover ? [...pts, hover] : pts;
        const srcWs = hover ? [...ws, 1] : ws;
        const cr = nurbs(srcPts, srcWs);
        if (cr.length >= 2) {
          octx.beginPath();
          octx.moveTo(cr[0].x + 0.5, cr[0].y + 0.5);
          for (let i = 1; i < cr.length; i++) {
            const p = cr[i];
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
            octx.lineTo(p.x + 0.5, p.y + 0.5);
          }
          octx.stroke();
        }
      } else if (pts.length >= 1) {
        const poly = hover ? [...pts, hover] : pts;
        if (poly.length >= 2) {
          octx.beginPath();
          octx.moveTo(poly[0].x + 0.5, poly[0].y + 0.5);
          for (let i = 1; i < poly.length; i++) {
            octx.lineTo(poly[i].x + 0.5, poly[i].y + 0.5);
          }
          octx.stroke();
        } else if (poly.length === 1 && hover) {
          octx.beginPath();
          octx.moveTo(poly[0].x + 0.5, poly[0].y + 0.5);
          octx.lineTo(hover.x + 0.5, hover.y + 0.5);
          octx.stroke();
        }
      }
      octx.restore();
    },
  };
}
