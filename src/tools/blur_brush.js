export function makeBlurBrush(store) {
  const id = 'blur-brush';

  let drawing = false;
  let pts = [];

  const EPS = 1e-6;

  // 既定値
  const DEFAULTS = {
    sigma: 3.0,       // 1.5〜6.0 推奨
    iterations: 1,    // 1〜2
    spacingRatio: 0.6 // R (=3σ) に対するスタンプ間隔倍率
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
    },

    onPointerMove(ctx, ev) {
      if (!drawing) return;
      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) < 1) return;
      pts.push(p);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) pts.push(p);

      const s = getState(store, id, DEFAULTS);
      const sigma = s.sigma;
      if (!(sigma > 0)) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      const R = Math.max(1, Math.round(3 * sigma)); // 半径R=3σ
      const path = buildSmoothPath(pts, Math.max(R / 2, 0.5));
      if (path.length === 0) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      const spacing = Math.max(1, s.spacingRatio * R);
      const stamps = resampleByDistance(path, spacing);
      if (stamps.length === 0) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // スタンプごとに局所ぼかし（セパラブルガウス、直線形空間）
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      // 重複スタンプの軽減（整数グリッドで丸め）
      const seen = new Set();

      for (const q of stamps) {
        const key = (Math.round(q.x / 2) << 16) ^ Math.round(q.y / 2);
        if (seen.has(key)) continue;
        seen.add(key);

        const rect = blurStamp(ctx, q.x, q.y, sigma, s.iterations);
        if (!rect) continue;

        if (rect.x < minX) minX = rect.x;
        if (rect.y < minY) minY = rect.y;
        if (rect.x + rect.w > maxX) maxX = rect.x + rect.w;
        if (rect.y + rect.h > maxY) maxY = rect.y + rect.h;
      }

      // 無効領域通知（対象AABBのみ）
      if (minX < maxX && minY < maxY) {
        eng.expandPendingRectByRect?.(minX, minY, maxX - minX, maxY - minY);
      }

      pts = [];
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview(octx) {
      if (!drawing || pts.length < 2) return;
      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.strokeStyle = '#000';
      octx.lineWidth = 1;
      octx.beginPath();
      octx.moveTo(pts[0].x + 0.5, pts[0].y + 0.5);
      for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x + 0.5, pts[i].y + 0.5);
      octx.stroke();
      octx.restore();
    },
  };

  // ====== スタンプ（局所ガウスぼかし） ======
  function blurStamp(ctx, cx, cy, sigma, iterations) {
    const R = Math.max(1, Math.round(3 * sigma));
    const bx = Math.floor(cx - R - 1);
    const by = Math.floor(cy - R - 1);
    const bw = 2 * (R + 1);
    const bh = 2 * (R + 1);

    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const clip = clipRectToCanvas(bx, by, bw, bh, cw, ch);
    if (!clip) return null;

    const { x, y, w, h } = clip;

    const img = ctx.getImageData(x, y, w, h);
    const src = img.data; // Uint8ClampedArray

    // premultiplied linear へ変換
    const pr = new Float32Array(w * h);
    const pg = new Float32Array(w * h);
    const pb = new Float32Array(w * h);
    const pa = new Float32Array(w * h);

    for (let j = 0, idx = 0; j < h; j++) {
      for (let i = 0; i < w; i++, idx++) {
        const k = idx * 4;
        const a = src[k + 3] / 255;
        const rL = srgbToLinear(src[k] / 255);
        const gL = srgbToLinear(src[k + 1] / 255);
        const bL = srgbToLinear(src[k + 2] / 255);
        pr[idx] = rL * a;
        pg[idx] = gL * a;
        pb[idx] = bL * a;
        pa[idx] = a;
      }
    }

    // セパラブルガウス
    const { weights, kr } = gaussianKernel(sigma);

    separableBlur(pr, w, h, weights, kr, iterations);
    separableBlur(pg, w, h, weights, kr, iterations);
    separableBlur(pb, w, h, weights, kr, iterations);
    separableBlur(pa, w, h, weights, kr, iterations);

    // 円マスクで書き戻し
    const cxLocal = cx - x, cyLocal = cy - y;
    const R2 = R * R;

    for (let j = 0, idx = 0; j < h; j++) {
      const py = j + 0.5;
      const dy = py - cyLocal;
      for (let i = 0; i < w; i++, idx++) {
        const px = i + 0.5;
        const dx = px - cxLocal;
        if (dx * dx + dy * dy > R2) continue;

        const a = pa[idx];
        let rL = 0, gL = 0, bL = 0;
        if (a > 0) {
          rL = pr[idx] / a;
          gL = pg[idx] / a;
          bL = pb[idx] / a;
        }
        const k = (j * w + i) * 4;
        src[k]     = linearToSrgb(rL);
        src[k + 1] = linearToSrgb(gL);
        src[k + 2] = linearToSrgb(bL);
        src[k + 3] = Math.round(clamp(a, 0, 1) * 255);
      }
    }

    ctx.putImageData(img, x, y);
    return { x, y, w, h };
  }

  function separableBlur(buf, w, h, weights, kr, iterations) {
    const tmp = new Float32Array(buf.length);
    for (let it = 0; it < Math.max(1, Math.min(2, iterations)); it++) {
      // 横方向
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          let acc = 0;
          for (let k = -kr; k <= kr; k++) {
            const xx = clampInt(x + k, 0, w - 1);
            acc += buf[row + xx] * weights[k + kr];
          }
          tmp[row + x] = acc;
        }
      }
      // 縦方向
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          let acc = 0;
          for (let k = -kr; k <= kr; k++) {
            const yy = clampInt(y + k, 0, h - 1);
            acc += tmp[yy * w + x] * weights[k + kr];
          }
          buf[y * w + x] = acc;
        }
      }
    }
  }

  function gaussianKernel(sigma) {
    const s = Math.max(0.5, Math.min(10, Number(sigma) || 0));
    const kr = Math.max(1, Math.round(3 * s)); // 半径
    const size = kr * 2 + 1;
    const w = new Float32Array(size);
    const inv2s2 = 1 / (2 * s * s);
    let sum = 0;
    for (let i = -kr; i <= kr; i++) {
      const val = Math.exp(-i * i * inv2s2);
      w[i + kr] = val;
      sum += val;
    }
    for (let i = 0; i < size; i++) w[i] /= sum;
    return { weights: w, kr };
  }

  // ===== ユーティリティ =====
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    const sigma = clamp(Number(s.sigma ?? defs.sigma), 0.5, 8.0); // 若干拡張許容
    const iterations = Math.round(clamp(Number(s.iterations ?? defs.iterations), 1, 2));
    const spacingRatio = Number.isFinite(s.spacingRatio) ? s.spacingRatio : defs.spacingRatio;
    return { sigma, iterations, spacingRatio };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clampInt(v, lo, hi) { v = v | 0; return v < lo ? lo : (v > hi ? hi : v); }

  function clipRectToCanvas(x, y, w, h, cw, ch) {
    let nx = x, ny = y, nw = w, nh = h;
    if (nx < 0) { nw += nx; nx = 0; }
    if (ny < 0) { nh += ny; ny = 0; }
    if (nx + nw > cw) nw = cw - nx;
    if (ny + nh > ch) nh = ch - ny;
    if (nw <= 0 || nh <= 0) return null;
    return { x: nx, y: ny, w: nw, h: nh };
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

  // === 既存様式のパス補助 ===
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
      out.push({
        x: alpha * p.x + (1 - alpha) * prev.x,
        y: alpha * p.y + (1 - alpha) * prev.y,
      });
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
