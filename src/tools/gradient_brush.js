function makeGradientBrush(store) {
  const id = 'gradient-brush';

  let drawing = false;
  let pts = [];
  const EPS = 1e-6;

  // 既定値
  const DEFAULTS = {
    brushSize: 16,          // w
    spacingRatio: 0.5,      // Δs = w/2
    easing: 'linear',       // 'linear' | 'quad' | 'cubic'
    // 色ストップ（0..1、最大4点）。未指定時は primary→同色の透過
    gradientStops: null,    // [{pos:0,color:'#RRGGBB',alpha:1}, ...]
    // 法線方向の（半径方向）ストップ（任意）
    radialStops: null,      // [{pos:0,color:'#',alpha:...}, ...] / colorは通常未使用でαのみでOK
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

      // パス整形 & 等間隔サンプル
      const w = Math.max(1, s.brushSize);
      const ds = Math.max(1, s.spacingRatio * w); // Δs
      const path = buildSmoothPath(pts, Math.max(w / 2, 0.5));
      if (path.length === 0) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }
      const stamps = resampleByDistance(path, ds);
      if (stamps.length === 0) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // 弧長の正規化（0..1）
      const cum = [0];
      for (let i = 1; i < stamps.length; i++) {
        const d = Math.hypot(stamps[i].x - stamps[i - 1].x, stamps[i].y - stamps[i - 1].y);
        cum[i] = cum[i - 1] + d;
      }
      const total = Math.max(cum[cum.length - 1], EPS);

      // AABB 統合
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      // 各スタンプを線形空間で合成
      for (let i = 0; i < stamps.length; i++) {
        const q = stamps[i];
        const t = (cum[i] || 0) / total; // 0..1
        const col = evalGradientColor(s.gradientStops, s.primaryColor, s.secondaryColor, t, s.easing);
        const radial = s.radialStops ? evalStopsRGBA(s.radialStops, tClamp01(0), 'linear') : null; // ここでは色は使わず、必要ならαに転用

        const rect = gradientStampLinear(ctx, q.x, q.y, w, col, s.radialStops, s.easing);
        if (!rect) continue;
        if (rect.x < minX) minX = rect.x;
        if (rect.y < minY) minY = rect.y;
        if (rect.x + rect.w > maxX) maxX = rect.x + rect.w;
        if (rect.y + rect.h > maxY) maxY = rect.y + rect.h;
      }

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

  // ===== 1スタンプを「線形空間で」合成 =====
  // col: {rL,gL,bL,a} （rL 等は linear 0..1）
  // radialStops があれば半径方向の α をストップで調整
  function gradientStampLinear(ctx, cx, cy, w, col, radialStops, easing) {
    const r = Math.max(0.5, w / 2);
    const bx = Math.floor(cx - r - 2);
    const by = Math.floor(cy - r - 2);
    const bw = Math.ceil(cx + r + 2) - bx;
    const bh = Math.ceil(cy + r + 2) - by;

    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (bw <= 0 || bh <= 0 || cw === 0 || ch === 0) return null;

    const clip = clipRectToCanvas(bx, by, bw, bh, cw, ch);
    if (!clip) return null;

    const { x, y, w: rw, h: rh } = clip;
    const img = ctx.getImageData(x, y, rw, rh);
    const data = img.data;

    const r2 = r * r;
    const invR = 1 / r;

    for (let j = 0; j < rh; j++) {
      const py = y + j + 0.5;
      const dy = py - cy;
      for (let i = 0; i < rw; i++) {
        const px = x + i + 0.5;
        const dx = px - cx;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;

        const idx = (j * rw + i) * 4;

        // 既存ピクセル（sRGB→linear）
        const dR_lin = srgbToLinear(data[idx] / 255);
        const dG_lin = srgbToLinear(data[idx + 1] / 255);
        const dB_lin = srgbToLinear(data[idx + 2] / 255);
        const dA = data[idx + 3] / 255;

        // 半径方向の滑らかなフェード（ソフトエッジ）
        const d = Math.sqrt(d2) * invR;     // 0..1
        let radial = 1 - d;                 // 1→0
        radial = smooth01(radial);          // smoothstep

        // もし radialStops があれば、半径 t_r = d に基づいて α を補間
        let alphaR = 1;
        if (Array.isArray(radialStops) && radialStops.length >= 2) {
          const rs = evalStopsRGBA(radialStops, d, easing);
          alphaR = rs.a;
        }

        // src（straight alpha）
        const srcA = clamp(col.a * radial * alphaR, 0, 1);
        if (srcA <= 0) continue;

        const outA = srcA + dA * (1 - srcA);
        const outR_lin = (col.rL * srcA + dR_lin * dA * (1 - srcA)) / (outA || 1);
        const outG_lin = (col.gL * srcA + dG_lin * dA * (1 - srcA)) / (outA || 1);
        const outB_lin = (col.bL * srcA + dB_lin * dA * (1 - srcA)) / (outA || 1);

        data[idx]     = linearToSrgb(outR_lin);
        data[idx + 1] = linearToSrgb(outG_lin);
        data[idx + 2] = linearToSrgb(outB_lin);
        data[idx + 3] = Math.round(clamp(outA, 0, 1) * 255);
      }
    }

    ctx.putImageData(img, x, y);
    return { x, y, w: rw, h: rh };
  }

  // ===== グラデ評価（沿道） =====
  // stops: [{pos:0..1,color:'#RRGGBB',alpha:0..1}]
  function evalGradientColor(stops, primaryColor, secondaryColor, t, easing) {
    t = tClamp01(t);

    // デフォルト: primary →（同色, α0）
    let defStops;
    if (!Array.isArray(stops) || stops.length < 2) {
      const c0 = hexToRgb(primaryColor || '#000');
      const c1 = hexToRgb(secondaryColor || primaryColor || '#000');
      defStops = [
        { pos: 0, color: c0, alpha: 1 },
        { pos: 1, color: c1, alpha: 0 }
      ];
    } else {
      defStops = stops.map(s => ({
        pos: clamp(Number(s.pos), 0, 1),
        color: typeof s.color === 'string' ? hexToRgb(s.color) : (s.color || { r: 0, g: 0, b: 0 }),
        alpha: clamp(Number(s.alpha), 0, 1),
      })).sort((a, b) => a.pos - b.pos);
    }

    // 区間探索
    let a = defStops[0], b = defStops[defStops.length - 1];
    for (let i = 0; i < defStops.length - 1; i++) {
      const s0 = defStops[i], s1 = defStops[i + 1];
      if (t >= s0.pos && t <= s1.pos) { a = s0; b = s1; break; }
    }

    const len = Math.max(b.pos - a.pos, EPS);
    let u = (t - a.pos) / len; // 0..1
    u = applyEasing(u, easing);

    // sRGB→linear で補間
    const aR = srgbToLinear(a.color.r / 255);
    const aG = srgbToLinear(a.color.g / 255);
    const aB = srgbToLinear(a.color.b / 255);
    const bR = srgbToLinear(b.color.r / 255);
    const bG = srgbToLinear(b.color.g / 255);
    const bB = srgbToLinear(b.color.b / 255);

    return {
      rL: aR * (1 - u) + bR * u,
      gL: aG * (1 - u) + bG * u,
      bL: aB * (1 - u) + bB * u,
      a:  a.alpha * (1 - u) + b.alpha * u,
    };
  }

  // 半径方向ストップ（colorは無視し αのみ使用想定、あれば線形で補間）
  function evalStopsRGBA(stops, t, easing) {
    t = tClamp01(t);
    const arr = stops.map(s => ({ pos: clamp(Number(s.pos), 0, 1), alpha: clamp(Number(s.alpha ?? 1), 0, 1), color: s.color || '#000' }))
                     .sort((x, y) => x.pos - y.pos);
    let a = arr[0], b = arr[arr.length - 1];
    for (let i = 0; i < arr.length - 1; i++) {
      const s0 = arr[i], s1 = arr[i + 1];
      if (t >= s0.pos && t <= s1.pos) { a = s0; b = s1; break; }
    }
    const len = Math.max(b.pos - a.pos, EPS);
    let u = (t - a.pos) / len;
    u = applyEasing(u, easing);
    return { a: a.alpha * (1 - u) + b.alpha * u };
  }

  function applyEasing(u, easing) {
    u = tClamp01(u);
    switch ((easing || 'linear')) {
      case 'quad':  return u * u;
      case 'cubic': return u * u * u;
      default:      return u;
    }
  }

  // ===== ユーティリティ =====
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clamp(Number(s.brushSize ?? defs.brushSize), 1, 256),
      spacingRatio: Number.isFinite(s.spacingRatio) ? s.spacingRatio : defs.spacingRatio,
      easing: (s.easing === 'quad' || s.easing === 'cubic') ? s.easing : 'linear',
      gradientStops: Array.isArray(s.gradientStops) ? s.gradientStops : defs.gradientStops,
      radialStops: Array.isArray(s.radialStops) ? s.radialStops : defs.radialStops,
      primaryColor: s.primaryColor || '#000',
      secondaryColor: s.secondaryColor || null,
    };
  }

  function tClamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
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

  // 既存様式のパス補助
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

  // 既存仕様: t は「a の重み」寄り
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

window.makeGradientBrush = makeGradientBrush;
