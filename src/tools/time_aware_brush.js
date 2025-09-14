/**
 * Time-Aware（時間依存）
 * 停止時間と筆速に応じて、スタンプの幅 w と不透明度 α を動的に変化させるブラシ。
 * - 速度が遅い/停止に近いほど w↑ / α↑（幅レンジは ±range）
 * - 停止が閾値以上続くと「にじみ（bleed）」の弱い追加スタンプを発生
 * - 速度は EMA で平滑化し、幅変動にヒステリシスを与えてちらつきを抑制
 *
 * store.getToolState('time-aware') 主要パラメータ
 *   brushSize        : 基本幅 px（既定 18）
 *   primaryColor     : 色
 *   alpha            : 基本不透明度 0.2..1.0（既定 1.0）
 *   stopThresholdMs  : 停止閾値 50..120ms（既定 90）
 *   speedGamma       : 速度ガンマ 0.5..1.0（既定 0.7）  … v_norm^gamma
 *   widthRange       : 幅レンジ係数（±）0.05..0.4（既定 0.2 → ±20%）
 *   speedRef         : 正規化速度基準 px/s（既定 900）
 *   spacingRatio     : 距離主導間隔 Δs = spacingRatio * w（既定 0.5）
 *   dwellSpeed       : 停止判定用速度 px/s（既定 12）
 *   bleedStrength    : にじみ強度 0..0.5（既定 0.2）
 */
