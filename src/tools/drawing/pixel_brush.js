/*
 * ツール仕様
 * 概要: ストローク系の描画ツール群。筆圧や速度に応じてピクセルを塗布し、形状や質感を変化させます。
 * 入力: ペン/マウスのポインタイベント、筆圧や速度、Shiftなどの修飾キー。
 * 出力: ラスターレイヤー上の筆跡や効果付きストローク。
 * 操作: 左ドラッグで描画開始→移動でストローク更新→離して確定。右クリックやスポイト機能がある場合は色取得に使用。
 */
export function makePixelBrush(store) {
  const id = 'pixel-brush';

  let drawing = false;
  let lastSnap = null;      // {ix, iy}（格子座標）
  let dirty = null;         // {minX,minY,maxX,maxY}（AABB統合）

  // 既定値
  const DEFAULTS = {
    pixelSize: 1,           // 1px（ブロック塗りにしたい場合は >1）
    palette: null,          // ['#RRGGBB', ...] があれば最短色に量子化
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      drawing = true;
      dirty = null;
      lastSnap = null;

      const s = getState(store, id, DEFAULTS);
      const col = chooseColor(s);
      const { ix, iy } = snap(ev.img.x, ev.img.y, s.pixelSize);

      // 開始ピクセル
      drawPixel(ctx, ix, iy, s.pixelSize, col);
      unionAABB(ix, iy, s.pixelSize);

      lastSnap = { ix, iy };
    },

    onPointerMove(ctx, ev) {
      if (!drawing) return;

      const s = getState(store, id, DEFAULTS);
      const { ix, iy } = snap(ev.img.x, ev.img.y, s.pixelSize);
      if (!lastSnap || (ix === lastSnap.ix && iy === lastSnap.iy)) return;

      const col = chooseColor(s);

      // Bresenham（格子上の直線）
      linePixels(lastSnap.ix, lastSnap.iy, ix, iy, (x, y) => {
        drawPixel(ctx, x, y, s.pixelSize, col);
        unionAABB(x, y, s.pixelSize);
      });

      lastSnap = { ix, iy };
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      // 最終ピクセルも確実に
      const s = getState(store, id, DEFAULTS);
      const { ix, iy } = snap(ev.img.x, ev.img.y, s.pixelSize);
      if (!lastSnap || ix !== lastSnap.ix || iy !== lastSnap.iy) {
        const col = chooseColor(s);
        linePixels(lastSnap?.ix ?? ix, lastSnap?.iy ?? iy, ix, iy, (x, y) => {
          drawPixel(ctx, x, y, s.pixelSize, col);
          unionAABB(x, y, s.pixelSize);
        });
      }

      // 再描画通知（更新ピクセルの最小矩形）
      if (dirty) {
        const x = dirty.minX, y = dirty.minY;
        const w = dirty.maxX - dirty.minX + 1;
        const h = dirty.maxY - dirty.minY + 1;
        // pixelSize を掛けた実座標AABB
        const px = x * s.pixelSize;
        const py = y * s.pixelSize;
        const pw = w * s.pixelSize;
        const ph = h * s.pixelSize;
        eng.expandPendingRectByRect?.(px, py, pw, ph);
      }

      lastSnap = null;
      dirty = null;
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview() {}, // ピクセル筆ではAA禁止のためプレビュー省略（必要なら格子カーソル表示を別途）
  };

  // === 基本描画ユーティリティ ===========================================
  function drawPixel(ctx, ix, iy, ps, color) {
    const x = ix * ps, y = iy * ps;

    ctx.save();
    // 画像は使わないが念のためスムージングを無効化
    if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color;
    ctx.fillRect(x, y, ps, ps);
    ctx.restore();
  }

  // Bresenham（整数格子）
  function linePixels(x0, y0, x1, y1, put) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy; // err = dx + (-|dy|)
    let x = x0, y = y0;

    for (;;) {
      put(x, y);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  // マウス座標 → 格子座標（セルインデックス）
  function snap(x, y, ps) {
    return { ix: Math.floor(x / ps), iy: Math.floor(y / ps) };
  }

  // AABB 統合（格子単位）
  function unionAABB(ix, iy, ps) {
    if (!dirty) {
      dirty = { minX: ix, minY: iy, maxX: ix, maxY: iy };
    } else {
      if (ix < dirty.minX) dirty.minX = ix;
      if (iy < dirty.minY) dirty.minY = iy;
      if (ix > dirty.maxX) dirty.maxX = ix;
      if (iy > dirty.maxY) dirty.maxY = iy;
    }
  }

  // 色の決定（パレットがあれば最近傍）
  function chooseColor(s) {
    const base = hexToRgb(s.primaryColor || '#000000');
    if (!Array.isArray(s.palette) || s.palette.length === 0) {
      return rgbToHex(base.r, base.g, base.b);
    }
    let best = null, bestD = Infinity;
    for (const p of s.palette) {
      const c = hexToRgb(p);
      const d = (c.r - base.r) ** 2 + (c.g - base.g) ** 2 + (c.b - base.b) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    const c = best || base;
    return rgbToHex(c.r, c.g, c.b);
  }

  // === 状態取得 ===========================================================
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      pixelSize: clampInt(Number(s.pixelSize ?? defs.pixelSize), 1, 64),
      palette: Array.isArray(s.palette) ? s.palette : defs.palette,
      primaryColor: s.primaryColor || '#000',
    };
  }

  // === 小物 ===============================================================
  function clampInt(v, lo, hi) { v = v | 0; return v < lo ? lo : (v > hi ? hi : v); }

  function hexToRgb(hex) {
    const n = (hex && hex[0] === '#') ? hex.slice(1) : (hex || '');
    const s = n.length === 3 ? n.replace(/(.)/g, '$1$1') : n;
    const v = Number.isNaN(parseInt(s, 16)) ? 0 : parseInt(s, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function rgbToHex(r, g, b) {
    return '#' + to2(r) + to2(g) + to2(b);
  }
  function to2(v) {
    v = Math.max(0, Math.min(255, v | 0));
    return v.toString(16).padStart(2, '0');
  }
}
