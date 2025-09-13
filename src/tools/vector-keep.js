function makeVectorKeep(store) {
  const id = 'vector-keep';
  let drawing = false;
  let last = null;
  let path = [];

  return {
    id,
    cursor: 'crosshair',

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();
      drawing = true;
      last = null;
      path = [];

      const s = store.getToolState(id) || {};
      const w = Math.max(s.brushSize || 0, 0);
      if (w > 0) eng.expandPendingRect?.(ev.img.x, ev.img.y, w);
      stroke(ctx, ev.img); // 開始点を確実に描く
    },

    onPointerMove(ctx, ev, eng) {
      if (!drawing) return;
      const s = store.getToolState(id) || {};
      const w = Math.max(s.brushSize || 0, 0);
      if (w > 0) eng.expandPendingRect?.(ev.img.x, ev.img.y, w);
      stroke(ctx, ev.img);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      // 終点も確実に描く
      const s = store.getToolState(id) || {};
      const w = Math.max(s.brushSize || 0, 0);
      if (w > 0) {
        if (!last || last.x !== ev.img.x || last.y !== ev.img.y) {
          eng.expandPendingRect?.(ev.img.x, ev.img.y, w);
          stroke(ctx, ev.img);
        }
      } else {
        // 幅0でもパス点は保持
        if (!last || last.x !== ev.img.x || last.y !== ev.img.y) {
          last = { x: ev.img.x, y: ev.img.y };
          path.push(last);
        }
      }

      // ベクタ保持（配列をコピーして不変化）
      const prev = store.getToolState(id) || {};
      const vectors = Array.isArray(prev.vectors) ? prev.vectors.slice() : [];
      vectors.push({
        points: path.map(p => ({ x: p.x, y: p.y })),
        color: s.primaryColor,
        width: w,
      });
      store.setToolState(id, { vectors });

      path = [];
      last = null;

      eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.();
    },
  };

  function stroke(ctx, img) {
    const s = store.getToolState(id) || {};
    const w = Math.max(s.brushSize || 0, 0);
    const color = s.primaryColor || '#000';

    // パス保存は常に
    const pt = { x: img.x, y: img.y };
    path.push(pt);

    if (w <= 0) { last = pt; return; }

    // 1pxのみ0.5補正。それ以外は補正なし
    const off = w <= 1 ? 0.5 : 0;

    ctx.save();
    if (!last) {
      // 開始点はドットで確実に出す
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(img.x, img.y, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      last = pt;
      return;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(last.x + off, last.y + off);
    ctx.lineTo(img.x + off, img.y + off);
    ctx.stroke();
    ctx.restore();

    last = pt;
  }
}
