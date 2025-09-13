function makeSdfStroke(store) {
  const id = 'sdf-stroke';
  const pts = [];
  let drawing = false;

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      eng.beginStrokeSnapshot();
      drawing = true;
      pts.length = 0;
      pts.push({ ...ev.img });
      const s = store.getToolState(id);
      const rect = drawSegment(ctx, ev.img, ev.img, s);
      eng.expandPendingRectByRect(rect.x, rect.y, rect.w, rect.h);
    },

    onPointerMove(ctx, ev, eng) {
      if (!drawing) return;
      const p = { ...ev.img };
      const s = store.getToolState(id);
      const rect = drawSegment(ctx, pts[pts.length - 1], p, s);
      eng.expandPendingRectByRect(rect.x, rect.y, rect.w, rect.h);
      pts.push(p);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;
      pts.length = 0;
    },

    drawPreview() {},
  };

  function drawSegment(ctx, p0, p1, s) {
    const r = s.brushSize / 2;
    const aa = 1;
    const minX = Math.floor(Math.min(p0.x, p1.x) - r - aa);
    const minY = Math.floor(Math.min(p0.y, p1.y) - r - aa);
    const maxX = Math.ceil(Math.max(p0.x, p1.x) + r + aa);
    const maxY = Math.ceil(Math.max(p0.y, p1.y) + r + aa);
    const w = maxX - minX;
    const h = maxY - minY;
    const img = ctx.getImageData(minX, minY, w, h);
    const data = img.data;
    const col = hexToRgb(s.primaryColor);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = minX + x + 0.5;
        const py = minY + y + 0.5;
        const d = pointSegmentDistance(px, py, p0.x, p0.y, p1.x, p1.y);
        const t = (r + aa - d) / (aa * 2);
        if (t <= 0) continue;
        const cov = t >= 1 ? 1 : t * t * (3 - 2 * t);
        if (cov <= 0) continue;
        const idx = (y * w + x) * 4;
        const inv = 1 - cov;
        data[idx] = col.r * cov + data[idx] * inv;
        data[idx + 1] = col.g * cov + data[idx + 1] * inv;
        data[idx + 2] = col.b * cov + data[idx + 2] * inv;
        data[idx + 3] = 255 * cov + data[idx + 3] * inv;
      }
    }
    ctx.putImageData(img, minX, minY);
    return { x: minX, y: minY, w, h };
  }

  function pointSegmentDistance(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(px - x0, py - y0);
    let t = ((px - x0) * dx + (py - y0) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x0 + t * dx;
    const projY = y0 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  function hexToRgb(hex) {
    const n = hex.startsWith('#') ? hex.slice(1) : hex;
    const v = parseInt(n.length === 3 ? n.replace(/(.)/g, '$1$1') : n, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
}

window.makeSdfStroke = makeSdfStroke;
