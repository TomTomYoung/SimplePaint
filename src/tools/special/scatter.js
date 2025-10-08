export function makeScatter(store) {
  const id = 'scatter';
  let drawing = false;
  let last = null;
  let acc = 0;
  let nextSpacing = 0;
  let prob = 0.5;

  function randSpacing(s) {
    const base = s.brushSize || 1;
    return base * (0.8 + Math.random() * 0.4);
  }

  function randProb() {
    return 0.3 + Math.random() * 0.5;
  }

  function randScale() {
    return 0.7 + Math.random() * 0.6;
  }

  function randRotation() {
    const deg = 20 + Math.random() * 20;
    const sign = Math.random() < 0.5 ? -1 : 1;
    return (deg * sign * Math.PI) / 180;
  }

  function randJitter(size) {
    return (Math.random() - 0.5) * size * 0.3;
  }

  function stamp(ctx, x, y, s, eng) {
    if (Math.random() > prob) return;
    const size = s.brushSize || 0;
    if (size <= 0) return;
    const sc = randScale();
    const rot = randRotation();
    const jx = randJitter(size);
    const jy = randJitter(size);
    const r = (size * sc) / 2 + Math.max(Math.abs(jx), Math.abs(jy));

    ctx.save();
    ctx.translate(x + jx, y + jy);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    ctx.fillStyle = s.primaryColor;
    ctx.beginPath();
    const rad = size / 2;
    ctx.moveTo(0, -rad);
    ctx.bezierCurveTo(rad, -rad / 2, rad, rad / 2, 0, rad);
    ctx.bezierCurveTo(-rad, rad / 2, -rad, -rad / 2, 0, -rad);
    ctx.fill();
    ctx.restore();

    eng.expandPendingRectByRect(x - r, y - r, r * 2, r * 2);
  }

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,
    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      drawing = true;
      last = { ...ev.img };
      acc = 0;
      const s = store.getToolState(id);
      prob = randProb();
      nextSpacing = randSpacing(s);
      stamp(ctx, last.x, last.y, s, eng);
    },
    onPointerMove(ctx, ev, eng) {
      if (!drawing || !last) return;
      const p = { ...ev.img };
      const s = store.getToolState(id);
      const EPS = 1e-6;
      let dx = p.x - last.x;
      let dy = p.y - last.y;
      let dist = Math.hypot(dx, dy);
      if (dist < EPS) {
        acc += dist;
        last = p;
        return;
      }
      while (acc + dist >= nextSpacing) {
        const t = (nextSpacing - acc) / dist;
        const nx = last.x + dx * t;
        const ny = last.y + dy * t;
        stamp(ctx, nx, ny, s, eng);
        last = { x: nx, y: ny };
        dx = p.x - last.x;
        dy = p.y - last.y;
        dist = Math.hypot(dx, dy);
        nextSpacing = randSpacing(s);
        acc = 0;
        if (dist < EPS) break;
      }
      acc += dist;
      last = p;
    },
    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;
      const s = store.getToolState(id);
      const p = { ...ev.img };
      stamp(ctx, p.x, p.y, s, eng);
      last = null;
      acc = 0;
    },
    drawPreview() {},
  };
}
