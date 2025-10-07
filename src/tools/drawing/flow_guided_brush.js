export function makeFlowGuidedBrush(store) {
  const id = 'flow-guided-brush';

  let drawing = false;
  let pts = [];
  const EPS = 1e-6;

  // フィールド計算のスロットリング
  let lastFieldAngle = 0;       // 直近の場の角度（ラジアン, 接線向き）
  let lastFieldTime = -1;       // ms

  // 既定値
  const DEFAULTS = {
    brushSize: 16,        // w
    spacingRatio: 0.5,    // Δs ≈ w/2
    lambda: 0.5,          // 方向混合 0..1（0=純接線, 1=純方向場）
    fieldUpdateMs: 16,    // 16〜33ms
    fieldRadiusScale: 1.5,// フィールド解析窓: rF = fieldRadiusScale * w
    dabLengthRatio: 1.0,  // スタンプ長さ: L = dabLengthRatio * w（線分の長さ）
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

      lastFieldTime = -1; // すぐに初回計算させる
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
      const w = Math.max(1, s.brushSize);
      const dsPath = Math.max(w / 2, 0.5);
      const path = buildSmoothPath(pts, dsPath);
      if (path.length < 2) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // 等間隔スタンプ列
      const spacing = Math.max(1, s.spacingRatio * w);
      const stamps = resampleByDistance(path, spacing);
      if (!stamps.length) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // AABB 統合
      let minX =  Infinity, minY =  Infinity, maxX = -Infinity, maxY = -Infinity;

      // 逐次スタンプ
      for (let i = 0; i < stamps.length; i++) {
        const q = stamps[i];
        const tanAng = tangentAt(stamps, i); // パス接線角
        const flowAng = getFlowAngle(ctx, q.x, q.y, w, s); // 場の接線角（等値線方向）

        // 方向混合 λ：接線(1-λ) と 場 λ をベクトル合成で補間
        const ang = mixAngles(tanAng, flowAng, s.lambda);

        const rect = stampDab(ctx, q.x, q.y, ang, w, s);
        if (rect) {
          if (rect.x < minX) minX = rect.x;
          if (rect.y < minY) minY = rect.y;
          if (rect.x + rect.w > maxX) maxX = rect.x + rect.w;
          if (rect.y + rect.h > maxY) maxY = rect.y + rect.h;
        }
      }

      if (isFinite(minX)) {
        eng.expandPendingRectByRect?.(
          Math.floor(minX), Math.floor(minY),
          Math.ceil(maxX - minX), Math.ceil(maxY - minY)
        );
      }

      pts = [];
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview(octx) {
      if (!drawing || pts.length < 2) return;
      const s = store.getToolState(id) || {};
      const lw = Math.max(s.brushSize || DEFAULTS.brushSize, 1);
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

  // ====== スタンプ（方向性のある線分） ====================================
  function stampDab(ctx, x, y, angle, w, s) {
    const L = Math.max(0.5, (s.dabLengthRatio || 1) * w);

    // 回転矩形のAABB（線分: 長さL, 太さw, 端はラウンド）
    const rx = (Math.abs(Math.cos(angle)) * L + Math.abs(Math.sin(angle)) * w) * 0.5;
    const ry = (Math.abs(Math.sin(angle)) * L + Math.abs(Math.cos(angle)) * w) * 0.5;
    const pad = 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = (store.getToolState(id) || {}).primaryColor || '#000';
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(-L / 2, 0);
    ctx.lineTo(L / 2, 0);
    ctx.stroke();
    ctx.restore();

    return { x: x - rx - pad, y: y - ry - pad, w: rx * 2 + pad * 2, h: ry * 2 + pad * 2 };
  }

  // ====== 方向場：構造テンソルからの主方向（等値線接線） ====================
  function getFlowAngle(ctx, cx, cy, w, s) {
    const now = performance.now ? performance.now() : Date.now();
    const budget = Math.max(8, Math.min(100, s.fieldUpdateMs || 16));

    if (now - lastFieldTime < budget) {
      return lastFieldAngle; // スロットル
    }

    // 解析窓サイズ
    const rF = Math.max(6, Math.round((s.fieldRadiusScale || 1.5) * w));
    const bx = Math.floor(cx - rF), by = Math.floor(cy - rF);
    const bw = 2 * rF + 1, bh = 2 * rF + 1;

    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const clip = clipRectToCanvas(bx, by, bw, bh, cw, ch);
    if (!clip) {
      lastFieldTime = now;
      return lastFieldAngle; // 変更なし
    }

    const { x, y, w: rw, h: rh } = clip;
    const img = ctx.getImageData(x, y, rw, rh);
    const data = img.data;

    // Sobel で Gx, Gy、構造テンソル和（窓内で合算）を作る
    let Jxx = 0, Jxy = 0, Jyy = 0;

    // 端はクランプで処理
    function at(ix, iy, c) {
      ix = ix < 0 ? 0 : (ix >= rw ? rw - 1 : ix);
      iy = iy < 0 ? 0 : (iy >= rh ? rh - 1 : iy);
      const k = (iy * rw + ix) * 4;
      // sRGB 輝度（簡易）
      const r = data[k], g = data[k + 1], b = data[k + 2];
      return (0.2126 * r + 0.7152 * g + 0.0722 * b);
    }

    for (let j = 0; j < rh; j++) {
      for (let i = 0; i < rw; i++) {
        // Sobel
        const a = at(i - 1, j - 1), b = at(i, j - 1), c = at(i + 1, j - 1);
        const d = at(i - 1, j),     e = at(i, j),     f = at(i + 1, j);
        const g = at(i - 1, j + 1), h0 = at(i, j + 1), ii = at(i + 1, j + 1);

        const Gx = (c + 2 * f + ii) - (a + 2 * d + g);
        const Gy = (g + 2 * h0 + ii) - (a + 2 * b + c);

        // ガイド平滑の代替として単純合算（= ボックス平滑後のテンソルに相当）
        Jxx += Gx * Gx;
        Jxy += Gx * Gy;
        Jyy += Gy * Gy;
      }
    }

    // 主方向 angleGrad = 0.5 * atan2(2Jxy, Jxx - Jyy)（勾配方向）
    const angleGrad = 0.5 * Math.atan2(2 * Jxy, Jxx - Jyy);

    // 我々が欲しいのは等値線の接線（= 勾配法線）→ +π/2
    const tangentAngle = angleGrad + Math.PI / 2;

    lastFieldAngle = tangentAngle;
    lastFieldTime = now;
    return tangentAngle;
  }

  // ====== 方向混合（角度補間） ============================================
  function mixAngles(a, b, t) {
    t = clamp(t, 0, 1);
    const ax = Math.cos(a), ay = Math.sin(a);
    const bx = Math.cos(b), by = Math.sin(b);
    const vx = ax * (1 - t) + bx * t;
    const vy = ay * (1 - t) + by * t;
    if (Math.abs(vx) < EPS && Math.abs(vy) < EPS) return a;
    return Math.atan2(vy, vx);
  }

  // ====== タンジェント推定（スタンプ配列） ================================
  function tangentAt(arr, i) {
    const n = arr.length;
    const a = arr[Math.max(0, i - 1)];
    const b = arr[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) + Math.abs(dy) < EPS) return 0;
    return Math.atan2(dy, dx);
  }

  // ====== 共通ユーティリティ ==============================================
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clamp(Number(s.brushSize ?? defs.brushSize), 1, 256),
      spacingRatio: Number.isFinite(s.spacingRatio) ? s.spacingRatio : defs.spacingRatio,
      lambda: clamp(Number(s.lambda ?? defs.lambda), 0, 1),
      fieldUpdateMs: clampInt(Number(s.fieldUpdateMs ?? defs.fieldUpdateMs), 8, 100),
      fieldRadiusScale: clamp(Number(s.fieldRadiusScale ?? defs.fieldRadiusScale), 0.5, 4.0),
      dabLengthRatio: clamp(Number(s.dabLengthRatio ?? defs.dabLengthRatio), 0.2, 3.0),
      primaryColor: s.primaryColor || '#000',
    };
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

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clampInt(v, lo, hi) { v = v | 0; return v < lo ? lo : (v > hi ? hi : v); }

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
