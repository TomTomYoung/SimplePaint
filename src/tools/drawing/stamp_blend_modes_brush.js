// ツール仕様: 概要=ストローク系の描画ツール群。筆圧や速度に応じてピクセルを塗布し、形状や質感を変化させます。 入力=ペン/マウスのポインタイベント、筆圧や速度、Shiftなどの修飾キー。 出力=ラスターレイヤー上の筆跡や効果付きストローク。 操作=左ドラッグで描画開始→移動でストローク更新→離して確定。右クリックやスポイト機能がある場合は色取得に使用。
/**
 * Stamp-Blend Modes（合成モード多様）
 * スタンプ（円ディスク）1発ごとにブレンドモードとαを適用。
 * - 速い経路：Canvas 2D の globalCompositeOperation を利用（normal/multiply/screen/add→lighter）
 * - 高忠実度：線形色空間で手動ブレンド（normal/multiply/add/screen）→ sRGBへ戻して書き戻し
 *
 * store.getToolState('stamp-blend') の主パラメータ（初期値は getState を参照）:
 *   brushSize   : px（既定 18）
 *   primaryColor: '#rrggbb'
 *   alpha       : 0.2..1.0（既定 1.0）
 *   mode        : 'normal' | 'multiply' | 'add' | 'screen'
 *   spacingRatio: Δs = spacingRatio * brushSize（既定 0.5）
 *   linear      : true で線形・手動合成（既定 false）
 *
 * 再描画通知：スタンプAABBを統合し、pointerup で一括通知。
 * 注意：手動合成は重いので必要時のみ linear:true を推奨。
 */
