/*
 * ツール仕様
 * 概要: 表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。
 * 入力: ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。
 * 出力: 質感や模様を含むストロークやスタンプ。
 * 操作: 左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
 */
export function makeChalkPastel(store) {
  const id = 'chalk-pastel';

  // ランタイム状態
  let drawing = false;
  let pts = [];
  let acc = 0;            // 弧長残量
  let paperTex = null;    // {w,h,data(Uint8Array 0..255)}
  const EPS = 1e-6;

  // ---- パラメータ既定値 ----
  const DEFAULTS = {
    brushSize: 16,             // w: 8〜24px 推奨（クランプあり）
    paperScale: 1.3,           // 1.0〜2.0
    opacityJitter: 0.2,        // ±0.2
    spacingRatio: 0.45,        // 弧長一定間隔
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
      acc = 0;
      ensurePaperTexture();

      // 最初のスタンプは up でまとめて描く（AABB統合のため）
    },

    onPointerMove(ctx, ev) {
      if (!drawing) return;
      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      if (!last) { pts.push(p); return; }
      const dx = p.x - last.x, dy = p.y - last.y;
      if (dx * dx + dy * dy < 1) return;
      pts.push(p);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) pts.push(p);

      const s = getState(store, id, DEFAULTS);

      // パス平滑化＆等間隔サンプリング
      const path = buildSmoothPath(pts, Math.max(s.brushSize / 2, 0.5));
      const spacing = Math.max(2, s.spacingRatio * s.brushSize);
      const stamps = resampleByDistance(path, spacing);
      if (stamps.length === 0 || s.brushSize <= 0) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // 線形合成でスタンプを順に打つ（紙目を掛けてから OVER 合成）
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const seed = (Date.now() ^ (Math.random() * 0x7fffffff) | 0) & 0x7fffffff;

      for (let i = 0; i < stamps.length; i++) {
        const q = stamps[i];
        const rect = drawChalkStampLinear(ctx, q.x, q.y, s, paperTex, seed + i);
        if (!rect) continue;

        if (rect.x < minX) minX = rect.x;
        if (rect.y < minY) minY = rect.y;
        if (rect.x + rect.w > maxX) maxX = rect.x + rect.w;
        if (rect.y + rect.h > maxY) maxY = rect.y + rect.h;
      }

      // 無効領域（紙目は静的なのでスタンプ範囲のみ）
      if (minX < maxX && minY < maxY) {
        eng.expandPendingRectByRect?.(minX, minY, maxX - minX, maxY - minY);
      }

      pts = [];
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview(octx) {
      if (!drawing || pts.length < 2) return;
      const s = getState(store, id, DEFAULTS);
      const lw = Math.max(s.brushSize || 1, 1);
      const off = lw <= 1 ? 0.5 : 0;

      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.strokeStyle = s.primaryColor || '#000';
      octx.lineWidth = lw;
      octx.beginPath();
      octx.moveTo(pts[0].x + off, pts[0].y + off);
      for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x + off, pts[i].y + off);
      octx.stroke();
      octx.restore();
    },
  };

  // ====== Stamp (linear compositing) ======
  // 仕様: 「紙目テクスチャで乗算/マスク → 線形合成」を満たす
  function drawChalkStampLinear(ctx, cx, cy, s, paper, seed) {
    const w = clamp(s.brushSize, 8, 64);                // 推奨8〜24、上限は安全側で広め
    const r = w / 2;
    if (w <= 0) return null;

    // スタンプ範囲（キャンバスにクリップ）
    const bx = Math.floor(cx - r - 2);
    const by = Math.floor(cy - r - 2);
    const bw = Math.ceil(cx + r + 2) - bx;
    const bh = Math.ceil(cy + r + 2) - by;

    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (bw <= 0 || bh <= 0 || cw === 0 || ch === 0) return null;

    const clip = clipRectToCanvas(bx, by, bw, bh, cw, ch);
    if (!clip) return null;
    const { x, y, w: rw, h: rh } = clip;

    // 既存ピクセル取得
    const img = ctx.getImageData(x, y, rw, rh);
    const data = img.data;

    // 入力色（sRGB→linear）
    const color = hexToRgb(s.primaryColor || '#000000');
    const srcR_lin = srgbToLinear(color.r / 255);
    const srcG_lin = srgbToLinear(color.g / 255);
    const srcB_lin = srgbToLinear(color.b / 255);

    // 紙目スケール（座標→テクスチャ）
    const pscale = clamp(s.paperScale, 0.5, 4.0); // 入力1.0〜2.0を許容拡張
    const tex = paper;

    // 不透明度ランダム（±0.2）
    const jitAmp = clamp(s.opacityJitter, 0, 0.5);
    const jitter = (mulberry32(seed) * 2 - 1) * jitAmp; // -jit..+jit
    const baseAlpha = clamp(1 + jitter, 0, 1);

    // 粉体感: ラジアル・ソフト + 微細ノイズ（スペックル）
    // alpha = baseAlpha * radialFalloff * paperIntensity * speckle
    const r2 = r * r;
    const invR = 1 / Math.max(r, 1);

    for (let j = 0; j < rh; j++) {
      const py = y + j + 0.5;
      const dy = py - cy;
      for (let i = 0; i < rw; i++) {
        const px = x + i + 0.5;
        const dx = px - cx;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > r2) continue;

        const idx = (j * rw + i) * 4;

        // 既存（sRGB→linear）
        const dstR_lin = srgbToLinear(data[idx] / 255);
        const dstG_lin = srgbToLinear(data[idx + 1] / 255);
        const dstB_lin = srgbToLinear(data[idx + 2] / 255);
        const dstA = data[idx + 3] / 255;

        // ラジアル・ソフト（smoothstep）
        const d = Math.sqrt(dist2) * invR; // 0..1
        let radial = 1 - d;                // 1..0
        radial = radial <= 0 ? 0 : (radial >= 1 ? 1 : (radial * radial * (3 - 2 * radial)));

        // 紙目（グレイスケール 0..1）
        const uu = (px / pscale) % tex.w;   // タイル
        const vv = (py / pscale) % tex.h;
        const paperI = samplePaper(tex, uu, vv);

        // スペックル（高速ハッシュ） 0.85..1.15 ぐらい
        const speck = 0.85 + 0.3 * hash01_fast(px * 97 + py * 57 + seed * 131);

        // src alpha（straight）
        const srcA = clamp(baseAlpha * radial * paperI * speck, 0, 1);

        if (srcA <= 0) continue;

        // Porter–Duff over（linear space）
        const outA = srcA + dstA * (1 - srcA);
        const outR_lin = (srcR_lin * srcA + dstR_lin * dstA * (1 - srcA)) / (outA || 1);
        const outG_lin = (srcG_lin * srcA + dstG_lin * dstA * (1 - srcA)) / (outA || 1);
        const outB_lin = (srcB_lin * srcA + dstB_lin * dstA * (1 - srcA)) / (outA || 1);

        // 戻す: linear → sRGB
        data[idx]     = linearToSrgb(outR_lin);
        data[idx + 1] = linearToSrgb(outG_lin);
        data[idx + 2] = linearToSrgb(outB_lin);
        data[idx + 3] = Math.round(clamp(outA, 0, 1) * 255);
      }
    }

    ctx.putImageData(img, x, y);
    return { x, y, w: rw, h: rh };
  }

  // ===== Paper Texture =====
  function ensurePaperTexture() {
    if (paperTex) return paperTex;
    // 256x256 のフラクタルバリューノイズ（高速＆タイル可）
    const W = 256, H = 256;
    const data = new Uint8Array(W * H);
    const oct = 4;
    const seed = (Math.random() * 0x7fffffff) | 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let amp = 1, freq = 1 / 32, v = 0, norm = 0;
        for (let o = 0; o < oct; o++) {
          const nx = x * freq, ny = y * freq;
          const n = valueNoise2D(nx, ny, seed + o * 1013);
          v += n * amp;
          norm += amp;
          amp *= 0.5;
          freq *= 2;
        }
        v = v / norm;               // 0..1
        const g = Math.round(180 + 75 * v); // 多少明るめ（チョーク乗算向け）
        data[y * W + x] = g;        // 0..255
      }
    }
    paperTex = { w: W, h: H, data };
    return paperTex;
  }

  // バイリニアサンプル（タイル）
  function samplePaper(tex, u, v) {
    let x = u % tex.w; if (x < 0) x += tex.w;
    let y = v % tex.h; if (y < 0) y += tex.h;

    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = (x0 + 1) % tex.w, y1 = (y0 + 1) % tex.h;
    const tx = x - x0, ty = y - y0;

    const i00 = tex.data[y0 * tex.w + x0] / 255;
    const i10 = tex.data[y0 * tex.w + x1] / 255;
    const i01 = tex.data[y1 * tex.w + x0] / 255;
    const i11 = tex.data[y1 * tex.w + x1] / 255;

    const a = i00 * (1 - tx) + i10 * tx;
    const b = i01 * (1 - tx) + i11 * tx;
    return a * (1 - ty) + b * ty; // 0..1
  }

  // ===== Utilities =====
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      primaryColor: s.primaryColor || '#000',
      brushSize: clamp(Number(s.brushSize ?? defs.brushSize), 1, 128),
      paperScale: Number.isFinite(s.paperScale) ? s.paperScale : defs.paperScale,
      opacityJitter: Number.isFinite(s.opacityJitter) ? s.opacityJitter : defs.opacityJitter,
      spacingRatio: Number.isFinite(s.spacingRatio) ? s.spacingRatio : defs.spacingRatio,
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

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

  // sRGB <-> Linear（0..1）
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

  // 1D/2D value noise（軽量）
  function valueNoise2D(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const h00 = hash01((xi    ) ^ ((yi    ) << 16), seed);
    const h10 = hash01((xi + 1) ^ ((yi    ) << 16), seed);
    const h01 = hash01((xi    ) ^ ((yi + 1) << 16), seed);
    const h11 = hash01((xi + 1) ^ ((yi + 1) << 16), seed);
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    const a = h00 * (1 - sx) + h10 * sx;
    const b = h01 * (1 - sx) + h11 * sx;
    return a * (1 - sy) + b * sy; // 0..1
  }

  function hash01(i, seed) {
    let h = (i | 0) ^ (seed | 0);
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function hash01_fast(n) {
    // 高速単項ハッシュ（0..1）
    let x = Math.imul(Math.floor(n) ^ 123987123, 374761393);
    x = (x ^ (x >>> 13)) * 1274126177;
    x = x ^ (x >>> 16);
    return (x >>> 0) / 4294967295;
  }
  function mulberry32(a) {
    return (function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967295;
    })();
  }

  // ===== Path helpers (既存様式) =====
  function buildSmoothPath(pts, ds) {
    if (!pts || pts.length === 0) return [];
    const sm = emaSmooth(pts, 0.4);
    const cr = centripetalCRSpline(sm, 16);
    const rs = resampleByDistance(cr, Math.max(ds || 2, 0.5));
    if (cr.length) {
      const a = cr[cr.length - 1], b = rs[rs.length - 1];
      if (!b || b.x !== a.x || b.y !== a.y) rs.push({ x: a.x, y: a.y });
    }
    return rs;
  }

  function emaSmooth(points, alpha) {
    if (points.length === 0) return [];
    const out = [{ ...points[0] }];
    for (let i = 1; i < points.length; i++) {
      const prev = out[out.length - 1];
      const p = points[i];
      out.push({ x: alpha * p.x + (1 - alpha) * prev.x, y: alpha * p.y + (1 - alpha) * prev.y });
    }
    return out;
  }

  function centripetalCRSpline(ps, seg = 16) {
    if (ps.length < 2) return ps.slice();
    const out = [];
    const alpha = 0.5;

    for (let i = 0; i < ps.length - 1; i++) {
      const p0 = ps[i - 1] || ps[i];
      const p1 = ps[i];
      const p2 = ps[i + 1];
      const p3 = ps[i + 2] || p2;

      const d01 = Math.max(Math.hypot(p1.x - p0.x, p1.y - p0.y), EPS);
      const d12 = Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y), EPS);
      const d23 = Math.max(Math.hypot(p3.x - p2.x, p3.y - p2.y), EPS);

      const t0 = 0, t1 = t0 + Math.pow(d01, alpha);
      const t2 = t1 + Math.pow(d12, alpha);
      const t3 = t2 + Math.pow(d23, alpha);

      for (let j = 0; j < seg; j++) {
        const t = t1 + ((t2 - t1) * j) / seg;
        const A1 = lerpPoint(p0, p1, (t1 - t) / Math.max(t1 - t0, EPS));
        const A2 = lerpPoint(p1, p2, (t2 - t) / Math.max(t2 - t1, EPS));
        const A3 = lerpPoint(p2, p3, (t3 - t) / Math.max(t3 - t2, EPS));
        const B1 = lerpPoint(A1, A2, (t2 - t) / Math.max(t2 - t0, EPS));
        const B2 = lerpPoint(A2, A3, (t3 - t) / Math.max(t3 - t1, EPS));
        out.push(lerpPoint(B1, B2, (t2 - t) / Math.max(t2 - t1, EPS)));
      }
    }
    out.push(ps[ps.length - 1]);
    return out;
  }

  // t は「a の重み」寄り（既存仕様）
  function lerpPoint(a, b, t) {
    return { x: a.x + (b.x - a.x) * (1 - t), y: a.y + (b.y - a.y) * (1 - t) };
  }

  function resampleByDistance(pts, ds) {
    if (!pts || pts.length === 0) return [];
    if (!(ds > 0)) return pts.slice();
    const out = [pts[0]];
    let prev = pts[0], acc = 0;
    for (let i = 1; i < pts.length; i++) {
      let curr = pts[i];
      let segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      if (segLen === 0) continue;
      while (acc + segLen >= ds) {
        const t = (ds - acc) / segLen;
        const nx = prev.x + (curr.x - prev.x) * t;
        const ny = prev.y + (curr.y - prev.y) * t;
        const np = { x: nx, y: ny };
        out.push(np);
        prev = np;
        segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        acc = 0;
      }
      acc += segLen;
      prev = curr;
    }
    return out;
  }
}
