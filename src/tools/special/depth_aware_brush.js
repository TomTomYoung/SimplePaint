// ツール仕様: 概要=表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。 入力=ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。 出力=質感や模様を含むストロークやスタンプ。 操作=左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
/**
 * Depth-Aware（奥行き）
 * Z/ステンシルに基づいて可視部分のみ合成するブラシ。
 *
 * 仕様
 * - 深度バッファ（0..1, 小さいほど手前）とステンシル（0/1）を参照
 * - 深度比較: 'less' | 'lequal'（既定 'lequal'）
 * - ブラシ側の深度は一定値（brushDepth）または深度画像（brushDepthImage）で与える
 * - 画像系ソース（CanvasImageSource）は内部でキャンバス解像度へ一度だけリサンプル＆キャッシュ
 * - 再描画通知: 通常はスタンプAABB。深度/ステンシルの更新（version増加）時はキャンバス全体
 *
 * store.getToolState('depth-aware') 主パラメータ:
 *   brushSize        : px（既定 18）
 *   primaryColor     : '#rrggbb'
 *   alpha            : 0..1（既定 1）
 *   spacingRatio     : Δs = spacingRatio * brushSize（既定 0.5）
 *   depthBuffer      : Float32Array | null（長さ = canvasW*canvasH, 0..1）
 *   depthImage       : CanvasImageSource | null（0..1を8bitにしたL/Alpha画像など）
 *   brushDepth       : 0..1（一定深度。brushDepthImageがあれば無視）
 *   brushDepthImage  : CanvasImageSource | null（ブラシ側の深度分布。0..1を想定）
 *   depthCompare     : 'less' | 'lequal'（既定 'lequal'）
 *   writeDepth       : boolean（trueで合格ピクセルにbrushDepthを書き戻し）
 *   stencilBuffer    : Uint8Array | null（0/1, 長さ = canvasW*canvasH）
 *   stencilImage     : CanvasImageSource | null（αやLumaを使用, 0..1 > 0.5 を pass）
 *   stencilThreshold : 0..1（画像時の閾値, 既定 0.5）
 *   depthVersion     : number（深度の変更検知用）
 *   stencilVersion   : number（ステンシルの変更検知用）
 */
