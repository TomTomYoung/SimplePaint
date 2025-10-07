export function makePredictiveBrush(store) {
  const id = 'predictive-brush';

  // ========= 状態 =========
  let drawing = false;
  let pts = [];                // 実測点 {x,y,t}
  let filter = null;           // α-β フィルタ状態 {x,y,vx,vy,t}
  let visPred = null;          // プレビュー用の平滑化済み予測点 {x,y}
  let finalAabb = null;        // 確定描画のAABB統合

  const EPS = 1e-6;

  // 既定値
  const DEFAULTS = {
    brushSize: 14,
    spacingRatio: 0.5,       // Δs = w/2
    qOverR: 1.0,             // Q/R 比（大→追従、小→平滑）
    horizonMs: 12,           // 8〜16ms
    hysteresis: 0.6,         // 予測点の視覚ヒステリシス（0..1, 大→なめらか）
    maxExtrapRatio: 1.5,     // 予測距離の上限 = maxExtrapRatio * w
  };

  // ========= ツールIF =========
  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      drawing = true;
      pts = [];
      finalAabb = null;

      const t = nowMs();
      const p = { x: ev.img.x, y: ev.img.y, t };
      pts.push(p);
      filter = { x: p.x, y: p.y, vx: 0, vy: 0, t };
      visPred = { x: p.x, y: p.y };
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !filter) return;

      const s = getState(store, id, DEFAULTS);
      const t = nowMs();
      const meas = { x: ev.img.x, y: ev.img.y, t };

      // α-βフィルタ更新
      filter = alphaBetaUpdate(filter, meas, s);

      // 先回り予測（ホライズン）
      const pred = extrapolate(filter, s);

      // 外挿距離の上限（最終実測との距離で制限）
      const anch = pts[pts.length - 1] || meas;
      const maxDist = s.maxExtrapRatio * Math.max(1, s.brushSize);
      const clamped = clampStep(anch, pred, maxDist);

      // 視覚用ヒステリシスで跳ね返り抑制
      if (!visPred) visPred = { x: clamped.x, y: clamped.y };
      else visPred = {
        x: visPred.x * (1 - s.hysteresis) + clamped.x * s.hysteresis,
        y: visPred.y * (1 - s.hysteresis) + clamped.y * s.hysteresis
      };

      // 実測は等距離間引きで保持（描画負荷軽減）
      const last = pts[pts.length - 1];
      if (!last || sqr(meas.x - last.x, meas.y - last.y) >= 1) {
        pts.push(meas);
      }
      // ここではメイン描画は行わず、プレビューのみ（drawPreview）
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      // 終点を取り込んでフィルタ確定
      const s = getState(store, id, DEFAULTS);
      const t = nowMs();
      const end = { x: ev.img.x, y: ev.img.y, t };
      pts.push(end);
      filter = alphaBetaUpdate(filter, end, s);
      visPred = null;

      // ==== 高品質で上書き確定 ====
      const w = Math.max(1, s.brushSize);
      const dsPath = Math.max(w / 2, 0.5);
      const path = buildSmoothPath(pts, dsPath);
      const stamps = resampleByDistance(path, Math.max(1, s.spacingRatio * w));

      // 丸スタンプで実描画
      const r = w / 2;
      let minX =  Infinity, minY =  Infinity, maxX = -Infinity, maxY = -Infinity;
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

      if (isFinite(minX)) {
        finalAabb = {
          x: Math.floor(minX - r - 1),
          y: Math.floor(minY - r - 1),
          w: Math.ceil((maxX - minX) + 2 * (r + 1)),
          h: Math.ceil((maxY - minY) + 2 * (r + 1)),
        };
        eng.expandPendingRectByRect?.(finalAabb.x, finalAabb.y, finalAabb.w, finalAabb.h);
      }

      pts = [];
      filter = null;
      visPred = null;

      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    // 軽量プレビュー：実測ポリライン + 先回り予測点までを同幅で描画
    drawPreview(octx) {
      if (!drawing || pts.length === 0) return;

      const s = getState(store, id, DEFAULTS);
      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.strokeStyle = s.primaryColor || '#000';
      octx.lineWidth = Math.max(1, s.brushSize);
      octx.beginPath();

      const off = (s.brushSize <= 1) ? 0.5 : 0; // 細線AA対策
      octx.moveTo(pts[0].x + off, pts[0].y + off);
      for (let i = 1; i < pts.length; i++) {
        octx.lineTo(pts[i].x + off, pts[i].y + off);
      }
      if (visPred) {
        octx.lineTo(visPred.x + off, visPred.y + off);
      }
      octx.stroke();
      octx.restore();
    },
  };

  // ========= α-β フィルタ =========
  function alphaBetaUpdate(st, meas, s) {
    const dtMs = Math.max(0, meas.t - st.t);
    const dt = Math.max(dtMs / 1000, 1 / 240); // 秒（最小サンプル期間）
    // 予測
    const xPred = st.x + st.vx * dt;
    const yPred = st.y + st.vy * dt;
    const rx = meas.x - xPred;
    const ry = meas.y - yPred;

    const { alpha, beta } = gainsFromQR(s.qOverR, dt);

    const x = xPred + alpha * rx;
    const y = yPred + alpha * ry;
    const vx = st.vx + (beta / dt) * rx;
    const vy = st.vy + (beta / dt) * ry;

    return { x, y, vx, vy, t: meas.t };
  }

  function gainsFromQR(qOverR, dt) {
    // 実装簡略：λ = (Q/R)*dt^2 に単調写像して α,β を決めるヒューリスティック
    const qr = Math.max(0, qOverR);
    const lam = (qr / (1 + qr)) * (dt / (1 / 60)); // 60Hz基準で正規化
    const a = clamp(0.25 + 0.6 * lam, 0.1, 0.9);   // 0.1..0.9
    const b = clamp(0.5 * a * a, 0.02, 0.6);       // α^2/2 を基準
    return { alpha: a, beta: b };
  }

  function extrapolate(st, s) {
    const dt = Math.max(s.horizonMs || 12, 0) / 1000;
    return { x: st.x + st.vx * dt, y: st.y + st.vy * dt };
  }

  function clampStep(anchor, target, maxDist) {
    const dx = target.x - anchor.x, dy = target.y - anchor.y;
    const d = Math.hypot(dx, dy);
    if (d <= maxDist) return target;
    const k = maxDist / (d || 1);
    return { x: anchor.x + dx * k, y: anchor.y + dy * k };
  }

  // ========= ユーティリティ =========
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function sqr(x, y) { return x * x + y * y; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clamp(Number(s.brushSize ?? defs.brushSize), 1, 256),
      spacingRatio: Number.isFinite(s.spacingRatio) ? s.spacingRatio : defs.spacingRatio,
      qOverR: Number.isFinite(s.qOverR) ? s.qOverR : defs.qOverR,
      horizonMs: Number.isFinite(s.horizonMs) ? s.horizonMs : defs.horizonMs,
      hysteresis: clamp(Number(s.hysteresis ?? defs.hysteresis), 0, 1),
      maxExtrapRatio: clamp(Number(s.maxExtrapRatio ?? defs.maxExtrapRatio), 0.2, 4.0),
      primaryColor: s.primaryColor || '#000',
    };
  }

  // ========= 既存様式のパス補助 =========
  function buildSmoothPath(pts, ds) {
    if (!pts || pts.length === 0) return [];
    const raw = pts.map(p => ({ x: p.x, y: p.y }));
    const sm = emaSmooth(raw, 0.4);
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
      const prev = out[out.length - 1], p = points[i];
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