export function makeStampBlendModesBrush(store) {
  const id = 'stamp-blend';

  let drawing = false;
  let last = null;
  let acc = 0;
  let unionRect = null;

  const DEFAULTS = {
    brushSize: 18,
    primaryColor: '#000000',
    alpha: 1.0,
    mode: 'normal',        // 'normal' | 'multiply' | 'add' | 'screen'
    spacingRatio: 0.5,
    linear: false,         // true: 手動線形合成
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
      unionRect = null;

      const s = getState(store, id, DEFAULTS);
      stamp(ctx, last.x, last.y, s);
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !last) return;
      const s = getState(store, id, DEFAULTS);

      const spacing = Math.max(1, s.spacingRatio * s.brushSize);
      let px = last.x, py = last.y;
      const qx = ev.img.x, qy = ev.img.y;
      let dx = qx - px, dy = qy - py;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) return;

      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;
        const nx = px + dx * t;
        const ny = py + dy * t;
        stamp(ctx, nx, ny, s);
        px = nx; py = ny;
        dx = qx - px; dy = qy - py;
        dist = Math.hypot(dx, dy);
        acc = 0;
      }
      acc += dist;
      last = { x: qx, y: qy };
    },

    onPointerUp(_ctx, _ev, eng) {
      if (!drawing) return;
      drawing = false;
      last = null;
      acc = 0;

      if (unionRect) {
        eng.expandPendingRectByRect?.(unionRect.x, unionRect.y, unionRect.w, unionRect.h);
      }
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview() {}, // 確定描画のみ
  };

  // ====== スタンプ 1 発 ====================================================
  function stamp(ctx, cx, cy, s) {
    const r = Math.max(0.5, s.brushSize / 2);
    const aa = 1.0; // フチAA幅（1px）

    // AABB
    const minX = Math.floor(cx - r - aa);
    const minY = Math.floor(cy - r - aa);
    const maxX = Math.ceil(cx + r + aa);
    const maxY = Math.ceil(cy + r + aa);
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);

    if (!s.linear) {
      // 速い経路：Canvas の合成モードに委譲（sRGB直）
      ctx.save();
      ctx.globalCompositeOperation = toCanvasOp(s.mode);
      ctx.globalAlpha = clamp01(s.alpha);
      ctx.fillStyle = s.primaryColor;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // 高忠実度：線形空間（手動）ブレンド
      let img;
      try {
        img = ctx.getImageData(minX, minY, w, h);
      } catch (_) {
        // セキュリティ制約等で getImageData が不可 → フォールバック（速い経路）
        ctx.save();
        ctx.globalCompositeOperation = toCanvasOp(s.mode);
        ctx.globalAlpha = clamp01(s.alpha);
        ctx.fillStyle = s.primaryColor;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        unionRect = unionAabb(unionRect, { x: minX, y: minY, w, h });
        return;
      }

      const data = img.data;
      const srcRGB = hexToRgb(s.primaryColor);
      const Cs = {
        r: srgb8_to_lin01(srcRGB.r),
        g: srgb8_to_lin01(srcRGB.g),
        b: srgb8_to_lin01(srcRGB.b),
      };
      const AsBase = clamp01(s.alpha);

      // ループ
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          // ピクセル中心の距離でカバレッジ
          const px = minX + x + 0.5;
          const py = minY + y + 0.5;
          const d = Math.hypot(px - cx, py - cy);
          const t = (r + aa - d) / (aa * 2);
          if (t <= 0) continue;
          const cov = t >= 1 ? 1 : t * t * (3 - 2 * t);
          if (cov <= 0) continue;

          // 既存色（straight sRGB8 → linear straight）
          const Cd = {
            r: srgb8_to_lin01(data[idx + 0]),
            g: srgb8_to_lin01(data[idx + 1]),
            b: srgb8_to_lin01(data[idx + 2]),
          };
          const Ad = data[idx + 3] / 255;

          // 有効α
          const As = clamp01(AsBase * cov);

          // ブレンド関数 B(Cs, Cd)（linear straight）
          let Bl = { r: 0, g: 0, b: 0 };
          switch (s.mode) {
            case 'multiply':
              Bl.r = Cs.r * Cd.r;
              Bl.g = Cs.g * Cd.g;
              Bl.b = Cs.b * Cd.b;
              break;
            case 'screen':
              Bl.r = 1 - (1 - Cs.r) * (1 - Cd.r);
              Bl.g = 1 - (1 - Cs.g) * (1 - Cd.g);
              Bl.b = 1 - (1 - Cs.b) * (1 - Cd.b);
              break;
            case 'add':
              Bl.r = Math.min(1, Cs.r + Cd.r);
              Bl.g = Math.min(1, Cs.g + Cd.g);
              Bl.b = Math.min(1, Cs.b + Cd.b);
              break;
            default: // normal
              Bl = Cs;
              break;
          }

          // 合成（source-over, straight）
          // C' = Ad*Cd*(1-As) + As*B(Cs,Cd)
          // A' = As + Ad*(1-As)
          const Aout = As + Ad * (1 - As);
          const Cpr = Ad * Cd.r * (1 - As) + As * Bl.r;
          const Cpg = Ad * Cd.g * (1 - As) + As * Bl.g;
          const Cpb = Ad * Cd.b * (1 - As) + As * Bl.b;

          data[idx + 0] = lin01_to_srgb8(Cpr);
          data[idx + 1] = lin01_to_srgb8(Cpg);
          data[idx + 2] = lin01_to_srgb8(Cpb);
          data[idx + 3] = Math.max(0, Math.min(255, Math.round(Aout * 255)));
        }
      }
      ctx.putImageData(img, minX, minY);
    }

    // AABB 統合
    unionRect = unionAabb(unionRect, { x: minX, y: minY, w, h });
  }

  // ====== ユーティリティ ===================================================
  function toCanvasOp(mode) {
    switch (mode) {
      case 'multiply': return 'multiply';
      case 'screen':   return 'screen';
      case 'add':      return 'lighter'; // 近似（標準Canvasは 'add' 非対応）
      default:         return 'source-over';
    }
  }

  function hexToRgb(hex) {
    const n = hex.startsWith('#') ? hex.slice(1) : hex;
    const v = parseInt(n.length === 3 ? n.replace(/(.)/g, '$1$1') : n, 16) >>> 0;
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function srgb8_to_lin01(u8) {
    const c = u8 / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function lin01_to_srgb8(x) {
    const c = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { x: b.x|0, y: b.y|0, w: Math.ceil(b.w), h: Math.ceil(b.h) };
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    const mode = (s.mode === 'multiply' || s.mode === 'add' || s.mode === 'screen') ? s.mode : 'normal';
    return {
      brushSize: clampNum(s.brushSize ?? defs.brushSize, 1, 512),
      primaryColor: s.primaryColor || defs.primaryColor,
      alpha: clampNum(s.alpha ?? defs.alpha, 0.2, 1.0),
      mode,
      spacingRatio: clampNum(s.spacingRatio ?? defs.spacingRatio, 0.1, 2.0),
      linear: !!(s.linear ?? defs.linear),
    };
  }
  function clampNum(v, lo, hi) { v = +v; if (!Number.isFinite(v)) v = lo; return v < lo ? lo : (v > hi ? hi : v); }
}
