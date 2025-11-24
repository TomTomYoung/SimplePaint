/*
 * ツール仕様
 * 概要: 表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。
 * 入力: ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。
 * 出力: 質感や模様を含むストロークやスタンプ。
 * 操作: 左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
 */
/**
 * Height / Normal-aware（凹凸依存）
 * 紙のハイト/ノーマルマップを参照して、スタンプの「濃度（α）」「色」「幅」を局所変調します。
 * - 距離主導スタンプ（円形・プリマルチ前提の単色）をベースに、n·l と曲率（n.z）で変調
 * - マップは store.getToolState(id) に normalMap もしくは heightMap（CanvasImageSource）を渡します
 * - normalMap があれば優先（tangent-space想定、RGB→[-1,1] で復元）
 *
 * 主要パラメータ（store.getToolState('height-normal')）
 *   brushSize:      8..64px（既定 18）
 *   primaryColor:   塗り色
 *   opacity:        基本不透明度（既定 1.0）
 *   strength:       0.1..0.4（既定 0.25）  … 変調の強さ
 *   lightAzimuth:   光の方位角 deg（既定 45°）
 *   lightElevation: 光の仰角 deg（既定 60°）
 *   heightScale:    ハイト勾配 → 法線化のスケール（0.5..2.0, 既定 1.0）
 *   spacingRatio:   Δs = spacingRatio * brushSize（既定 0.5）
 *   normalMap:      CanvasImageSource | null
 *   heightMap:      CanvasImageSource | null（normal が無い場合のみ使用）
 *
 * 再描画通知：スタンプ AABB を統合して onPointerUp 時に 1 回（タイルレンダラと相性良）
 *
 * 注意：
 * - マップとキャンバスの解像度が異なる場合は最近傍/簡易バイリニアでサンプリングします
 * - 変調が強すぎるとノイズ化するため、αと幅の係数は安全域でクリップしています
 */
