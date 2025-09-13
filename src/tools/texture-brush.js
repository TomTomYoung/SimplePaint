function makeTextureBrush(store) {
  const id = 'texture-brush';
  const texture = createTexture();
  let drawing = false;
  let last = null;
  let acc = 0;

  function stamp(ctx, x, y, angle, s, eng) {
    const scale = s.brushSize / texture.width;
    const scatterRange = s.brushSize / 5;
    const sx = x + gaussianRandom() * scatterRange;
    const sy = y + gaussianRandom() * scatterRange;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.drawImage(texture, -texture.width / 2, -texture.height / 2);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = s.primaryColor;
    ctx.fillRect(-texture.width / 2, -texture.height / 2, texture.width, texture.height);
    ctx.restore();

    const w = texture.width * scale;
    const h = texture.height * scale;
    const r = Math.sqrt(w * w + h * h) / 2 + scatterRange;
    eng.expandPendingRectByRect(sx - r, sy - r, r * 2, r * 2);
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
      stamp(ctx, last.x, last.y, 0, s, eng);
    },
    onPointerMove(ctx, ev, eng) {
      if (!drawing || !last) return;
      const p = { ...ev.img };
      const s = store.getToolState(id);
      const spacing = Math.max(1, s.brushSize * (s.spacingRatio ?? 0.4));
      let dx = p.x - last.x;
      let dy = p.y - last.y;
      let dist = Math.hypot(dx, dy);
      let angle = Math.atan2(dy, dx);

      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;
        const nx = last.x + dx * t;
        const ny = last.y + dy * t;
        stamp(ctx, nx, ny, angle, s, eng);
        last = { x: nx, y: ny };
        dx = p.x - last.x;
        dy = p.y - last.y;
        dist = Math.hypot(dx, dy);
        angle = Math.atan2(dy, dx);
        acc = 0;
      }
      acc += dist;
      last = p;
    },
    onPointerUp() {
      drawing = false;
      last = null;
      acc = 0;
    },
    drawPreview() {},
  };

  function createTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 64;
    const tctx = cvs.getContext('2d');
    const img = tctx.createImageData(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const dx = x - 32;
        const dy = y - 32;
        if (Math.hypot(dx, dy) <= 32) {
          const i = (y * 64 + x) * 4;
          img.data[i] = 255;
          img.data[i + 1] = 255;
          img.data[i + 2] = 255;
          const dist = Math.hypot(dx, dy) / 32;
          const alpha = (1 - dist) * Math.random() * 255;
          img.data[i + 3] = alpha;
        }
      }
    }
    tctx.putImageData(img, 0, 0);
    return cvs;
  }

  function gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
