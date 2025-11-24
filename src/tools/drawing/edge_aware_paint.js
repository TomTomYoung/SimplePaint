// ツール仕様: 概要=ストローク系の描画ツール群。筆圧や速度に応じてピクセルを塗布し、形状や質感を変化させます。 入力=ペン/マウスのポインタイベント、筆圧や速度、Shiftなどの修飾キー。 出力=ラスターレイヤー上の筆跡や効果付きストローク。 操作=左ドラッグで描画開始→移動でストローク更新→離して確定。右クリックやスポイト機能がある場合は色取得に使用。
export function makeEdgeAwarePaint(store) {
  const id = 'edge-aware-paint';

  let drawing = false;
  let pts = [];
  let aabb = null;

  const EPS = 1e-6;

  // 既定値
  const DEFAULTS = {
    tau: 30,            // 勾配しきい値（20〜40）
    radius: 16,         // 半径R（8〜24）
    boundaryPad: 1,     // 境界緩衝（1〜2pxの膨張）
    strength: 0.6,      // 合成強度（0..1）
    spacingRatio: 0.5,  // Δs = spacingRatio * R
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
      aabb = null;
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

      // パス成形と等間隔サンプル
      const R = Math.max(1, Math.round(s.radius));
      const dsPath = Math.max(R / 2, 0.5);
      const path = buildSmoothPath(pts, dsPath);
      const spacing = Math.max(1, s.spacingRatio * R);
      const stamps = resampleByDistance(path, spacing);

      // スタンプ処理
      for (const q of stamps) {
        const rect = edgeAwareStamp(ctx, q.x, q.y, s);
        if (rect) aabb = unionAabb(aabb, rect);
      }

      // 再描画通知（境界沿い+1px余白）
      if (aabb) {
        eng.expandPendingRectByRect?.(
          Math.floor(aabb.x - 1),
          Math.floor(aabb.y - 1),
          Math.ceil(aabb.w + 2),
          Math.ceil(aabb.h + 2)
        );
      }

      pts = [];
      aabb = null;
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview(octx) {
      if (!drawing || pts.length < 2) return;
      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.strokeStyle = (store.getToolState(id) || {}).primaryColor || '#000';
      octx.lineWidth = Math.max((store.getToolState(id) || {}).radius || DEFAULTS.radius, 1);
      octx.beginPath();
      octx.moveTo(pts[0].x + 0.5, pts[0].y + 0.5);
      for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x + 0.5, pts[i].y + 0.5);
      octx.stroke();
      octx.restore();
    },
  };

  // ====== スタンプ（縁保持塗り） ==========================================
  function edgeAwareStamp(ctx, cx, cy, s) {
    const R = Math.max(1, Math.round(s.radius));
    const pad = 2 + Math.max(0, Math.min(3, s.boundaryPad | 0)); // 勾配用の余白 + 境界緩衝
    const bx = Math.floor(cx - R - pad);
    const by = Math.floor(cy - R - pad);
    const bw = 2 * (R + pad);
    const bh = 2 * (R + pad);

    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const clip = clipRectToCanvas(bx, by, bw, bh, cw, ch);
    if (!clip) return null;

    const { x, y, w, h } = clip;
    const img = ctx.getImageData(x, y, w, h);
    const data = img.data; // Uint8ClampedArray

    // --- ガイド平滑（3x3 近似ガウス）と輝度取得（0..255, sRGB）
    const lum = new Float32Array(w * h);
    for (let j = 0, idx = 0; j < h; j++) {
      for (let i = 0; i < w; i++, idx++) {
        const k = idx * 4;
        const r = data[k], g = data[k + 1], b = data[k + 2];
        lum[idx] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
    }
    const blur = new Float32Array(w * h);
    boxGauss3(lum, blur, w, h); // blur に保存

    // --- Sobel 勾配とエッジマスク（閾値 τ）
    const tau = Number.isFinite(s.tau) ? s.tau : 30;
    const edge = new Uint8Array(w * h); // 0/1
    sobelEdge(blur, edge, w, h, tau);

    // --- 境界緩衝の膨張（bpad ピクセル）
    const bpad = Math.max(0, Math.min(3, s.boundaryPad | 0));
    if (bpad > 0) dilate(edge, w, h, bpad);

    // --- 円内のみの領域成長（8近傍、エッジを跨がない）
    const cxL = cx - x, cyL = cy - y;
    const seed = findSeed(edge, w, h, cxL, cyL, R);
    if (!seed) return { x, y, w, h }; // 稀に種が見つからない（全面エッジ）→何もしないがAABBは返す

    const region = new Uint8Array(w * h);
    growRegion(edge, region, w, h, seed.x, seed.y, R);

    // --- 線形空間で塗布（soft radial, strength）
    const col = hexToRgb((store.getToolState(id) || {}).primaryColor || '#000000');
    const rL = srgbToLinear(col.r / 255);
    const gL = srgbToLinear(col.g / 255);
    const bL = srgbToLinear(col.b / 255);
    const kStr = clamp(s.strength, 0, 1);
    const R2 = R * R;

    for (let j = 0, idx = 0; j < h; j++) {
      const py = j + 0.5;
      const dy = py - cyL;
      for (let i = 0; i < w; i++, idx++) {
        if (!region[idx]) continue;
        const px = i + 0.5;
        const dx = px - cxL;
        const d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;

        // ソフトフェード
        const d = Math.sqrt(d2) / R;        // 0..1
        const radial = smooth01(1 - d);     // 1→0
        const srcA = kStr * radial;
        if (srcA <= 0) continue;

        const k = (j * w + i) * 4;
        const dA = data[k + 3] / 255;
        const dR = srgbToLinear(data[k] / 255);
        const dG = srgbToLinear(data[k + 1] / 255);
        const dB = srgbToLinear(data[k + 2] / 255);

        const outA = srcA + dA * (1 - srcA);
        const outR = (rL * srcA + dR * dA * (1 - srcA)) / (outA || 1);
        const outG = (gL * srcA + dG * dA * (1 - srcA)) / (outA || 1);
        const outB = (bL * srcA + dB * dA * (1 - srcA)) / (outA || 1);

        data[k]     = linearToSrgb(outR);
        data[k + 1] = linearToSrgb(outG);
        data[k + 2] = linearToSrgb(outB);
        data[k + 3] = Math.round(clamp(outA, 0, 1) * 255);
      }
    }

    ctx.putImageData(img, x, y);
    return { x, y, w, h };
  }

  // ===== ガイド平滑：3x3 近似ガウス（[1 2 1] セパラブル） ==================
  function boxGauss3(src, dst, w, h) {
    const tmp = new Float32Array(w * h);
    // 横
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const xm1 = src[row + (x > 0 ? x - 1 : 0)];
        const x0  = src[row + x];
        const xp1 = src[row + (x < w - 1 ? x + 1 : w - 1)];
        tmp[row + x] = (xm1 + 2 * x0 + xp1) * 0.25;
      }
    }
    // 縦
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const ym1 = tmp[(y > 0 ? y - 1 : 0) * w + x];
        const y0  = tmp[y * w + x];
        const yp1 = tmp[(y < h - 1 ? y + 1 : h - 1) * w + x];
        dst[y * w + x] = (ym1 + 2 * y0 + yp1) * 0.25;
      }
    }
  }

  // ===== Sobel で勾配→しきいでエッジ化（mag を ~0..255 にスケール） =======
  function sobelEdge(blur, edge, w, h, tau) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const xm1 = Math.max(0, x - 1), xp1 = Math.min(w - 1, x + 1);
        const ym1 = Math.max(0, y - 1), yp1 = Math.min(h - 1, y + 1);
        const a = blur[ym1 * w + xm1], b = blur[ym1 * w + x], c = blur[ym1 * w + xp1];
        const d = blur[y * w + xm1],    e = blur[y * w + x], f = blur[y * w + xp1];
        const g = blur[yp1 * w + xm1], h0 = blur[yp1 * w + x], i = blur[yp1 * w + xp1];
        const gx = (c + 2 * f + i) - (a + 2 * d + g);
        const gy = (g + 2 * h0 + i) - (a + 2 * b + c);
        const mag = Math.sqrt(gx * gx + gy * gy) * 0.25; // ≈ 0..255
        edge[y * w + x] = (mag >= tau) ? 1 : 0;
      }
    }
  }

  // ===== 膨張（b 半径のマンハッタン近似） ================================
  function dilate(mask, w, h, b) {
    const out = new Uint8Array(mask);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask[y * w + x]) {
          for (let dy = -b; dy <= b; dy++) {
            const yy = y + dy; if (yy < 0 || yy >= h) continue;
            const k = b - Math.abs(dy);
            for (let dx = -k; dx <= k; dx++) {
              const xx = x + dx; if (xx < 0 || xx >= w) continue;
              out[yy * w + xx] = 1;
            }
          }
        }
      }
    }
    mask.set(out);
  }

  // ===== 種探索（中心が境界なら近傍で非境界を探す） ======================
  function findSeed(edge, w, h, cx, cy, R) {
    const sx = Math.max(0, Math.min(w - 1, Math.floor(cx)));
    const sy = Math.max(0, Math.min(h - 1, Math.floor(cy)));
    if (!edge[sy * w + sx]) return { x: sx, y: sy };
    const r = Math.min(3, R); // 小さく探索
    for (let rr = 1; rr <= r; rr++) {
      for (let dy = -rr; dy <= rr; dy++) {
        for (let dx = -rr; dx <= rr; dx++) {
          const xx = sx + dx, yy = sy + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          if (!edge[yy * w + xx]) return { x: xx, y: yy };
        }
      }
    }
    return null;
  }

  // ===== 領域成長（8近傍、円内 & 非境界） ================================
  function growRegion(edge, region, w, h, sx, sy, R) {
    const R2 = R * R;
    const qx = new Int16Array(w * h);
    const qy = new Int16Array(w * h);
    let qs = 0, qe = 0;

    const cx = sx, cy = sy; // ローカル中心
    qx[qe] = sx; qy[qe] = sy; qe++;
    region[sy * w + sx] = 1;

    while (qs < qe) {
      const x0 = qx[qs], y0 = qy[qs]; qs++;
      for (let yy = y0 - 1; yy <= y0 + 1; yy++) {
        for (let xx = x0 - 1; xx <= x0 + 1; xx++) {
          if (xx === x0 && yy === y0) continue;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const idx = yy * w + xx;
          if (region[idx] || edge[idx]) continue;
          const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy;
          if (dx * dx + dy * dy > R2) continue;
          region[idx] = 1;
          qx[qe] = xx; qy[qe] = yy; qe++;
        }
      }
    }
  }

  // ====== 汎用ユーティリティ =============================================
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      tau: clamp(Number(s.tau ?? defs.tau), 1, 255),
      radius: clamp(Number(s.radius ?? s.brushSize ?? defs.radius), 2, 128),
      boundaryPad: clampInt(Number(s.boundaryPad ?? defs.boundaryPad), 0, 4),
      strength: clamp(Number(s.strength ?? defs.strength), 0, 1),
      spacingRatio: Number.isFinite(s.spacingRatio) ? s.spacingRatio : defs.spacingRatio,
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

  function smooth01(t) { if (t <= 0) return 0; if (t >= 1) return 1; return t * t * (3 - 2 * t); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clampInt(v, lo, hi) { v = v | 0; return v < lo ? lo : (v > hi ? hi : v); }

  function hexToRgb(hex) {
    const n = (hex && hex[0] === '#') ? hex.slice(1) : (hex || '');
    const s = n.length === 3 ? n.replace(/(.)/g, '$1$1') : n;
    const v = Number.isNaN(parseInt(s, 16)) ? 0 : parseInt(s, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }

  // sRGB ↔ Linear（0..1）
  function srgbToLinear(u) { return (u <= 0.04045) ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); }
  function linearToSrgb(v) {
    v = clamp(v, 0, 1);
    return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
  }

  // ===== 既存様式のパス補助 ================================================
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
  function lerpPoint(a, b, t) { return { x: a.x + (b.x - a.x) * (1 - t), y: a.y + (b.y - a.y) * (1 - t) }; }

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