export function makeHeightNormalAwareBrush(store) {
  const id = 'height-normal';

  let drawing = false;
  let last = null;
  let acc = 0;
  let unionRect = null;

  // マップキャッシュ
  const cache = {
    srcKey: null,          // normalMap or heightMap の参照キー
    w: 0, h: 0,
    hasNormal: false,
    // 法線（画像から復元 or 高さ→Sobel→法線化）
    nx: null, ny: null, nz: null, // Float32Array
  };

  const DEFAULTS = {
    brushSize: 18,
    primaryColor: '#000',
    opacity: 1.0,
    strength: 0.25,          // 0.1〜0.4 推奨
    lightAzimuth: 45,        // 方位角（0: +X 右、90: +Y 下）
    lightElevation: 60,      // 仰角
    heightScale: 1.0,        // ハイト→法線
    spacingRatio: 0.5,
    normalMap: null,
    heightMap: null,
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      const s = getState(store, id, DEFAULTS);
      ensureNormalCache(s, ctx);

      drawing = true;
      last = { ...ev.img };
      acc = 0;
      unionRect = null;

      // 起点スタンプ
      stamp(ctx, last.x, last.y, s, eng);
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

    onPointerUp(ctx, _ev, eng) {
      if (!drawing) return;
      drawing = false;
      last = null;
      acc = 0;

      if (unionRect) {
        eng.expandPendingRectByRect?.(unionRect.x, unionRect.y, unionRect.w, unionRect.h);
      }
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview(octx) {
      // 軽量プレビュー：通常ポリライン（色はそのまま）
      if (!drawing || !last) return;
      // ここでは簡素化のため未実装（必要なら previous pts を保持して描画）
    },
  };

  // ========= スタンプ（変調） ==============================================
  function stamp(ctx, x, y, s) {
    // 法線取得（なければ平坦面）
    const n = sampleNormal(cache, x, y, ctx.canvas.width, ctx.canvas.height) || { x: 0, y: 0, z: 1 };

    // 光源ベクトル
    const L = lightDir(s.lightAzimuth, s.lightElevation);

    // 漫反射的な係数（0..1）
    let ndotl = n.x * L.x + n.y * L.y + n.z * L.z;
    ndotl = Math.max(0, Math.min(1, ndotl));

    // 変調：αと幅
    const k = clamp(s.strength, 0.01, 0.6);
    const alphaFactor = clamp(1 + (ndotl - 0.5) * 2 * k, 0.25, 1.75);
    const slope = 1 - Math.max(0, Math.min(1, n.z)); // 傾斜（0..1）
    const widthFactor = clamp(1 + 0.5 * k * slope, 0.8, 1.4);

    const r = Math.max(0.5, (s.brushSize * widthFactor) / 2);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = s.primaryColor;
    ctx.globalAlpha = clamp(s.opacity * alphaFactor, 0, 1);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // AABB 統合
    const pad = 2;
    const rect = {
      x: Math.floor(x - r - pad),
      y: Math.floor(y - r - pad),
      w: Math.ceil(r * 2 + pad * 2),
      h: Math.ceil(r * 2 + pad * 2),
    };
    unionRect = unionAabb(unionRect, rect);
  }

  // ========= マップの用意 / 法線キャッシュ ================================
  function ensureNormalCache(s, ctx) {
    // 参照キーが変わっていなければ再利用
    const key = s.normalMap || s.heightMap || null;
    if (key === cache.srcKey && cache.nx && cache.ny && cache.nz) return;

    cache.srcKey = key;
    cache.w = 0; cache.h = 0;
    cache.nx = cache.ny = cache.nz = null;
    cache.hasNormal = false;

    if (!key) return;

    // 画像をキャンバスに乗せて ImageData へ
    const tmp = document.createElement('canvas');
    const iw = (key.width  || key.videoWidth  || ctx.canvas.width) | 0;
    const ih = (key.height || key.videoHeight || ctx.canvas.height) | 0;
    tmp.width = iw; tmp.height = ih;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    try {
      tctx.drawImage(key, 0, 0, iw, ih);
    } catch (_) {
      // クロスオリジン等で drawImage できない場合は諦める
      return;
    }
    const img = tctx.getImageData(0, 0, iw, ih);
    cache.w = iw; cache.h = ih;

    if (s.normalMap) {
      // RGB → [-1,1] 正規化
      const [nx, ny, nz] = imgToNormalArrays(img);
      cache.nx = nx; cache.ny = ny; cache.nz = nz;
      cache.hasNormal = true;
    } else if (s.heightMap) {
      // グレイスケール → Sobel 勾配 → 法線
      const H = imgToHeight(img);
      const [nx, ny, nz] = heightToNormal(H, iw, ih, clamp(s.heightScale, 0.1, 5));
      cache.nx = nx; cache.ny = ny; cache.nz = nz;
      cache.hasNormal = false;
    }
  }

  function sampleNormal(c, x, y, CW, CH) {
    if (!c.nx || !c.ny || !c.nz || c.w === 0 || c.h === 0) return null;
    // キャンバス座標 → マップ座標
    const u = x / CW * (c.w - 1);
    const v = y / CH * (c.h - 1);

    // 簡易バイリニア
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const x1 = Math.min(c.w - 1, x0 + 1), y1 = Math.min(c.h - 1, y0 + 1);
    const tx = u - x0, ty = v - y0;
    const i00 = y0 * c.w + x0, i10 = y0 * c.w + x1, i01 = y1 * c.w + x0, i11 = y1 * c.w + x1;

    const nx = lerp(lerp(c.nx[i00], c.nx[i10], tx), lerp(c.nx[i01], c.nx[i11], tx), ty);
    const ny = lerp(lerp(c.ny[i00], c.ny[i10], tx), lerp(c.ny[i01], c.ny[i11], tx), ty);
    const nz = lerp(lerp(c.nz[i00], c.nz[i10], tx), lerp(c.nz[i01], c.nz[i11], tx), ty);

    // 念のため正規化
    const inv = 1 / Math.max(1e-6, Math.hypot(nx, ny, nz));
    return { x: nx * inv, y: ny * inv, z: nz * inv };
    // ※ normalMap が tangent-space の場合もここでは画面空間ベースで解釈（紙面固定前提）
  }

  // ========= 画像 → 法線/高さ =============================================
  function imgToNormalArrays(img) {
    const w = img.width, h = img.height, data = img.data;
    const n = w * h;
    const nx = new Float32Array(n), ny = new Float32Array(n), nz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const x = r / 255 * 2 - 1;
      const y = g / 255 * 2 - 1;
      const z = b / 255 * 2 - 1;
      const inv = 1 / Math.max(1e-6, Math.hypot(x, y, z));
      nx[i] = x * inv; ny[i] = y * inv; nz[i] = z * inv;
    }
    return [nx, ny, nz];
  }

  function imgToHeight(img) {
    const w = img.width, h = img.height, data = img.data;
    const H = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      // 輝度（BT.709 近似）
      H[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }
    return H;
  }

  function heightToNormal(H, w, h, scale) {
    const nx = new Float32Array(w * h);
    const ny = new Float32Array(w * h);
    const nz = new Float32Array(w * h);
    // Sobel カーネル
    const kx = [-1,0,1,-2,0,2,-1,0,1];
    const ky = [-1,-2,-1,0,0,0,1,2,1];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let gx = 0, gy = 0;
        let idx = 0;
        for (let j = -1; j <= 1; j++) {
          const yy = clampInt(y + j, 0, h - 1);
          for (let i = -1; i <= 1; i++) {
            const xx = clampInt(x + i, 0, w - 1);
            const v = H[yy * w + xx];
            gx += v * kx[idx];
            gy += v * ky[idx];
            idx++;
          }
        }
        const nxv = -gx * scale;
        const nyv = -gy * scale;
        const nzv = 1.0;
        const inv = 1 / Math.max(1e-6, Math.hypot(nxv, nyv, nzv));
        const k = (y * w + x);
        nx[k] = nxv * inv; ny[k] = nyv * inv; nz[k] = nzv * inv;
      }
    }
    return [nx, ny, nz];
  }

  // ========= ユーティリティ ===============================================
  function lightDir(azDeg, elDeg) {
    const az = (azDeg * Math.PI) / 180;
    const el = (elDeg * Math.PI) / 180;
    const x = Math.cos(az) * Math.cos(el);
    const y = Math.sin(az) * Math.cos(el);
    const z = Math.sin(el);
    return { x, y, z };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { x: b.x|0, y: b.y|0, w: Math.ceil(b.w), h: Math.ceil(b.h) };
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clampInt(v, lo, hi) { v = v|0; return v < lo ? lo : (v > hi ? hi : v); }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clamp(Number(s.brushSize ?? defs.brushSize), 1, 256),
      primaryColor: s.primaryColor || defs.primaryColor,
      opacity: clamp(Number(s.opacity ?? defs.opacity), 0, 1),
      strength: clamp(Number(s.strength ?? defs.strength), 0.05, 0.6),
      lightAzimuth: Number.isFinite(s.lightAzimuth) ? s.lightAzimuth : defs.lightAzimuth,
      lightElevation: Number.isFinite(s.lightElevation) ? s.lightElevation : defs.lightElevation,
      heightScale: clamp(Number(s.heightScale ?? defs.heightScale), 0.1, 5.0),
      spacingRatio: Number.isFinite(s.spacingRatio) ? s.spacingRatio : defs.spacingRatio,
      normalMap: s.normalMap || null,
      heightMap: s.heightMap || null,
    };
  }
}
