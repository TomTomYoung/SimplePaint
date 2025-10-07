export function makeCurvatureAdaptiveBrush(store) {
  const id = 'curvature-adaptive';

  let drawing = false;
  let pts = [];
  const EPS = 1e-6;

  // 既定値
  const DEFAULTS = {
    brushSize: 14,
    // Δs_min = w/3, Δs_max = w
    dsMinRatio: 1 / 3,
    dsMaxRatio: 1.0,
    // 曲率スケール（大きいほどコーナーで間隔を詰めやすい）
    curvatureScale: 18,      // 実測に合わせて調整
    // 曲率の低域フィルタ（EMA）
    kappaAlpha: 0.35,
    // Δs の急変を抑えるためのスムージング
    dsSmooth: 0.5,           // 0..1（大きいほど滑らか）
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
      if (dx * dx + dy * dy < 1) return; // 過剰サンプル抑制
      pts.push(p);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      // 最終点取り込み
      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) pts.push(p);

      const s = getState(store, id, DEFAULTS);
      const w = Math.max(1, s.brushSize);
      const dsBase = Math.max(w / 2, 0.5);

      // 1) 入力平滑化（低域）→ 曲線化（CRスプライン）→ 粗再サンプル
      const basePath = buildSmoothPath(pts, dsBase);
      if (basePath.length < 2) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // 2) 曲率推定（外れ値クリップ + EMA）
      const { cum, total } = cumulativeLengths(basePath);
      const kappa = estimateCurvature(basePath);
      stabilizeCurvature(kappa, s.kappaAlpha);

      // 3) 曲率適応の可変間隔サンプル
      const dsMin = Math.max(0.5, w * s.dsMinRatio);
      const dsMax = Math.max(dsMin + 0.5, w * s.dsMaxRatio);
      const stamps = resampleByCurvature(basePath, cum, kappa, {
        dsMin,
        dsMax,
        curvatureScale: s.curvatureScale,
        dsSmooth: s.dsSmooth,
        total,
      });

      // 4) 既定ラスタライズ（丸スタンプ）
      const r = w / 2;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      ctx.save();
      ctx.fillStyle = s.primaryColor;
      for (const q of stamps) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (q.x < minX) minX = q.x;
        if (q.y < minY) minY = q.y;
        if (q.x > maxX) maxX = q.x;
        if (q.y > maxY) maxY = q.y;
      }
      ctx.restore();

      // 5) 再描画通知（Δs変化を考慮して余白をやや広めに）
      if (isFinite(minX)) {
        const pad = r + 3; // 角でのオーバーシュートを吸収
        eng.expandPendingRectByRect?.(
          Math.floor(minX - pad),
          Math.floor(minY - pad),
          Math.ceil((maxX - minX) + pad * 2),
          Math.ceil((maxY - minY) + pad * 2)
        );
      }

      pts = [];
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    // プレビューは軽量表示（筆幅のラインで）
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

  // ===== 曲率適応の可変間隔サンプル =======================================
  function resampleByCurvature(path, cum, kappa, opt) {
    const { dsMin, dsMax, curvatureScale, dsSmooth, total } = opt;
    if (path.length === 0) return [];
    const out = [path[0]];
    let sPos = 0;
    let prevDs = dsMax;

    while (sPos < total) {
      // 現在位置の曲率（弧長パラメタで線形補間）
      const kap = kappaAtS(cum, kappa, sPos);

      // 0..1 の重みへ圧縮（1 - exp(-κ*s)）
      const t = 1 - Math.exp(-Math.abs(kap) * curvatureScale);

      // Δs を補間（高曲率→間隔を詰める）
      const dsTarget = dsMax - (dsMax - dsMin) * clamp(t, 0, 1);
      const ds = lerp(prevDs, dsTarget, clamp(dsSmooth, 0, 1));

      sPos += Math.max(dsMin, Math.min(ds, dsMax));
      if (sPos >= total) break;

      const u = locateAlong(path, cum, sPos);
      out.push({ x: u.x, y: u.y });

      prevDs = ds;
    }

    // 最後の点を確実に
    const last = path[path.length - 1];
    const tail = out[out.length - 1];
    if (!tail || tail.x !== last.x || tail.y !== last.y) out.push({ x: last.x, y: last.y });

    return out;
  }

  // 弧長位置 s における座標
  function locateAlong(path, cum, s) {
    let lo = 0, hi = path.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < s) lo = mid; else hi = mid;
    }
    const seg = Math.max(cum[hi] - cum[lo], EPS);
    const u = clamp((s - cum[lo]) / seg, 0, 1);
    return {
      x: path[lo].x + (path[hi].x - path[lo].x) * u,
      y: path[lo].y + (path[hi].y - path[lo].y) * u,
    };
  }

  // s における曲率（線形補間）
  function kappaAtS(cum, kappa, s) {
    let lo = 0, hi = cum.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < s) lo = mid; else hi = mid;
    }
    const seg = Math.max(cum[hi] - cum[lo], EPS);
    const u = clamp((s - cum[lo]) / seg, 0, 1);
    return kappa[lo] * (1 - u) + kappa[hi] * u;
  }

  function cumulativeLengths(path) {
    const cum = new Array(path.length);
    cum[0] = 0;
    for (let i = 1; i < path.length; i++) {
      cum[i] = cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    return { cum, total: cum[cum.length - 1] };
  }

  // ===== 曲率推定（角度差/弧長） ==========================================
  function estimateCurvature(path) {
    const n = path.length;
    const k = new Float32Array(n);

    // 端点は近傍で補完
    k[0] = 0; k[n - 1] = 0;

    for (let i = 1; i < n - 1; i++) {
      const a = path[i - 1], b = path[i], c = path[i + 1];

      const v0x = b.x - a.x, v0y = b.y - a.y;
      const v1x = c.x - b.x, v1y = c.y - b.y;

      const l0 = Math.hypot(v0x, v0y);
      const l1 = Math.hypot(v1x, v1y);
      if (l0 < EPS || l1 < EPS) { k[i] = 0; continue; }

      // 角度差
      const dot = (v0x * v1x + v0y * v1y) / (l0 * l1);
      const cs = clamp(dot, -1, 1);
      const dth = Math.acos(cs);

      // 弧長近似（区間平均）
      const s = 0.5 * (l0 + l1);

      // κ ≈ |Δθ| / s
      k[i] = Math.abs(dth) / Math.max(s, EPS);
    }

    // 外れ値除去（メディアン×4にクリップ）
    const med = median(k);
    const cap = (med || 0) * 4;
    for (let i = 0; i < n; i++) k[i] = Math.min(k[i], cap || k[i]);

    // 端点補間
    k[0] = k[1] || 0;
    k[n - 1] = k[n - 2] || 0;
    return k;
  }

  function stabilizeCurvature(kappa, alpha) {
    // 1D EMA（両方向で二度がけ）
    const n = kappa.length;
    alpha = clamp(alpha, 0.05, 0.9);

    // forward
    let prev = kappa[0];
    for (let i = 1; i < n; i++) {
      const v = kappa[i];
      prev = alpha * v + (1 - alpha) * prev;
      kappa[i] = prev;
    }
    // backward
    prev = kappa[n - 1];
    for (let i = n - 2; i >= 0; i--) {
      const v = kappa[i];
      prev = alpha * v + (1 - alpha) * prev;
      kappa[i] = prev;
    }
  }

  // ===== 低域化前の入力平滑 → CRスプライン → 粗再サンプル = 既定様式 =====
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

  // ===== ユーティリティ ====================================================
  function median(buf) {
    const arr = Array.from(buf);
    arr.sort((a, b) => a - b);
    const n = arr.length;
    if (n === 0) return 0;
    return n % 2 ? arr[(n - 1) >> 1] : 0.5 * (arr[n / 2 - 1] + arr[n / 2]);
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clamp(Number(s.brushSize ?? defs.brushSize), 1, 256),
      dsMinRatio: clamp(Number(s.dsMinRatio ?? defs.dsMinRatio), 0.05, 1.0),
      dsMaxRatio: clamp(Number(s.dsMaxRatio ?? defs.dsMaxRatio), 0.1, 3.0),
      curvatureScale: clamp(Number(s.curvatureScale ?? defs.curvatureScale), 1, 200),
      kappaAlpha: clamp(Number(s.kappaAlpha ?? defs.kappaAlpha), 0.05, 0.9),
      dsSmooth: clamp(Number(s.dsSmooth ?? defs.dsSmooth), 0, 1),
      primaryColor: s.primaryColor || '#000',
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
}
