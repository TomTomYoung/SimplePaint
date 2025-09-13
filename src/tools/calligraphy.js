function makeCalligraphy(store) {
  const id = 'calligraphy';
  let drawing = false;
  let last = null;

  function drawStamp(ctx, x, y, s, eng) {
    const angle = ((s.penAngle ?? 45) * Math.PI) / 180;
    const kappa = s.kappa ?? 2;
    const shortR = Math.max(s.brushSize, s.w_min ?? 1);
    const longR = shortR * kappa;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const rx = longR * cos + shortR * sin;
    const ry = longR * sin + shortR * cos;

    ctx.save();
    ctx.translate(x + 0.5, y + 0.5);
    ctx.rotate(angle);
    ctx.fillStyle = s.primaryColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, longR, shortR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    eng.expandPendingRectByRect(x - rx, y - ry, rx * 2, ry * 2);
  }

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      drawing = true;
      last = { ...ev.img };
      const s = store.getToolState(id);
      drawStamp(ctx, last.x, last.y, s, eng);
    },

    onPointerMove(ctx, ev, eng) {
      if (!drawing || !last) return;
      const p = { ...ev.img };
      const s = store.getToolState(id);
      const spacing = (s.spacingRatio ?? 0.4) * s.brushSize;
      let dx = p.x - last.x;
      let dy = p.y - last.y;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) return;
      let t = spacing;
      while (t <= dist) {
        const x = last.x + (dx * t) / dist;
        const y = last.y + (dy * t) / dist;
        drawStamp(ctx, x, y, s, eng);
        t += spacing;
      }
      last = p;
    },

    onPointerUp() {
      drawing = false;
      last = null;
    },

    drawPreview() {},
  };
}