function makeTimeAwareBrush(store) {
  const id = 'time-aware';

  let drawing = false;
  let last = null;            // {x,y}
  let lastTime = 0;           // ms (performance.now)
  let acc = 0;                // 弧長繰越
  let vSmooth = 0;            // 速度EMA(px/s)
  let wSmooth = 1;            // 幅係数ヒステリシス
  let dwellMs = 0;            // 停止累積
  let unionRect = null;

  const DEFAULTS = {
    brushSize: 18,
    primaryColor: '#000000',
    alpha: 1.0,

    stopThresholdMs: 90,
    speedGamma: 0.7,
    widthRange: 0.2,          // ±20%
    speedRef: 900,            // px/s
    spacingRatio: 0.5,
    dwellSpeed: 12,           // px/s
    bleedStrength: 0.2,       // 追加スタンプのα倍率（最大）
  };

  // 低域フィルタ係数
  const SPEED_EMA_A = 0.35;   // 速度EMAの混合率（0..1, 大きいほど追従）
  const WIDTH_HYST   = 0.25;  // 幅係数のヒステリシス（0..1, 大きいほど追従）

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
      vSmooth = 0;
      wSmooth = 1;
      dwellMs = 0;
      unionRect = null;

      const s = getState(store, id, DEFAULTS);
      // 起点スタンプ
      stampAdaptive(ctx, last.x, last.y, 0, s);
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !last) return;

      const s = getState(store, id, DEFAULTS);

      const now = performance.now();
      let dt = (now - lastTime) / 1000;            // s
      if (dt <= 0) dt = 1 / 120;

      const p = { ...ev.img };
      let dx = p.x - last.x, dy = p.y - last.y;
      let dist = Math.hypot(dx, dy);

      // 速度推定（px/s）→ EMA 平滑
      const vInst = dist / dt;
      vSmooth = ema(vSmooth, vInst, SPEED_EMA_A);

      // 停止時間のカウント（低速なら加算、高速で減衰）
      if (vSmooth < s.dwellSpeed) dwellMs += dt * 1000;
      else dwellMs = Math.max(0, dwellMs - dt * 500); // 少し早めに減衰

      // 幅・αの係数を計算（速度→t=1 slow, 0 fast）
      const { wFactor, aFactor } = factorsFromSpeed(vSmooth, s, wSmooth);
      // ヒステリシス（wSmoothへ漸近）
      wSmooth = clamp01(wSmooth + (wFactor - wSmooth) * WIDTH_HYST);

      // 距離主導スタンプ：動的幅に応じた spacing
      const currW = Math.max(1, s.brushSize * wSmooth);
      let spacing = Math.max(1, s.spacingRatio * currW);

      // 通常の距離繰り越し配置
      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;
        const nx = last.x + dx * t;
        const ny = last.y + dy * t;

        stampAdaptive(ctx, nx, ny, aFactor, s);

        // 再計算（現在幅に依存するため毎回更新）
        last = { x: nx, y: ny };
        dx = p.x - last.x; dy = p.y - last.y;
        dist = Math.hypot(dx, dy);
        acc = 0;

        const { wFactor: wf2 } = factorsFromSpeed(vSmooth, s, wSmooth);
        wSmooth = clamp01(wSmooth + (wf2 - wSmooth) * WIDTH_HYST);
        spacing = Math.max(1, s.spacingRatio * Math.max(1, s.brushSize * wSmooth));
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

  // ====== スタンプ（幅/α を時間依存で変調、停止時にじみ追加） ===========
  function stampAdaptive(ctx, x, y, aFactor, s) {
    // 幅係数は直前の wSmooth を使用
    const r = Math.max(0.5, (s.brushSize * wSmooth) / 2);
    const aa = 1.0;

    // 本体スタンプ
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = s.primaryColor;
    ctx.globalAlpha = clamp01(s.alpha * (aFactor || 1));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 停止にじみ：しきい超過で弱い大半径の追加
    let extraPad = 0;
    if (dwellMs >= s.stopThresholdMs && s.bleedStrength > 0) {
      const over = (dwellMs - s.stopThresholdMs) / s.stopThresholdMs; // 0..∞
      const ooze = clamp01(over);                                     // 0..1
      const rr = r * (1 + 0.18 * ooze);
      const aa2 = clamp01(s.alpha * s.bleedStrength * ooze);

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = s.primaryColor;
      ctx.globalAlpha = aa2;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      extraPad = Math.ceil(rr - r);
    }

    // AABB（にじみ余白込み）
    const pad = 2 + extraPad;
    const rect = {
      x: Math.floor(x - r - pad),
      y: Math.floor(y - r - pad),
      w: Math.ceil((r + pad) * 2),
      h: Math.ceil((r + pad) * 2),
    };
    unionRect = unionAabb(unionRect, rect);
  }

  // ====== 速度→係数マッピング ============================================
  function factorsFromSpeed(v, s, wPrev) {
    // v_norm ∈ [0,∞) を 0..1 に圧縮（1で基準速度）
    const t = clamp01(1 - Math.pow(v / Math.max(1e-3, s.speedRef), s.speedGamma));
    // 幅：slow(t=1)→ +range / fast(t=0)→ -range
    const wFactor = clamp(1 + (2 * t - 1) * s.widthRange, 1 - s.widthRange, 1 + s.widthRange);
    // α：slowほど上げる（0.6..1.0 を基準、さらに base α が乗る）
    const aFactor = 0.6 + 0.4 * t;
    // ヒステリシスへ wPrev を使うならここで混合しても良い（呼び元で実施）
    return { wFactor, aFactor };
  }

  // ====== Utils ============================================================
  function ema(prev, x, a) { return prev === 0 ? x : (prev * (1 - a) + x * a); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { x: b.x|0, y: b.y|0, w: Math.ceil(b.w), h: Math.ceil(b.h) };
    const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize:       clamp(s.brushSize ?? defs.brushSize, 1, 512),
      primaryColor:    s.primaryColor || defs.primaryColor,
      alpha:           clamp(s.alpha ?? defs.alpha, 0.2, 1.0),

      stopThresholdMs: clamp(s.stopThresholdMs ?? defs.stopThresholdMs, 30, 300),
      speedGamma:      clamp(s.speedGamma ?? defs.speedGamma, 0.3, 1.5),
      widthRange:      clamp(s.widthRange ?? defs.widthRange, 0.05, 0.5),
      speedRef:        clamp(s.speedRef ?? defs.speedRef, 100, 4000),
      spacingRatio:    clamp(s.spacingRatio ?? defs.spacingRatio, 0.1, 2.0),
      dwellSpeed:      clamp(s.dwellSpeed ?? defs.dwellSpeed, 1, 60),
      bleedStrength:   clamp(s.bleedStrength ?? defs.bleedStrength, 0, 0.6),
    };
  }
}

window.makeTimeAwareBrush = makeTimeAwareBrush;
