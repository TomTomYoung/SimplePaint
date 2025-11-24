// ツール仕様: 概要=表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。 入力=ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。 出力=質感や模様を含むストロークやスタンプ。 操作=左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
export function makeSdfStroke(store) {
  const id = 'sdf-stroke';
  const pts = [];
  let drawing = false;

  const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      if (typeof eng.beginStrokeSnapshot === 'function') eng.beginStrokeSnapshot();
      drawing = true;
      pts.length = 0;
      pts.push({ ...ev.img });

      const s = store.getToolState(id);
      const rect = drawSegment(ctx, ev.img, ev.img, s);
      if (rect) eng.expandPendingRectByRect(rect.x, rect.y, rect.w, rect.h);
    },

    onPointerMove(ctx, ev, eng) {
      if (!drawing) return;
      const p = { ...ev.img };
      const s = store.getToolState(id);
      const last = pts[pts.length - 1];
      const rect = drawSegment(ctx, last, p, s);
      if (rect) eng.expandPendingRectByRect(rect.x, rect.y, rect.w, rect.h);
      pts.push(p);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      // 最終区間（move が来ないケースを補完）
      if (pts.length > 0) {
        const s = store.getToolState(id);
        const rect = drawSegment(ctx, pts[pts.length - 1], ev.img, s);
        if (rect) eng.expandPendingRectByRect(rect.x, rect.y, rect.w, rect.h);
      }

      if (typeof eng.commitStrokeSnapshot === 'function') {
        eng.commitStrokeSnapshot();
      } else if (typeof eng.endStrokeSnapshot === 'function') {
        eng.endStrokeSnapshot();
      }
      pts.length = 0;
    },

    drawPreview() {},
  };

  function drawSegment(ctx, p0, p1, s) {
    const size = Math.max(s?.brushSize || 0, 0);
    if (size <= 0) return null;

    const r = size / 2;
    const aa = 1; // デバイスピクセル基準のAA幅

    // 想定描画領域（浮動小数 → 整数へ丸め）
    let minX = Math.floor(Math.min(p0.x, p1.x) - r - aa);
    let minY = Math.floor(Math.min(p0.y, p1.y) - r - aa);
    let maxX = Math.ceil(Math.max(p0.x, p1.x) + r + aa);
    let maxY = Math.ceil(Math.max(p0.y, p1.y) + r + aa);

    // キャンバス内にクリップ
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const clipMinX = Math.max(0, Math.min(cw, minX));
    const clipMinY = Math.max(0, Math.min(ch, minY));
    const clipMaxX = Math.max(0, Math.min(cw, maxX));
    const clipMaxY = Math.max(0, Math.min(ch, maxY));
    const w = clipMaxX - clipMinX;
    const h = clipMaxY - clipMinY;
    if (w <= 0 || h <= 0) return null;

    // ピクセルバッファ取得
    const img = ctx.getImageData(clipMinX, clipMinY, w, h);
    const data = img.data;

    const col = hexToRgb(s.primaryColor);
    const srcR = col.r / 255, srcG = col.g / 255, srcB = col.b / 255;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = clipMinX + x + 0.5;
        const py = clipMinY + y + 0.5;

        const d = pointSegmentDistance(px, py, p0.x, p0.y, p1.x, p1.y);

        // smoothstep によるカバレッジ
        const t = (r + aa - d) / (aa * 2);
        if (t <= 0) continue;
        const cov = t >= 1 ? 1 : (t * t * (3 - 2 * t));
        if (cov <= 0) continue;

        const idx = (y * w + x) * 4;

        // 既存（straight alpha）
        const dstR = data[idx] / 255;
        const dstG = data[idx + 1] / 255;
        const dstB = data[idx + 2] / 255;
        const dstA = data[idx + 3] / 255;

        // src は指定色 × カバレッジ（straight alpha）
        const srcA = clamp01(cov);
        const outA = srcA + dstA * (1 - srcA);

        let outR, outG, outB;
        if (outA === 0) {
          outR = outG = outB = 0;
        } else {
          // Porter–Duff "over"（straight）
          outR = (srcR * srcA + dstR * dstA * (1 - srcA)) / outA;
          outG = (srcG * srcA + dstG * dstA * (1 - srcA)) / outA;
          outB = (srcB * srcA + dstB * dstA * (1 - srcA)) / outA;
        }

        data[idx]     = Math.round(clamp01(outR) * 255);
        data[idx + 1] = Math.round(clamp01(outG) * 255);
        data[idx + 2] = Math.round(clamp01(outB) * 255);
        data[idx + 3] = Math.round(clamp01(outA) * 255);
      }
    }

    ctx.putImageData(img, clipMinX, clipMinY);
    return { x: clipMinX, y: clipMinY, w, h };
  }

  function pointSegmentDistance(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(px - x0, py - y0); // 退避: 点→点
    let t = ((px - x0) * dx + (py - y0) * dy) / l2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const projX = x0 + t * dx;
    const projY = y0 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  function hexToRgb(hex) {
    const n = (hex && hex[0] === '#') ? hex.slice(1) : (hex || '');
    const s = n.length === 3 ? n.replace(/(.)/g, '$1$1') : n;
    const v = Number.isNaN(parseInt(s, 16)) ? 0 : parseInt(s, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
}
