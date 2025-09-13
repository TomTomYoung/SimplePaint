function makePreviewRefine(store) {
  const id = 'preview-refine';
  let pts = [];
  let drawing = false;
  return {
    id,
    cursor: 'crosshair',
    previewRect: null,
    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      drawing = true;
      pts = [{ ...ev.img }];
      eng.beginStrokeSnapshot?.();
    },
    onPointerMove(ctx, ev) {
      if (!drawing) return;
      pts.push({ ...ev.img });
    },
    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;
      pts.push({ ...ev.img });
      const s = store.getToolState(id);
      const path = buildSmoothPath(pts, s.brushSize);
      const r = s.brushSize / 2;
      let minX = path[0]?.x ?? 0;
      let maxX = minX;
      let minY = path[0]?.y ?? 0;
      let maxY = minY;
      ctx.save();
      ctx.fillStyle = s.primaryColor;
      for (const p of path) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      ctx.restore();
      eng.expandPendingRectByRect(
        minX - r,
        minY - r,
        maxX - minX + r * 2,
        maxY - minY + r * 2
      );
      pts = [];
    },
    drawPreview(octx) {
      if (!drawing || pts.length < 2) return;
      const s = store.getToolState(id);
      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.strokeStyle = s.primaryColor;
      octx.lineWidth = s.brushSize;
      octx.beginPath();
      octx.moveTo(pts[0].x + 0.5, pts[0].y + 0.5);
      for (let i = 1; i < pts.length; i++) {
        octx.lineTo(pts[i].x + 0.5, pts[i].y + 0.5);
      }
      octx.stroke();
      octx.restore();
    },
  };

  function buildSmoothPath(pts, size) {
    const sm = emaSmooth(pts, 0.5);
    const cr = centripetalCRSpline(sm, 16);
    const ds = size / 2;
    return resampleByDistance(cr, ds);
  }
  function emaSmooth(points, alpha) {
    if (points.length === 0) return [];
    const out = [{ ...points[0] }];
    for (let i = 1; i < points.length; i++) {
      const prev = out[out.length - 1];
      const p = points[i];
      out.push({
        x: alpha * p.x + (1 - alpha) * prev.x,
        y: alpha * p.y + (1 - alpha) * prev.y,
      });
    }
    return out;
  }
  function centripetalCRSpline(pts, seg = 16) {
    if (pts.length < 2) return pts;
    const out = [];
    const alpha = 0.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const d23 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
      const t0 = 0;
      const t1 = t0 + Math.pow(d01, alpha);
      const t2 = t1 + Math.pow(d12, alpha);
      const t3 = t2 + Math.pow(d23, alpha);
      for (let j = 0; j <= seg; j++) {
        const t = t1 + ((t2 - t1) * j) / seg;
        const A1 = lerpPoint(p0, p1, (t1 - t) / (t1 - t0));
        const A2 = lerpPoint(p1, p2, (t2 - t) / (t2 - t1));
        const A3 = lerpPoint(p2, p3, (t3 - t) / (t3 - t2));
        const B1 = lerpPoint(A1, A2, (t2 - t) / (t2 - t0));
        const B2 = lerpPoint(A2, A3, (t3 - t) / (t3 - t1));
        out.push(lerpPoint(B1, B2, (t2 - t) / (t2 - t1)));
      }
    }
    return out;
  }
  function lerpPoint(a, b, t) {
    return { x: a.x + (b.x - a.x) * (1 - t), y: a.y + (b.y - a.y) * (1 - t) };
  }
  function resampleByDistance(pts, ds) {
    if (pts.length === 0) return [];
    const out = [pts[0]];
    let prev = pts[0];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      let curr = pts[i];
      let segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      if (segLen === 0) continue;
      while (acc + segLen >= ds) {
        const t = (ds - acc) / segLen;
        const nx = prev.x + (curr.x - prev.x) * t;
        const ny = prev.y + (curr.y - prev.y) * t;
        const np = { x: nx, y: ny };
        out.push(np);
        prev = np;
        segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        acc = 0;
      }
      acc += segLen;
      prev = curr;
    }
    return out;
  }
}
