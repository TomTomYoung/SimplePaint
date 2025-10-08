export function makeAaLineBrush(store) {
  const id = 'aa-line-brush';

  let drawing = false;
  let pts = [];
  let dirty = null; // {x,y,w,h} 連続線分のAABB統合（+1px余白込み）

  const EPS = 1e-6;

  // 既定値
  const DEFAULTS = {
    opacity: 0.8, // 0.4〜1.0 推奨（線形合成で使用）
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      drawing = true;
      pts = [{ ...ev.img }];
      dirty = null;

      // 開始点を点描（Wu の端点処理相当）
      const s = getState(store, id, DEFAULTS);
      const rect = drawWuSegment(ctx, ev.img.x, ev.img.y, ev.img.x, ev.img.y, s);
      if (rect) dirty = unionAabb(dirty, rect);
    },

    onPointerMove(ctx, ev) {
      if (!drawing || pts.length === 0) return;

      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      const dx = p.x - last.x, dy = p.y - last.y;
      if (dx * dx + dy * dy < 0.25) return; // 過剰更新抑制

      const s = getState(store, id, DEFAULTS);
      const rect = drawWuSegment(ctx, last.x, last.y, p.x, p.y, s);
      if (rect) dirty = unionAabb(dirty, rect);

      pts.push(p);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      const s = getState(store, id, DEFAULTS);
      const last = pts[pts.length - 1] || ev.img;
      const rect = drawWuSegment(ctx, last.x, last.y, ev.img.x, ev.img.y, s);
      if (rect) dirty = unionAabb(dirty, rect);

      // 再描画通知（線分AABB＋外側1px余白）
      if (dirty) {
        eng.expandPendingRectByRect?.(dirty.x, dirty.y, dirty.w, dirty.h);
      }

      pts = [];
      dirty = null;
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview(octx) {
      if (!drawing || pts.length < 2) return;
      octx.save();
      octx.lineCap = 'butt';
      octx.lineJoin = 'miter';
      octx.strokeStyle = '#000';
      octx.lineWidth = 1; // プレビューのみ（実描画はWu）
      octx.beginPath();
      octx.moveTo(pts[0].x + 0.5, pts[0].y + 0.5);
      for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x + 0.5, pts[i].y + 0.5);
      octx.stroke();
      octx.restore();
    },
  };

  // === Xiaolin Wu の AA 線分（線形空間で合成） ===========================
  function drawWuSegment(ctx, x0, y0, x1, y1, s) {
    // AABB（外側1px余白）
    const minX = Math.floor(Math.min(x0, x1)) - 2;
    const minY = Math.floor(Math.min(y0, y1)) - 2;
    const maxX = Math.ceil(Math.max(x0, x1)) + 2;
    const maxY = Math.ceil(Math.max(y0, y1)) + 2;
    const w = ctx.canvas.width, h = ctx.canvas.height;

    const clip = clipRectToCanvas(minX, minY, maxX - minX + 1, maxY - minY + 1, w, h);
    if (!clip) return null;

    const { x, y, w: rw, h: rh } = clip;
    const img = ctx.getImageData(x, y, rw, rh);
    const data = img.data;

    // 入力色（sRGB→linear）
    const col = hexToRgb((store.getToolState(id) || {}).primaryColor || '#000000');
    const rL = srgbToLinear(col.r / 255);
    const gL = srgbToLinear(col.g / 255);
    const bL = srgbToLinear(col.b / 255);
    const baseAlpha = clamp(s.opacity, 0.0, 1.0);

    // 便宜：ローカル描画関数
    function plot(ix, iy, cov) {
      // キャンバス絶対座標 → ローカル
      const lx = ix - x;
      const ly = iy - y;
      if (lx < 0 || ly < 0 || lx >= rw || ly >= rh) return;

      const idx = (ly * rw + lx) * 4;

      // 既存（sRGB→linear）
      const dR = srgbToLinear(data[idx] / 255);
      const dG = srgbToLinear(data[idx + 1] / 255);
      const dB = srgbToLinear(data[idx + 2] / 255);
      const dA = data[idx + 3] / 255;

      // 直線形（straight α）
      const srcA = clamp(baseAlpha * cov, 0, 1);
      if (srcA <= 0) return;

      const outA = srcA + dA * (1 - srcA);
      const outR = (rL * srcA + dR * dA * (1 - srcA)) / (outA || 1);
      const outG = (gL * srcA + dG * dA * (1 - srcA)) / (outA || 1);
      const outB = (bL * srcA + dB * dA * (1 - srcA)) / (outA || 1);

      data[idx]     = linearToSrgb(outR);
      data[idx + 1] = linearToSrgb(outG);
      data[idx + 2] = linearToSrgb(outB);
      data[idx + 3] = Math.round(clamp(outA, 0, 1) * 255);
    }

    // Wu 本体
    function ipart(v) { return Math.floor(v); }
    function roundi(v) { return Math.round(v); }
    function fpart(v) { return v - Math.floor(v); }
    function rfpart(v) { return 1 - fpart(v); }

    let sx0 = x0, sy0 = y0, sx1 = x1, sy1 = y1;

    const steep = Math.abs(sy1 - sy0) > Math.abs(sx1 - sx0);
    if (steep) { // swap x/y
      [sx0, sy0] = [sy0, sx0];
      [sx1, sy1] = [sy1, sx1];
    }
    if (sx0 > sx1) { // 左→右
      [sx0, sx1] = [sx1, sx0];
      [sy0, sy1] = [sy1, sy0];
    }

    const dx = sx1 - sx0;
    const dy = sy1 - sy0;
    const gradient = Math.abs(dx) < EPS ? 0 : dy / dx;

    // 端点1
    let xend = roundi(sx0);
    let yend = sy0 + gradient * (xend - sx0);
    let xgap = rfpart(sx0 + 0.5);
    let xpxl1 = xend;
    let ypxl1 = ipart(yend);

    function p(xi, yi, c) {
      if (steep) plot(yi, xi, c); else plot(xi, yi, c);
    }

    p(xpxl1, ypxl1, rfpart(yend) * xgap);
    p(xpxl1, ypxl1 + 1, fpart(yend) * xgap);
    let intery = yend + gradient;

    // 端点2
    xend = roundi(sx1);
    yend = sy1 + gradient * (xend - sx1);
    xgap = fpart(sx1 + 0.5);
    const xpxl2 = xend;
    const ypxl2 = ipart(yend);

    // 本体
    for (let xcur = xpxl1 + 1; xcur <= xpxl2 - 1; xcur++) {
      const yint = ipart(intery);
      p(xcur, yint, rfpart(intery));
      p(xcur, yint + 1, fpart(intery));
      intery += gradient;
    }

    // 端点2描画
    p(xpxl2, ypxl2, rfpart(yend) * xgap);
    p(xpxl2, ypxl2 + 1, fpart(yend) * xgap);

    ctx.putImageData(img, x, y);

    // 返すAABB（外側1px余白は既に含めてクリップしている）
    return { x, y, w: rw, h: rh };
  }

  // === ユーティリティ群 ===================================================
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      opacity: Number.isFinite(s.opacity) ? s.opacity : defs.opacity,
    };
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

  function clipRectToCanvas(x, y, w, h, cw, ch) {
    let nx = x, ny = y, nw = w, nh = h;
    if (nx < 0) { nw += nx; nx = 0; }
    if (ny < 0) { nh += ny; ny = 0; }
    if (nx + nw > cw) nw = cw - nx;
    if (ny + nh > ch) nh = ch - ny;
    if (nw <= 0 || nh <= 0) return null;
    return { x: nx, y: ny, w: nw, h: nh };
  }

  function hexToRgb(hex) {
    const n = (hex && hex[0] === '#') ? hex.slice(1) : (hex || '');
    const s = n.length === 3 ? n.replace(/(.)/g, '$1$1') : n;
    const v = Number.isNaN(parseInt(s, 16)) ? 0 : parseInt(s, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }

  // sRGB ↔ Linear（0..1）
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

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
}
