function makeTessellatedStroke(store) {
  const id = 'tess-stroke';
  let drawing = false;
  const pts = [];

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
      eng.expandPendingRect(ev.img.x, ev.img.y, s.brushSize);
    },

    onPointerMove(ctx, ev, eng) {
      if (!drawing) return;
      const p = { ...ev.img };
      pts.push(p);
      const s = store.getToolState(id);
      tessSegment(ctx, pts[pts.length - 2], p, s);
      eng.expandPendingRect(p.x, p.y, s.brushSize);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;
      const p = { ...ev.img };
      pts.push(p);
      const s = store.getToolState(id);
      tessellateStroke(ctx, pts, s);
      pts.length = 0;
    },
  };

  function tessSegment(ctx, p0, p1, s) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.primaryColor;
    ctx.lineWidth = s.brushSize;
    ctx.beginPath();
    ctx.moveTo(p0.x + 0.01, p0.y + 0.01);
    ctx.lineTo(p1.x + 0.01, p1.y + 0.01);
    ctx.stroke();
    ctx.restore();
  }

  // Simple tessellation using offset polygons.
  function tessellateStroke(ctx, points, s) {
    if (points.length < 2) return;
    const half = s.brushSize / 2;
    const left = [];
    const right = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (!len) continue;
      const nx = (-dy / len) * half;
      const ny = (dx / len) * half;
      left.push({ x: p0.x + nx, y: p0.y + ny });
      right.push({ x: p0.x - nx, y: p0.y - ny });
      if (i === points.length - 2) {
        left.push({ x: p1.x + nx, y: p1.y + ny });
        right.push({ x: p1.x - nx, y: p1.y - ny });
      }
    }

    ctx.save();
    ctx.fillStyle = s.primaryColor;
    ctx.beginPath();
    if (left.length) {
      ctx.moveTo(left[0].x, left[0].y);
      for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
      ctx.closePath();
    }
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

window.makeTessellatedStroke = makeTessellatedStroke;
