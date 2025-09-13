// 二段
function makePreviewRefine(store) {
  const id = 'preview-refine';
  let pts = [];
  let drawing = false;

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();
      drawing = true;
      pts = [{ ...ev.img }];
    },

    onPointerMove(ctx, ev) {
      if (!drawing) return;
      pts.push({ ...ev.img });
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;
      pts.push({ ...ev.img });

      const s = store.getToolState(id) || {};
      const size = Math.max(s.brushSize || 0, 0);
      const path = buildSmoothPath(pts, size);

      if (path.length === 0 || size <= 0) {
        pts = [];
        eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.();
        return;
      }

      const r = size / 2;
      let minX = path[0].x, maxX = path[0].x, minY = path[0].y, maxY = path[0].y;

      ctx.save();
      ctx.fillStyle = s.primaryColor || '#000';
      for (const p of path) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      ctx.restore();

      eng.expandPendingRectByRect?.(
        minX - r,
        minY - r,
        (maxX - minX) + r * 2,
        (maxY - minY) + r * 2
      );

      pts = [];
      eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.();
    },

    drawPreview(octx) {
      if (!drawing || pts.length < 2) return;
      const s = store.getToolState(id) || {};
      const lw = Math.max(s.brushSize || 1, 1);
      const off = lw <= 1 ? 0.5 : 0; // 1px線のみ0.5補正

      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.strokeStyle = s.primaryColor || '#000';
      octx.lineWidth = lw;
      octx.beginPath();
      octx.moveTo(pts[0].x + off, pts[0].y + off);
      for (let i = 1; i < pts.length; i++) {
        octx.lineTo(pts[i].x + off, pts[i].y + off);
      }
      octx.stroke();
      octx.restore();
    },
  };

  function buildSmoothPath(pts, size) {
    if (!pts || pts.length === 0) return [];
    const sm = emaSmooth(pts, 0.5);
    const cr = centripetalCRSpline(sm, 16);
    const ds = Math.max((size || 0) / 2, 0.5); // 下限確保
    const rs = resampleByDistance(cr, ds);
    // 終点保障
    if (cr.length > 0) {
      const last = cr[cr.length - 1];
      const tail = rs[rs.length - 1];
      if (!tail || tail.x !== last.x || tail.y !== last.y) rs.push({ x: last.x, y: last.y });
    }
    return rs;
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
    if (pts.length < 2) return pts.slice();
    const out = [];
    const alpha = 0.5;
    const EPS = 1e-6;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;

      const d01 = Math.max(Math.hypot(p1.x - p0.x, p1.y - p0.y), EPS);
      const d12 = Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y), EPS);
      const d23 = Math.max(Math.hypot(p3.x - p2.x, p3.y - p2.y), EPS);

      const t0 = 0;
      const t1 = t0 + Math.pow(d01, alpha);
      const t2 = t1 + Math.pow(d12, alpha);
      const t3 = t2 + Math.pow(d23, alpha);

      for (let j = 0; j < seg; j++) { // 重複点削減
        const t = t1 + ((t2 - t1) * j) / seg;

        const A1 = lerpPoint(p0, p1, (t1 - t) / Math.max(t1 - t0, EPS));
        const A2 = lerpPoint(p1, p2, (t2 - t) / Math.max(t2 - t1, EPS));
        const A3 = lerpPoint(p2, p3, (t3 - t) / Math.max(t3 - t2, EPS));

        const B1 = lerpPoint(A1, A2, (t2 - t) / Math.max(t2 - t0, EPS));
        const B2 = lerpPoint(A2, A3, (t3 - t) / Math.max(t3 - t1, EPS));

        out.push(lerpPoint(B1, B2, (t2 - t) / Math.max(t2 - t1, EPS)));
      }
    }
    out.push(pts[pts.length - 1]); // 最終点を追加
    return out;
  }

  // 注: t は「a の重み」に寄る（元仕様踏襲）
  function lerpPoint(a, b, t) {
    return { x: a.x + (b.x - a.x) * (1 - t), y: a.y + (b.y - a.y) * (1 - t) };
  }

  function resampleByDistance(pts, ds) {
    if (!pts || pts.length === 0) return [];
    if (!(ds > 0)) return pts.slice();

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
