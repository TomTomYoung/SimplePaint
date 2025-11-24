// ツール仕様: 概要=ストローク系の描画ツール群。筆圧や速度に応じてピクセルを塗布し、形状や質感を変化させます。 入力=ペン/マウスのポインタイベント、筆圧や速度、Shiftなどの修飾キー。 出力=ラスターレイヤー上の筆跡や効果付きストローク。 操作=左ドラッグで描画開始→移動でストローク更新→離して確定。右クリックやスポイト機能がある場合は色取得に使用。
/**
 * Pressure-Velocity Map（幅合成則）
 * 圧力 p と速度 v の両方で幅を決めるハイブリッドブラシ。
 * 入力取得 → p̃, ṽ を EMA 平滑 → wScale = 1 + a*(f(p̃)-1) + b*(g(ṽ)-1) → 距離主導スタンプ。
 *
 * store.getToolState('pvel-map') 主パラメータ（初期値は getState 参照）:
 *   brushSize     : 基本幅 px
 *   primaryColor  : 色
 *   alpha         : 不透明度 0.2..1.0
 *   aWeight       : 圧力寄与（既定 0.6）
 *   bWeight       : 速度寄与（既定 0.4）※内部で正規化し a+b=1 扱い
 *   pressureGamma : 0.8..1.4      （p^gamma）
 *   velocityMode  : 'inv1p' | 'log'   （g(ṽ)）
 *   velK          : 速度項の曲率（既定 1.0）
 *   speedRef      : v 正規化基準 px/s（既定 900）
 *   widthRange    : 幅レンジ ±（既定 0.2 → ±20%）
 *   spacingRatio  : Δs = spacingRatio * 現在幅（既定 0.5）
 *   emaP          : 圧力 EMA 率（0..1, 既定 0.5）
 *   emaV          : 速度 EMA 率（0..1, 既定 0.35）
 *
 * 再描画通知：スタンプ AABB を統合し、pointerup で一括通知。
 * 注意：過度な幅揺れを避けるために EMA を強めに設定すること。
 */