export function makeDepthAwareBrush(store) {
  const id = 'depth-aware';

  let drawing = false;
  let last = null;
  let acc = 0;
  let unionRect = null;

  // キャッシュ（キャンバス解像度へ展開した Z / Stencil / BrushZ）
  const cache = {
    keyZ: null, w: 0, h: 0, z: null, // Float32Array
    keyS: null, s: null,             // Uint8Array (0/1)
    keyBZ: null, bz: null,           // Float32Array（ブラシ側Z）
    tmpCvs: null, tmpCtx: null,
  };

  const DEFAULTS = {
    brushSize: 18,
    primaryColor: '#000000',
    alpha: 1.0,
    spacingRatio: 0.5,

    depthBuffer: null,
    depthImage: null,
    brushDepth: 0.0,
    brushDepthImage: null,
    depthCompare: 'lequal',
    writeDepth: false,

    stencilBuffer: null,
    stencilImage: null,
    stencilThreshold: 0.5,

    depthVersion: 0,
    stencilVersion: 0,
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      const s = getState(store, id, DEFAULTS);
      const wideInvalid = ensureDepthStencil(ctx, s);
      if (wideInvalid) {
        // 深度/ステンシルの更新検知 → 広域無効化
        eng.expandPendingRectByRect?.(0, 0, ctx.canvas.width, ctx.canvas.height);
      }

      drawing = true;
      last = { ...ev.img };
      acc = 0;
      unionRect = null;

      stampDepthAware(ctx, last.x, last.y, s);
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
        const nx = px + dx * t, ny = py + dy * t;
        stampDepthAware(ctx, nx, ny, s);
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

    // 軽量プレビュー：ブラシ円
    drawPreview(octx) {
      if (!drawing || !last) return;
      const s = getState(store, id, DEFAULTS);
      octx.save();
      octx.strokeStyle = '#00000044';
      octx.setLineDash([4, 4]);
      octx.lineWidth = 1;
      octx.beginPath();
      octx.arc(last.x + 0.5, last.y + 0.5, s.brushSize / 2, 0, Math.PI * 2);
      octx.stroke();
      octx.restore();
    },
  };

  // =============== スタンプ（Z/Stencil を考慮して合成） ===================
  function stampDepthAware(ctx, cx, cy, s) {
    const r = Math.max(0.5, s.brushSize / 2);
    const aa = 1.0; // 境界補間余白

    const minX = Math.floor(cx - r - aa - 1);
    const minY = Math.floor(cy - r - aa - 1);
    const maxX = Math.ceil(cx + r + aa + 1);
    const maxY = Math.ceil(cy + r + aa + 1);
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);

    let img;
    try {
      img = ctx.getImageData(minX, minY, w, h);
    } catch (_) {
      // セキュリティ制約などで失敗したら早期リターン
      return;
    }
    const data = img.data;

    // アクセサ
    const getZ = makeDepthAccessor(ctx, s);
    const getBZ = makeBrushDepthAccessor(ctx, s);
    const getS = makeStencilAccessor(ctx, s);

    const col = hexToRgb(s.primaryColor);
    const isLe = (s.depthCompare === 'less' ? false : true); // 'lequal' 既定

    for (let y = 0; y < h; y++) {
      const py = minY + y + 0.5;
      for (let x = 0; x < w; x++) {
        const px = minX + x + 0.5;

        // ブラシカバレッジ
        const d = Math.hypot(px - cx, py - cy);
        const t = (r + aa - d) / (aa * 2);
        if (t <= 0) continue;
        const cov = t >= 1 ? 1 : t * t * (3 - 2 * t);
        if (cov <= 0) continue;

        // ステンシル
        if (!getS(px, py)) continue;

        // 深度テスト
        const zb = getBZ(px, py);          // ブラシ深度（一定 or 画像）
        const zt = getZ(px, py);           // 既存シーン深度
        if (zt == null || zb == null) continue;

        let pass = false;
        if (isLe) pass = (zb <= zt + 1e-6);      // lequal
        else pass = (zb < zt - 1e-6);            // less
        if (!pass) continue;

        // 合成（sRGB直近似の over）
        const a = clamp01(s.alpha * cov);
        const inv = 1 - a;
        const idx = (y * w + x) * 4;
        data[idx + 0] = col.r * a + data[idx + 0] * inv;
        data[idx + 1] = col.g * a + data[idx + 1] * inv;
        data[idx + 2] = col.b * a + data[idx + 2] * inv;
        data[idx + 3] = 255 * a + data[idx + 3] * inv;

        // 深度書き戻し
        if (s.writeDepth) {
          writeDepth(px, py, zb, ctx.canvas.width, ctx.canvas.height, s);
        }
      }
    }

    ctx.putImageData(img, minX, minY);
    unionRect = unionAabb(unionRect, { x: minX, y: minY, w, h });
  }

  // =============== 深度 / ブラシ深度 / ステンシル アクセサ =================

  function ensureTmp(ctx) {
    if (!cache.tmpCvs) {
      cache.tmpCvs = document.createElement('canvas');
      cache.tmpCtx = cache.tmpCvs.getContext('2d', { willReadFrequently: true });
    }
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (cache.tmpCvs.width !== W || cache.tmpCvs.height !== H) {
      cache.tmpCvs.width = W; cache.tmpCvs.height = H;
    }
  }

  function ensureDepthStencil(ctx, s) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    let wideInvalid = false;

    // ---- 深度
    const keyZ = [
      'W', W, 'H', H,
      'ver', (s.depthVersion|0),
      'buf', !!s.depthBuffer,
      'img', !!s.depthImage
    ].join(':');

    if (cache.keyZ !== keyZ || cache.w !== W || cache.h !== H) {
      cache.keyZ = keyZ; cache.w = W; cache.h = H;

      if (s.depthBuffer && s.depthBuffer.length === W * H) {
        cache.z = s.depthBuffer; // 直接参照（書換えに注意）
      } else if (s.depthImage) {
        ensureTmp(ctx);
        try {
          cache.tmpCtx.clearRect(0, 0, W, H);
          cache.tmpCtx.drawImage(s.depthImage, 0, 0, W, H);
          const img = cache.tmpCtx.getImageData(0, 0, W, H).data;
          cache.z = new Float32Array(W * H);
          for (let i = 0, j = 0; i < cache.z.length; i++, j += 4) {
            // alpha 優先、無ければ luma を 0..1 に
            const a = img[j + 3] / 255;
            const L = (0.2126 * img[j] + 0.7152 * img[j + 1] + 0.0722 * img[j + 2]) / 255;
            cache.z[i] = (a > 0 ? a : L);
          }
        } catch (_) {
          cache.z = null;
        }
      } else {
        cache.z = null;
      }
      wideInvalid = true;
    }

    // ---- ブラシ深度（画像）
    const keyBZ = [
      'W', W, 'H', H,
      'bz_img', !!s.brushDepthImage,
      'bz_const', Number.isFinite(s.brushDepth) ? s.brushDepth : 0
    ].join(':');

    if (cache.keyBZ !== keyBZ) {
      cache.keyBZ = keyBZ;
      if (s.brushDepthImage) {
        ensureTmp(ctx);
        try {
          cache.tmpCtx.clearRect(0, 0, W, H);
          cache.tmpCtx.drawImage(s.brushDepthImage, 0, 0, W, H);
          const img = cache.tmpCtx.getImageData(0, 0, W, H).data;
          cache.bz = new Float32Array(W * H);
          for (let i = 0, j = 0; i < cache.bz.length; i++, j += 4) {
            const a = img[j + 3] / 255;
            const L = (0.2126 * img[j] + 0.7152 * img[j + 1] + 0.0722 * img[j + 2]) / 255;
            cache.bz[i] = (a > 0 ? a : L);
          }
        } catch (_) {
          cache.bz = null;
        }
      } else {
        // 一定深度 → lazy accessor で使用
        cache.bz = null;
      }
    }

    // ---- ステンシル
    const keyS = [
      'W', W, 'H', H,
      'ver', (s.stencilVersion|0),
      'buf', !!s.stencilBuffer,
      'img', !!s.stencilImage,
      'th', s.stencilThreshold
    ].join(':');

    if (cache.keyS !== keyS) {
      cache.keyS = keyS;
      if (s.stencilBuffer && s.stencilBuffer.length === W * H) {
        cache.s = s.stencilBuffer; // 0/1想定
      } else if (s.stencilImage) {
        ensureTmp(ctx);
        try {
          cache.tmpCtx.clearRect(0, 0, W, H);
          cache.tmpCtx.drawImage(s.stencilImage, 0, 0, W, H);
          const img = cache.tmpCtx.getImageData(0, 0, W, H).data;
          cache.s = new Uint8Array(W * H);
          const th = clamp01(s.stencilThreshold || 0.5);
          for (let i = 0, j = 0; i < cache.s.length; i++, j += 4) {
            const a = img[j + 3] / 255;
            const L = (0.2126 * img[j] + 0.7152 * img[j + 1] + 0.0722 * img[j + 2]) / 255;
            const v = (a > 0 ? a : L);
            cache.s[i] = v >= th ? 1 : 0;
          }
        } catch (_) {
          cache.s = null;
        }
      } else {
        cache.s = null; // ステンシル無し＝常にパス
      }
      wideInvalid = true;
    }

    return wideInvalid;
  }

  function makeDepthAccessor(ctx, s) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const z = cache.z;
    if (!z) return () => null;
    return (x, y) => {
      const xi = x | 0, yi = y | 0;
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) return null;
      return z[yi * W + xi];
    };
  }

  function makeBrushDepthAccessor(ctx, s) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (cache.bz && cache.bz.length === W * H) {
      const bz = cache.bz;
      return (x, y) => {
        const xi = x | 0, yi = y | 0;
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) return null;
        return bz[yi * W + xi];
      };
    }
    // 一定深度
    const bzConst = clamp01(Number.isFinite(s.brushDepth) ? s.brushDepth : 0.0);
    return () => bzConst;
  }

  function writeDepth(x, y, zVal, W, H, s) {
    if (cache.z && cache.z.length === W * H) {
      const xi = x | 0, yi = y | 0;
      if (xi >= 0 && yi >= 0 && xi < W && yi < H) {
        cache.z[yi * W + xi] = zVal;
      }
    }
    // depthImage を与えている場合は書き戻せない（読み取り専用）
  }

  function makeStencilAccessor(ctx, s) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const st = cache.s;
    if (!st) return () => true; // ステンシル無し → 常にパス
    return (x, y) => {
      const xi = x | 0, yi = y | 0;
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) return false;
      return st[yi * W + xi] !== 0;
    };
  }

  // =============== Utils ====================================================
  function hexToRgb(hex) {
    const n = hex.startsWith('#') ? hex.slice(1) : hex;
    const v = parseInt(n.length === 3 ? n.replace(/(.)/g, '$1$1') : n, 16) >>> 0;
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { x: b.x|0, y: b.y|0, w: Math.ceil(b.w), h: Math.ceil(b.h) };
    const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    const cmp = (s.depthCompare === 'less' ? 'less' : 'lequal');
    return {
      brushSize:     clampNum(s.brushSize ?? defs.brushSize, 1, 512),
      primaryColor:  s.primaryColor || defs.primaryColor,
      alpha:         clamp01(s.alpha ?? defs.alpha),
      spacingRatio:  clampNum(s.spacingRatio ?? defs.spacingRatio, 0.1, 2.0),

      depthBuffer:   s.depthBuffer || null,
      depthImage:    s.depthImage || null,
      brushDepth:    Number.isFinite(s.brushDepth) ? s.brushDepth : defs.brushDepth,
      brushDepthImage: s.brushDepthImage || null,
      depthCompare:  cmp,
      writeDepth:    !!(s.writeDepth ?? defs.writeDepth),

      stencilBuffer: s.stencilBuffer || null,
      stencilImage:  s.stencilImage || null,
      stencilThreshold: clamp01(s.stencilThreshold ?? defs.stencilThreshold),

      depthVersion:  (s.depthVersion|0) || 0,
      stencilVersion:(s.stencilVersion|0) || 0,
    };
  }
  function clampNum(v, lo, hi) { v = +v; if (!Number.isFinite(v)) v = lo; return v < lo ? lo : (v > hi ? hi : v); }
}
