/**
 * Palette-Mapped（制限色）
 * 入力色をパレットへ量子化し（最近傍色）、任意で誤差拡散（Floyd–Steinberg）を適用して塗布。
 * - 距離主導の円スタンプ（source-over, 非プリマルチ簡易合成）
 * - 誤差拡散はスタンプAABB内のみ。カーネルにより AABB を 1px 拡張して通知
 *
 * store.getToolState('palette-mapped') で主なパラメータ：
 *   brushSize:   8..48px     （既定 18）
 *   primaryColor:#rrggbb     （既定 '#000'）
 *   opacity:     0..1        （既定 1.0）
 *   palette:     ['#...']    （配列／省略時はデフォルト16色）
 *   paletteSize: 8..32       （palette省略時に既定から切り出し）
 *   useDither:   boolean     （既定 true）
 *   noise:       0..0.2      （誤差拡散のランダム化量, 既定 0.03）
 */
function makePaletteMappedBrush(store) {
  const id = 'palette-mapped';

  let drawing = false;
  let last = null;
  let acc = 0;
  let unionRect = null;

  // 乱数（ストロークごと固定シード）
  let strokeSeed = 1;

  const DEFAULTS = {
    brushSize: 18,
    primaryColor: '#000000',
    opacity: 1.0,
    palette: null,
    paletteSize: 16,
    useDither: true,
    noise: 0.03,
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
      strokeSeed = ((Math.random() * 0x7fffffff) | 0) ^ (Date.now() & 0x7fffffff);

      const s = getState(store, id, DEFAULTS);
      stampPalette(ctx, last.x, last.y, s);
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !last) return;
      const s = getState(store, id, DEFAULTS);

      const spacing = Math.max(1, 0.5 * s.brushSize); // Δs ≈ w/2
      let px = last.x, py = last.y;
      const qx = ev.img.x, qy = ev.img.y;
      let dx = qx - px, dy = qy - py;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) return;

      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;
        const nx = px + dx * t, ny = py + dy * t;
        stampPalette(ctx, nx, ny, s);
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

    drawPreview() {}, // 量子化結果が確定描画なのでプレビュー不要
  };

  // =============== スタンプ（量子化＋誤差拡散） ===========================
  function stampPalette(ctx, cx, cy, s) {
    const r = Math.max(0.5, s.brushSize / 2);
    const aa = 1.0;

    // AABB（誤差拡散の隣接行/列に 1px 余白）
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
      // セキュリティ制約等で失敗した場合はフォールバック（直接塗り）
      ctx.save();
      ctx.globalAlpha = s.opacity;
      ctx.fillStyle = nearestPaletteHex(s.primaryColor, s);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      unionRect = unionAabb(unionRect, { x: minX, y: minY, w, h });
      return;
    }

    const data = img.data;

    // パレット（lin & srgb8）
    const pal = ensurePalette(s);
    const palLin = pal.lin;    // Float32: [r,g,b]*N (0..1, linear)
    const palS8  = pal.s8;     // Uint8:   [r,g,b]*N (0..255, srgb)

    // 入力色（linear）
    const srcLin = hexToLin01(s.primaryColor);

    // 誤差バッファ
    const useD = !!s.useDither;
    const errR = useD ? new Float32Array(w * h) : null;
    const errG = useD ? new Float32Array(w * h) : null;
    const errB = useD ? new Float32Array(w * h) : null;

    // 乱数（セルハッシュ）で微小ノイズ
    const noiseAmp = Math.max(0, Math.min(0.2, s.noise || 0));

    function insideMask(ix, iy) {
      const x = minX + ix + 0.5;
      const y = minY + iy + 0.5;
      const d = Math.hypot(x - cx, y - cy);
      return d <= r + aa;
    }
    function coverage(ix, iy) {
      const x = minX + ix + 0.5;
      const y = minY + iy + 0.5;
      const d = Math.hypot(x - cx, y - cy);
      const t = (r + aa - d) / (aa * 2);
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return t * t * (3 - 2 * t);
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;

        if (!insideMask(x, y)) continue;

        const cov = coverage(x, y);
        if (cov <= 0) continue;

        // 入力（linear, 0..1）＋拡散誤差＋微小ノイズ
        const n = (hash3(minX + x, minY + y, strokeSeed) * 2 - 1) * noiseAmp;
        const rin = srcLin.r + (useD ? errR[y * w + x] : 0) + n * 0.5;
        const gin = srcLin.g + (useD ? errG[y * w + x] : 0) + n * 0.3;
        const bin = srcLin.b + (useD ? errB[y * w + x] : 0) + n * 0.2;

        // 最近傍パレット（linear距離）
        const pIdx = nearestPaletteIndexLin(rin, gin, bin, palLin);
        const pr = palS8[pIdx * 3 + 0];
        const pg = palS8[pIdx * 3 + 1];
        const pb = palS8[pIdx * 3 + 2];

        // 合成（sRGB 直で近似）：dst = src*α + dst*(1-α)
        const a = Math.max(0, Math.min(1, s.opacity * cov));
        const inv = 1 - a;
        data[idx + 0] = pr * a + data[idx + 0] * inv;
        data[idx + 1] = pg * a + data[idx + 1] * inv;
        data[idx + 2] = pb * a + data[idx + 2] * inv;
        data[idx + 3] = 255 * a + data[idx + 3] * inv;

        // 誤差拡散（FS）— inside のみに配布、α/カバレッジでスケール
        if (useD) {
          const qLin = {
            r: srgb8_to_lin01(pr),
            g: srgb8_to_lin01(pg),
            b: srgb8_to_lin01(pb),
          };
          const eScale = cov * a; // 端での過大配布を抑制
          const er = (rin - qLin.r) * eScale;
          const eg = (gin - qLin.g) * eScale;
          const eb = (bin - qLin.b) * eScale;

          // FS カーネル
          //      x   7/16
          // 3/16 5/16 1/16  （次行）
          distribute(x + 1, y + 0, 7 / 16, er, eg, eb);
          distribute(x - 1, y + 1, 3 / 16, er, eg, eb);
          distribute(x + 0, y + 1, 5 / 16, er, eg, eb);
          distribute(x + 1, y + 1, 1 / 16, er, eg, eb);
        }
      }
    }

    ctx.putImageData(img, minX, minY);

    // AABB 統合（FS の 1px 余白を含む）
    unionRect = unionAabb(unionRect, { x: minX, y: minY, w, h });

    function distribute(ix, iy, wgt, er, eg, eb) {
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) return;
      if (!insideMask(ix, iy)) return;
      const k = iy * w + ix;
      errR[k] += er * wgt;
      errG[k] += eg * wgt;
      errB[k] += eb * wgt;
    }
  }

  // ================= パレット関連 =================
  function ensurePalette(s) {
    const hexList = Array.isArray(s.palette) && s.palette.length
      ? s.palette.slice(0)
      : defaultPalette(Math.max(8, Math.min(32, s.paletteSize || 16)));

    const N = hexList.length;
    const s8 = new Uint8Array(N * 3);
    const lin = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const { r, g, b } = hexToRgb(hexList[i]);
      s8[i * 3 + 0] = r; s8[i * 3 + 1] = g; s8[i * 3 + 2] = b;
      lin[i * 3 + 0] = srgb8_to_lin01(r);
      lin[i * 3 + 1] = srgb8_to_lin01(g);
      lin[i * 3 + 2] = srgb8_to_lin01(b);
    }
    return { s8, lin, N };
  }

  function nearestPaletteIndexLin(r, g, b, palLin) {
    let best = 0, minD = Infinity;
    for (let i = 0; i < palLin.length; i += 3) {
      const dr = r - palLin[i + 0];
      const dg = g - palLin[i + 1];
      const db = b - palLin[i + 2];
      const d = dr * dr + dg * dg + db * db;
      if (d < minD) { minD = d; best = (i / 3) | 0; }
    }
    return best;
  }

  function nearestPaletteHex(hex, s) {
    const pal = ensurePalette(s);
    const src = hexToLin01(hex);
    const idx = nearestPaletteIndexLin(src.r, src.g, src.b, pal.lin);
    const r = pal.s8[idx * 3 + 0], g = pal.s8[idx * 3 + 1], b = pal.s8[idx * 3 + 2];
    return rgbToHex(r, g, b);
  }

  function defaultPalette(n) {
    // ベースは 16色（PICO-8 風）＋淡色拡張。n に応じて先頭から使用。
    const base = [
      '#000000','#1D2B53','#7E2553','#008751','#AB5236','#5F574F','#C2C3C7','#FFF1E8',
      '#FF004D','#FFA300','#FFEC27','#00E436','#29ADFF','#83769C','#FF77A8','#FFCCAA',
      '#222222','#444444','#888888','#BBBBBB','#FFFFFF','#003355','#114477','#335577',
      '#557799','#7799BB','#99BBEE','#113300','#225500','#447700','#669900','#88BB22'
    ];
    return base.slice(0, n);
  }

  // ================= ユーティリティ =================
  function hexToRgb(hex) {
    const n = hex.startsWith('#') ? hex.slice(1) : hex;
    const v = parseInt(n.length === 3 ? n.replace(/(.)/g, '$1$1') : n, 16) >>> 0;
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function rgbToHex(r, g, b) {
    const s = (x) => x.toString(16).padStart(2, '0');
    return '#' + s(r) + s(g) + s(b);
  }
  function srgb8_to_lin01(u8) {
    const c = u8 / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function lin01_to_srgb8(x) {
    const c = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  }
  function hexToLin01(hex) {
    const { r, g, b } = hexToRgb(hex);
    return { r: srgb8_to_lin01(r), g: srgb8_to_lin01(g), b: srgb8_to_lin01(b) };
  }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { x: b.x|0, y: b.y|0, w: Math.ceil(b.w), h: Math.ceil(b.h) };
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function hash3(x, y, s) {
    // 均一 [0,1) 疑似乱数（座標＋シード）
    let n = (x * 374761393 + y * 668265263) ^ (s | 0);
    n = (n ^ (n >>> 13)) * 1274126177;
    n = (n ^ (n >>> 16)) >>> 0;
    return (n & 0xffff) / 0x10000;
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clampNum(s.brushSize ?? defs.brushSize, 1, 256),
      primaryColor: s.primaryColor || defs.primaryColor,
      opacity: clampNum(s.opacity ?? defs.opacity, 0, 1),
      palette: Array.isArray(s.palette) ? s.palette : defs.palette,
      paletteSize: clampNum(s.paletteSize ?? defs.paletteSize, 2, 32),
      useDither: s.useDither !== undefined ? !!s.useDither : defs.useDither,
      noise: clampNum(s.noise ?? defs.noise, 0, 0.2),
    };
  }
  function clampNum(v, lo, hi) { v = +v; if (!Number.isFinite(v)) v = lo; return v < lo ? lo : (v > hi ? v : v); }
}

window.makePaletteMappedBrush = makePaletteMappedBrush;