export function makePressureVelocityMapBrush(store) {
  const id = 'pvel-map';

  let drawing = false;
  let last = null;            // {x,y}
  let lastTime = 0;           // ms
  let acc = 0;                // 距離繰越
  let pSmooth = 0.5;          // 平滑圧力（0..1）
  let vSmooth = 0;            // 平滑速度（px/s）
  let unionRect = null;

  const DEFAULTS = {
    brushSize: 18,
    primaryColor: '#000000',
    alpha: 1.0,

    aWeight: 0.6,
    bWeight: 0.4,
    pressureGamma: 1.0,
    velocityMode: 'inv1p',  // 'inv1p' or 'log'
    velK: 1.0,
    speedRef: 900,          // px/s
    widthRange: 0.2,        // ±20%
    spacingRatio: 0.5,
    emaP: 0.5,              // 圧力 EMA
    emaV: 0.35,             // 速度 EMA
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
      lastTime = performance.now();
      acc = 0;

      const s = getState(store, id, DEFAULTS);
      pSmooth = clamp01(readPressure(ev));
      vSmooth = 0;
      unionRect = null;

      // 起点スタンプ
      const wScale = computeWidthScale(pSmooth, vSmooth, s);
      stamp(ctx, last.x, last.y, wScale, s);
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !last) return;

      const s = getState(store, id, DEFAULTS);

      const now = performance.now();
      let dt = (now - lastTime) / 1000;
      if (dt <= 0) dt = 1 / 120;

      const p = { ...ev.img };
      let dx = p.x - last.x, dy = p.y - last.y;
      let dist = Math.hypot(dx, dy);

      // 圧力・速度の平滑
      const pRaw = clamp01(readPressure(ev));
      pSmooth = ema(pSmooth, pRaw, clamp01(s.emaP));

      const vInst = dist / dt;            // px/s
      vSmooth = ema(vSmooth, vInst, clamp01(s.emaV));

      // 現在の幅スケール
      let wScale = computeWidthScale(pSmooth, vSmooth, s);
      let spacing = Math.max(1, s.spacingRatio * (s.brushSize * wScale));

      // 距離主導スタンプ
      while (acc + dist >= spacing) {
        const t = (spacing - acc) / Math.max(dist, 1e-6);
        const nx = last.x + dx * t;
        const ny = last.y + dy * t;

        // 進行中に幅が変化するため、毎回再計算（速度は同一 dt なのでほぼ一定）
        wScale = computeWidthScale(pSmooth, vSmooth, s);
        stamp(ctx, nx, ny, wScale, s);

        last = { x: nx, y: ny };
        dx = p.x - last.x; dy = p.y - last.y;
        dist = Math.hypot(dx, dy);
        spacing = Math.max(1, s.spacingRatio * (s.brushSize * computeWidthScale(pSmooth, vSmooth, s)));
        acc = 0;
      }

      acc += dist;
      last = p;
      lastTime = now;
    },

    onPointerUp(_ctx, _ev, eng) {
      if (!drawing) return;
      drawing = false;
      last = null;

      if (unionRect) {
        eng.expandPendingRectByRect?.(unionRect.x, unionRect.y, unionRect.w, unionRect.h);
      }
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview() {}, // 確定描画のみ
  };

  // ===== 幅スケール計算：wScale = 1 + a*(f(p̃)-1) + b*(g(ṽ)-1) ===========
  function computeWidthScale(pSmooth, vSmooth, s) {
    // 圧力項 f(p̃)：p^gamma を 0..1 → [1-range, 1+range] に線形マップ
    const pTerm01 = Math.pow(clamp01(pSmooth), s.pressureGamma);
    const pScale  = lerp(1 - s.widthRange, 1 + s.widthRange, pTerm01);

    // 速度正規化
    const vNorm = vSmooth / Math.max(1e-3, s.speedRef);

    // 速度項 g(ṽ)：遅いほど大（1）、速いほど小（~0）
    let vTerm01;
    if (s.velocityMode === 'log') {
      // g(v) = 1 / (1 + log(1 + k v))
      vTerm01 = 1 / (1 + Math.log1p(Math.max(0, s.velK) * vNorm));
    } else {
      // 'inv1p' : g(v) = 1 / (1 + k v)
      vTerm01 = 1 / (1 + Math.max(0, s.velK) * vNorm);
    }
    vTerm01 = clamp01(vTerm01);
    const vScale = lerp(1 - s.widthRange, 1 + s.widthRange, vTerm01);

    // 重みは a+b=1 に正規化した上でミックス
    const a = Math.max(0, s.aWeight), b = Math.max(0, s.bWeight);
    const sum = Math.max(1e-6, a + b);
    const aw = a / sum, bw = b / sum;

    const wScale = 1 + aw * (pScale - 1) + bw * (vScale - 1);
    // セーフティクリップ（±幅レンジの外側に逸脱しない）
    return clamp(wScale, 1 - s.widthRange, 1 + s.widthRange);
  }

  // ===== 1スタンプ描画 & AABB統合 =========================================
  function stamp(ctx, x, y, wScale, s) {
    const r = Math.max(0.5, (s.brushSize * wScale) / 2);
    const aa = 1.0;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = s.primaryColor;
    ctx.globalAlpha = clamp01(s.alpha);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const minX = Math.floor(x - r - aa);
    const minY = Math.floor(y - r - aa);
    const maxX = Math.ceil(x + r + aa);
    const maxY = Math.ceil(y + r + aa);
    unionRect = unionAabb(unionRect, { x: minX, y: minY, w: maxX - minX, h: maxY - minY });
  }

  // ===== Utils =============================================================
  function readPressure(ev) {
    // PointerEvent.pressure(0..1) を優先。なければ {p|force|pressure} を探索し 0.5 既定。
    const p =
      (typeof ev.pressure === 'number' && ev.pressure >= 0) ? ev.pressure :
      (typeof ev.p === 'number' && ev.p >= 0) ? ev.p :
      (typeof ev.force === 'number' && ev.force >= 0) ? ev.force :
      0.5;
    return p;
  }

  function ema(prev, x, a) { return prev === undefined ? x : (prev * (1 - a) + x * a); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { x: b.x|0, y: b.y|0, w: Math.ceil(b.w), h: Math.ceil(b.h) };
    const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    const velocityMode = (s.velocityMode === 'log') ? 'log' : 'inv1p';
    return {
      brushSize:     clamp(s.brushSize ?? defs.brushSize, 1, 512),
      primaryColor:  s.primaryColor || defs.primaryColor,
      alpha:         clamp(s.alpha ?? defs.alpha, 0.2, 1.0),

      aWeight:       (s.aWeight ?? defs.aWeight),
      bWeight:       (s.bWeight ?? defs.bWeight),
      pressureGamma: clamp(s.pressureGamma ?? defs.pressureGamma, 0.5, 2.0),
      velocityMode,
      velK:          clamp(s.velK ?? defs.velK, 0.1, 5.0),
      speedRef:      clamp(s.speedRef ?? defs.speedRef, 50, 5000),
      widthRange:    clamp(s.widthRange ?? defs.widthRange, 0.05, 0.6),
      spacingRatio:  clamp(s.spacingRatio ?? defs.spacingRatio, 0.1, 2.0),
      emaP:          clamp(s.emaP ?? defs.emaP, 0.05, 0.95),
      emaV:          clamp(s.emaV ?? defs.emaV, 0.05, 0.95),
    };
  }
}
