function makeRibbon(store) {
  const id = 'ribbon';
  let drawing = false;
  const pts = [];
  const EPS = 1e-6;

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      drawing = true;
      pts.length = 0;
      pts.push({ ...ev.img });

      const s = store.getToolState(id);
      const w = clampWidth(s.brushSize);
      if (eng.expandPendingRectByRect) {
        eng.expandPendingRectByRect(ev.img.x - w, ev.img.y - w, w * 2, w * 2);
      } else {
        eng.expandPendingRect(ev.img.x, ev.img.y, w * 2);
      }
    },

    onPointerMove(ctx, ev, eng) {
      if (!drawing) return;
      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      const dx = p.x - last.x, dy = p.y - last.y;
      if (Math.hypot(dx, dy) < EPS) return;
      pts.push(p);
      const s = store.getToolState(id);
      const w = clampWidth(s.brushSize);
      if (eng.expandPendingRectByRect) {
        eng.expandPendingRectByRect(p.x - w, p.y - w, w * 2, w * 2);
      } else {
        eng.expandPendingRect(p.x, p.y, w * 2);
      }
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) pts.push(p);

      const s = store.getToolState(id);
      const w = clampWidth(s.brushSize);
      if (pts.length >= 2 && w > 0) {
        const res = resample(pts, w / 2);
        drawRibbon(ctx, res, w, s.primaryColor);

        // invalidate area
        let minX = res[0].x, maxX = res[0].x, minY = res[0].y, maxY = res[0].y;
        for (const q of res) {
          if (q.x < minX) minX = q.x;
          if (q.x > maxX) maxX = q.x;
          if (q.y < minY) minY = q.y;
          if (q.y > maxY) maxY = q.y;
        }
        const pad = w / 2;
        if (eng.expandPendingRectByRect) {
          eng.expandPendingRectByRect(minX - pad, minY - pad, (maxX - minX) + w, (maxY - minY) + w);
        } else {
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const rx = (maxX - minX) / 2 + pad;
          const ry = (maxY - minY) / 2 + pad;
          eng.expandPendingRect(cx - rx, cy - ry, Math.max(rx, ry) * 2);
        }
      }

      pts.length = 0;
    },

    drawPreview() {},
  };

  function clampWidth(w) {
    w = w || 0;
    if (w < 4) w = 4;
    if (w > 16) w = 16;
    return w;
  }

  function resample(points, maxSeg) {
    if (!points || points.length < 2) return points;
    const out = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len < EPS) continue;
      const n = Math.max(1, Math.ceil(len / maxSeg));
      for (let j = 1; j <= n; j++) {
        out.push({ x: p0.x + (dx * j) / n, y: p0.y + (dy * j) / n });
      }
    }
    return out;
  }

  function drawRibbon(ctx, points, width, color) {
    const half = width / 2;
    const left = [], right = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len < EPS) continue;
      const nx = (-dy / len) * half;
      const ny = (dx / len) * half;
      left.push({ x: p0.x + nx, y: p0.y + ny });
      right.push({ x: p0.x - nx, y: p0.y - ny });
      if (i === points.length - 2) {
        left.push({ x: p1.x + nx, y: p1.y + ny });
        right.push({ x: p1.x - nx, y: p1.y - ny });
      }
    }
    if (!left.length) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    // round caps
    const start = points[0];
    const end = points[points.length - 1];
    ctx.moveTo(start.x + half, start.y);
    ctx.arc(start.x, start.y, half, 0, Math.PI * 2);
    ctx.moveTo(end.x + half, end.y);
    ctx.arc(end.x, end.y, half, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
