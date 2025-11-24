/*
 * ツール仕様
 * 概要: 表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。
 * 入力: ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。
 * 出力: 質感や模様を含むストロークやスタンプ。
 * 操作: 左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
 */
export function makeHdrLinearPipelineBrush(store) {
  const id = 'hdr-linear';

  // ========= ランタイム状態 =========
  let drawing = false;
  let last = null;        // 直近の実座標
  let acc = 0;            // 余り距離（Δs 繰越）
  let aabb = null;        // {x,y,w,h} スタンプAABBの統合

  // ========= 既定値 =========
  const DEFAULTS = {
    brushSize: 16,          // w
    opacity: 1.0,           // 直線形 α（0..1）
    dsRatio: 0.5,           // Δs = w * dsRatio（基準: w/2）
    toneCurve: 'reinhard',  // 'reinhard' | 'filmic' | 'none'
    exposure: 1.0,          // HDR 露光（1.0基準）
    gamma: 2.2,             // 参考値（sRGB 使用時は未使用）
  };

  // ========= 公開IF =========
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
      aabb = null;

      // 起点スタンプ
      const s = getState(store, id, DEFAULTS);
      stampLinear(ctx, last.x, last.y, s, (r) => (aabb = unionAabb(aabb, r)));
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !last) return;

      const s = getState(store, id, DEFAULTS);
      const spacing = Math.max(0.5, s.brushSize * (s.dsRatio ?? 0.5));

      let px = last.x, py = last.y;
      const qx = ev.img.x, qy = ev.img.y;
      let dx = qx - px, dy = qy - py;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) return;

      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;
        const nx = px + dx * t;
        const ny = py + dy * t;

        stampLinear(ctx, nx, ny, s, (r) => (aabb = unionAabb(aabb, r)));

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

      // 終端まで詰める
      const s = getState(store, id, DEFAULTS);
      const spacing = Math.max(0.5, s.brushSize * (s.dsRatio ?? 0.5));

      let px = last.x, py = last.y;
      const qx = ev.img.x, qy = ev.img.y;
      let dx = qx - px, dy = qy - py;
      let dist = Math.hypot(dx, dy);

      if (dist > 0) {
        while (acc + dist >= spacing) {
          const t = (spacing - acc) / dist;
          const nx = px + dx * t;
          const ny = py + dy * t;
          stampLinear(ctx, nx, ny, s, (r) => (aabb = unionAabb(aabb, r)));
          px = nx; py = ny;
          dx = qx - px; dy = qy - py;
          dist = Math.hypot(dx, dy);
          acc = 0;
        }
      }

      // 再描画通知（統合AABB）
      if (aabb) eng.expandPendingRectByRect?.(aabb.x, aabb.y, aabb.w, aabb.h);

      // 片付け
      last = null;
      acc = 0;
      aabb = null;

      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    // プレビューは軽量ライン（確定時は線形合成で上書き）
    drawPreview(octx) {
      if (!drawing || !last) return;
      const s = store.getToolState(id) || {};
      const w = Math.max(1, s.brushSize || DEFAULTS.brushSize);
      const off = w <= 1 ? 0.5 : 0;

      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.strokeStyle = s.primaryColor || '#000';
      octx.lineWidth = w;
      octx.beginPath();
      // last のみだと短すぎるので簡易可視：小円
      octx.arc(last.x + off, last.y + off, Math.max(1, w * 0.25), 0, Math.PI * 2);
      octx.stroke();
      octx.restore();
    },
  };

  // ========= スタンプ（線形空間・プリマルチ合成・トーンマップ） =========
  function stampLinear(ctx, cx, cy, s, onRect) {
    const r = Math.max(0.5, s.brushSize / 2);
    const aa = 1.0; // 1px の AA フェザー
    const pad = Math.ceil(r + aa + 1);

    const minX = Math.floor(cx - pad);
    const minY = Math.floor(cy - pad);
    const maxX = Math.ceil(cx + pad);
    const maxY = Math.ceil(cy + pad);
    const w = Math.max(0, maxX - minX);
    const h = Math.max(0, maxY - minY);
    if (w === 0 || h === 0) return null;

    // クリップ
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const clip = clipRectToCanvas(minX, minY, w, h, cw, ch);
    if (!clip) return null;

    const { x, y, w: rw, h: rh } = clip;
    const img = ctx.getImageData(x, y, rw, rh);
    const data = img.data;

    // ソース色（直線光へ）
    const col = hexToRgb((store.getToolState(id) || {}).primaryColor || '#000000');
    const baseLin = {
      r: srgbToLinear(col.r / 255) * (s.exposure || 1),
      g: srgbToLinear(col.g / 255) * (s.exposure || 1),
      b: srgbToLinear(col.b / 255) * (s.exposure || 1),
    };
    const srcAlphaBase = clamp(s.opacity, 0, 1);

    // 走査
    for (let j = 0; j < rh; j++) {
      for (let i = 0; i < rw; i++) {
        // ピクセル中心でカバレッジ
        const px = x + i + 0.5;
        const py = y + j + 0.5;
        const dx = px - cx;
        const dy = py - cy;
        const d = Math.hypot(dx, dy);

        // ソフト円のカバレッジ（r±aa でスムーズステップ）
        let cov = 0;
        if (d <= r - aa) cov = 1;
        else if (d >= r + aa) cov = 0;
        else {
          const t = clamp((r + aa - d) / (2 * aa), 0, 1);
          cov = t * t * (3 - 2 * t);
        }
        if (cov <= 0) continue;

        const idx = (j * rw + i) * 4;

        // 既存（sRGB → linear）
        const dA = data[idx + 3] / 255;
        const dR = srgbToLinear(data[idx] / 255)   * dA;
        const dG = srgbToLinear(data[idx + 1] / 255) * dA;
        const dB = srgbToLinear(data[idx + 2] / 255) * dA;

        // ソース（プリマルチ）
        const srcA = srcAlphaBase * cov; // straight α
        const sR = baseLin.r * srcA;
        const sG = baseLin.g * srcA;
        const sB = baseLin.b * srcA;

        // プリマルチ Over
        const outA = srcA + dA * (1 - srcA);
        const outR = sR + dR * (1 - srcA);
        const outG = sG + dG * (1 - srcA);
        const outB = sB + dB * (1 - srcA);

        // 直線光 → トーンマップ（HDR 対応）
        let rL = outR, gL = outG, bL = outB;
        if (outA > 0) { // straight へ戻し
          rL /= outA; gL /= outA; bL /= outA;
        }
        const tm = toneMap({ r: rL, g: gL, b: bL }, s.toneCurve);

        // 線形 → sRGB、αは straight
        data[idx]     = linearToSrgb(tm.r);
        data[idx + 1] = linearToSrgb(tm.g);
        data[idx + 2] = linearToSrgb(tm.b);
        data[idx + 3] = Math.round(clamp(outA, 0, 1) * 255);
      }
    }

    ctx.putImageData(img, x, y);

    const rect = { x, y, w: rw, h: rh };
    onRect?.(rect);
    return rect;
  }

  // ========= トーンマップ =========
  function toneMap(rgb, mode) {
    if (mode === 'none') {
      return { r: clamp(rgb.r, 0, 1), g: clamp(rgb.g, 0, 1), b: clamp(rgb.b, 0, 1) };
    }
    if (mode === 'filmic') {
      // Uncharted2/Hable 近似
      const A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30, W = 11.2;
      function hable(x) { return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F; }
      const invW = 1 / hable(W);
      return {
        r: clamp(hable(rgb.r) * invW, 0, 1),
        g: clamp(hable(rgb.g) * invW, 0, 1),
        b: clamp(hable(rgb.b) * invW, 0, 1),
      };
    }
    // Reinhard
    return {
      r: reinhard(rgb.r),
      g: reinhard(rgb.g),
      b: reinhard(rgb.b),
    };
  }
  function reinhard(x) { return x / (1 + x); }

  // ========= sRGB ↔ Linear =========
  function srgbToLinear(u) {
    if (u <= 0.04045) return u / 12.92;
    return Math.pow((u + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(v) {
    v = clamp(v, 0, 1);
    if (v <= 0.0031308) v = 12.92 * v;
    else v = 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(clamp(v, 0, 1) * 255);
  }

  // ========= 色/ユーティリティ =========
  function hexToRgb(hex) {
    const n = (hex && hex[0] === '#') ? hex.slice(1) : (hex || '');
    const s = n.length === 3 ? n.replace(/(.)/g, '$1$1') : n;
    const v = Number.isNaN(parseInt(s, 16)) ? 0 : parseInt(s, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function clipRectToCanvas(x, y, w, h, cw, ch) {
    let nx = x, ny = y, nw = w, nh = h;
    if (nx < 0) { nw += nx; nx = 0; }
    if (ny < 0) { nh += ny; ny = 0; }
    if (nx + nw > cw) nw = cw - nx;
    if (ny + nh > ch) nh = ch - ny;
    if (nw <= 0 || nh <= 0) return null;
    return { x: nx, y: ny, w: nw, h: nh };
  }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { ...b };
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // ========= パラメータ取得 =========
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clamp(Number(s.brushSize ?? defs.brushSize), 1, 256),
      opacity: clamp(Number(s.opacity ?? defs.opacity), 0, 1),
      dsRatio: Number.isFinite(s.dsRatio) ? s.dsRatio : defs.dsRatio,
      toneCurve: (s.toneCurve === 'filmic' || s.toneCurve === 'none') ? s.toneCurve : defs.toneCurve,
      exposure: Number.isFinite(s.exposure) ? s.exposure : defs.exposure,
      gamma: Number.isFinite(s.gamma) ? s.gamma : defs.gamma,
      primaryColor: s.primaryColor || '#000',
    };
  }
}
