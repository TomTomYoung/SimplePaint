export function makeDistanceStampedBrush(store) {
  const id = 'distance-stamped';

  let drawing = false;
  let last = null;      // 直近のポインタ位置（ワールド座標）
  let acc = 0;          // 余り距離（次セグメントへ繰越）
  let dirty = null;     // {x,y,w,h} AABB統合

  // 既定値
  const DEFAULTS = {
    brushSize: 14,
    dsRatio: 0.5,       // Δs = w * dsRatio（基準: w/2）
    // 安全域（重なり監視の簡易版）：Δs をこの範囲にクランプ
    dsMinFactor: 1 / 3, // Δs_min = w/3
    dsMaxFactor: 1.25,  // Δs_max ≈ 1.25w（過疎を抑制）
  };

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
      dirty = null;

      const s = getState(store, id, DEFAULTS);
      const spacing = computeSpacing(s);
      // 起点に必ず 1 スタンプ
      stampCircle(ctx, last.x, last.y, s, (rect) => (dirty = unionAabb(dirty, rect)));
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !last) return;

      const s = getState(store, id, DEFAULTS);
      const spacing = computeSpacing(s);

      // セグメント処理（距離のみでスタンプ等間隔配置）
      let px = last.x, py = last.y;
      const qx = ev.img.x, qy = ev.img.y;
      let dx = qx - px, dy = qy - py;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) return;

      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;
        const nx = px + dx * t;
        const ny = py + dy * t;

        stampCircle(ctx, nx, ny, s, (rect) => (dirty = unionAabb(dirty, rect)));

        // 次のスタンプへ
        px = nx; py = ny;
        dx = qx - px; dy = qy - py;
        dist = Math.hypot(dx, dy);
        acc = 0;
      }
      acc += dist;
      last = { x: qx, y: qy };
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      // 終端まで詰める（必要なら最後のスタンプ）
      const s = getState(store, id, DEFAULTS);
      const spacing = computeSpacing(s);

      let px = last.x, py = last.y;
      const qx = ev.img.x, qy = ev.img.y;
      let dx = qx - px, dy = qy - py;
      let dist = Math.hypot(dx, dy);

      if (dist > 0) {
        while (acc + dist >= spacing) {
          const t = (spacing - acc) / dist;
          const nx = px + dx * t;
          const ny = py + dy * t;
          stampCircle(ctx, nx, ny, s, (rect) => (dirty = unionAabb(dirty, rect)));
          px = nx; py = ny;
          dx = qx - px; dy = qy - py;
          dist = Math.hypot(dx, dy);
          acc = 0;
        }
      }

      // 最終AABB通知（スタンプAABBの統合）
      if (dirty) {
        eng.expandPendingRectByRect?.(dirty.x, dirty.y, dirty.w, dirty.h);
      }

      // 片付け
      last = null;
      acc = 0;
      dirty = null;

      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    // プレビューは不要（実描画が距離主導で即時打たれるため）
    drawPreview() {},
  };

  // === 丸スタンプ（線形合成前提） =========================================
  function stampCircle(ctx, x, y, s, onRect) {
    const r = Math.max(0.5, s.brushSize / 2);
    const pad = 1; // AA 余白
    ctx.save();
    ctx.fillStyle = s.primaryColor || '#000';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // AABB（統合用）
    const rect = {
      x: Math.floor(x - r - pad),
      y: Math.floor(y - r - pad),
      w: Math.ceil(r * 2 + pad * 2),
      h: Math.ceil(r * 2 + pad * 2),
    };
    onRect?.(rect);
    return rect;
  }

  // === パラメータ取得 ======================================================
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clamp(Number(s.brushSize ?? defs.brushSize), 1, 256),
      dsRatio: Number.isFinite(s.dsRatio) ? s.dsRatio : defs.dsRatio,
      dsMinFactor: Number.isFinite(s.dsMinFactor) ? s.dsMinFactor : defs.dsMinFactor,
      dsMaxFactor: Number.isFinite(s.dsMaxFactor) ? s.dsMaxFactor : defs.dsMaxFactor,
      primaryColor: s.primaryColor || '#000',
    };
  }
  function computeSpacing(s) {
    const w = Math.max(1, s.brushSize);
    const raw = w * (s.dsRatio ?? 0.5);
    const dsMin = Math.max(0.5, w * (s.dsMinFactor ?? 1 / 3));
    const dsMax = Math.max(dsMin + 0.5, w * (s.dsMaxFactor ?? 1.25));
    return clamp(raw, dsMin, dsMax);
  }

  // === AABB ユーティリティ =================================================
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { ...b };
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  // === 小物 ================================================================
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
}
