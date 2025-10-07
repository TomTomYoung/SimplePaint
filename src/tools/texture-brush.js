export function makeTextureBrush(store) {
  const id = 'texture-brush';
  const texture = createTexture();
  const tintCache = new Map(); // color -> tinted canvas
  let drawing = false;
  let last = null;
  let acc = 0;

  function getTintedTexture(color) {
    let tc = tintCache.get(color);
    if (!tc) {
      tc = document.createElement('canvas');
      tc.width = texture.width;
      tc.height = texture.height;
      const tctx = tc.getContext('2d');
      tctx.clearRect(0, 0, tc.width, tc.height);
      // マスクを書き込み
      tctx.drawImage(texture, 0, 0);
      // マスク内だけを着色
      tctx.globalCompositeOperation = 'source-in';
      tctx.fillStyle = color;
      tctx.fillRect(0, 0, tc.width, tc.height);
      tctx.globalCompositeOperation = 'source-over';
      tintCache.set(color, tc);
    }
    return tc;
  }

  function clampGaussian(K = 3) {
    const g = gaussianRandom();
    return Math.max(-K, Math.min(K, g));
  }

  function stamp(ctx, x, y, angle, s, eng) {
    const size = Math.max(s.brushSize || 0, 0);
    if (size <= 0) return;

    const scale = Math.max(size / texture.width, 1e-3); // 0/負値防止
    const scatterRange = size / 5;
    const K = 3; // 3σ クリップ
    const sx = x + clampGaussian(K) * scatterRange;
    const sy = y + clampGaussian(K) * scatterRange;

    // 着色済みテクスチャ
    const tint = getTintedTexture(s.primaryColor);

    // 描画（メインキャンバスの合成状態は変更しない）
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.drawImage(tint, -texture.width / 2, -texture.height / 2);
    ctx.restore();

    // 無効領域の拡張（回転を考慮した対角＋散布分）
    const w = texture.width * scale;
    const h = texture.height * scale;
    const r = Math.sqrt(w * w + h * h) / 2 + K * scatterRange;
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
      if ((s.brushSize || 0) > 0) stamp(ctx, last.x, last.y, 0, s, eng);
    },

    onPointerMove(ctx, ev, eng) {
      if (!drawing || !last) return;
      const p = { ...ev.img };
      const s = store.getToolState(id);

      if ((s.brushSize || 0) <= 0) { last = p; return; }

      const spacing = Math.max(1, s.brushSize * (s.spacingRatio ?? 0.4));
      const EPS = 1e-6;

      let dx = p.x - last.x;
      let dy = p.y - last.y;
      let dist = Math.hypot(dx, dy);
      if (dist < EPS) { acc += dist; last = p; return; }

      let angle = Math.atan2(dy, dx);

      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist; // dist>0 保証済み
        const nx = last.x + dx * t;
        const ny = last.y + dy * t;
        stamp(ctx, nx, ny, angle, s, eng);
        last = { x: nx, y: ny };
        dx = p.x - last.x;
        dy = p.y - last.y;
        dist = Math.hypot(dx, dy);
        if (dist < EPS) { acc = 0; break; }
        angle = Math.atan2(dy, dx);
        acc = 0;
      }
      acc += dist;
      last = p;
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      const s = store.getToolState(id);
      if ((s.brushSize || 0) > 0 && last) {
        const p = { ...ev.img };
        const dx = p.x - last.x, dy = p.y - last.y;
        const angle = Math.atan2(dy, dx) || 0;
        stamp(ctx, p.x, p.y, angle, s, eng); // 終点も確実にスタンプ
      }

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
        const r = Math.hypot(dx, dy);
        if (r <= 32) {
          const i = (y * 64 + x) * 4;
          // 白マスク + ランダムアルファ（中心ほど濃い）
          img.data[i] = 255;
          img.data[i + 1] = 255;
          img.data[i + 2] = 255;
          const dist = r / 32;
          const alpha = (1 - dist) * Math.random() * 255;
          img.data[i + 3] = alpha;
        }
      }
    }
    tctx.putImageData(img, 0, 0);
    return cvs;
  }

  // Box-Muller
  function gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
