function makeCalligraphy(store) {
  const id = 'calligraphy';
  let drawing = false;
  let last = null;
  let acc = 0; // 残距離

  function drawStamp(ctx, x, y, s, eng) {
    // パラメータの健全化
    const angleDeg = Number.isFinite(s.penAngle) ? s.penAngle : 45;
    const angle = (angleDeg * Math.PI) / 180;
    const kappa = Math.max(Number(s.kappa ?? 2) || 2, 0.01); // 負値/0防止
    const baseW = Math.max(Number(s.brushSize) || 0, 0.1);
    const shortR = Math.max(baseW, Number(s.w_min ?? 1) || 1);
    const longR  = shortR * kappa;

    // AABB（回転楕円の正確な半幅/半高）
    const c = Math.cos(angle), sA = Math.sin(angle);
    const rx = Math.sqrt(longR*longR * c*c + shortR*shortR * sA*sA);
    const ry = Math.sqrt(longR*longR * sA*sA + shortR*shortR * c*c);

    ctx.save();
    ctx.translate(x, y);               // 充填なので 0.5 オフは不要
    ctx.rotate(angle);
    ctx.fillStyle = store.getToolState(id).primaryColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, longR, shortR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    eng.expandPendingRectByRect?.(x - rx, y - ry, rx * 2, ry * 2);
  }

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();
      drawing = true;
      last = { ...ev.img };
      acc = 0;

      const s = store.getToolState(id) || {};
      drawStamp(ctx, last.x, last.y, s, eng);
    },

    onPointerMove(ctx, ev, eng) {
      if (!drawing || !last) return;
      const p = { ...ev.img };
      const s = store.getToolState(id) || {};
      const w = Math.max(Number(s.brushSize) || 0, 0.1);

      // spacing の健全化（0/負値防止、極端な小ささも防ぐ）
      const rawSpacing = (s.spacingRatio ?? 0.4) * w;
      const spacing = Math.max(rawSpacing, 1); // 1px 下限
      const EPS = 1e-6;

      let dx = p.x - last.x;
      let dy = p.y - last.y;
      let dist = Math.hypot(dx, dy);
      if (dist < EPS) return;

      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;   // dist>0 保証
        const nx = last.x + dx * t;
        const ny = last.y + dy * t;
        drawStamp(ctx, nx, ny, s, eng);

        // 次の区間へ
        last = { x: nx, y: ny };
        dx = p.x - last.x;
        dy = p.y - last.y;
        dist = Math.hypot(dx, dy);
        acc = 0;
        if (dist < EPS) break;
      }
      acc += dist;
      last = p;
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      // 終点も確実にスタンプ
      const s = store.getToolState(id) || {};
      drawStamp(ctx, ev.img.x, ev.img.y, s, eng);

      last = null;
      acc = 0;
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview() {},
  };
}
