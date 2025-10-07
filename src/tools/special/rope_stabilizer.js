export function makeRopeStabilizer(store) {
  const id = 'rope-stabilizer';

  // ===== 内部状態 =====
  let drawing = false;
  let pts = [];                 // 出力（安定化後）の中心線候補 {x,y}
  let target = null;            // ポインタ生値 {x,y}
  let brush = null;             // ロープ出力（描画中心）{x,y}
  let lastT = 0;                // 前回更新時刻（ms）

  const EPS = 1e-6;

  // 既定値
  const DEFAULTS = {
    brushSize: 14,     // 既定筆幅
    ropeLength: 12,    // L: 5〜20px 推奨
    stiffness: 0.4,    // k: 0.2〜0.6
    lagFrames: 1,      // 遅延許容フレーム（1〜2）
    spacingRatio: 0.5, // Δs ≈ w/2
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      drawing = true;
      const s = getState(store, id, DEFAULTS);

      const t = nowMs();
      target = { x: ev.img.x, y: ev.img.y };
      brush  = { x: target.x, y: target.y };  // 初期は一致
      lastT = t;

      pts = [{ x: brush.x, y: brush.y }];
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !brush) return;

      const s = getState(store, id, DEFAULTS);
      const tNow = nowMs();
      const dt = Math.max(0, tNow - lastT);
      lastT = tNow;

      target = { x: ev.img.x, y: ev.img.y };

      // ロープ更新（張力モデル + ばね剛性）
      const kEff = effectiveK(s.stiffness, dt, s.lagFrames);
      brush = ropeStep(brush, target, s.ropeLength, kEff);

      // サンプル間引き（細かすぎる点は省く）
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(brush.x - last.x, brush.y - last.y) >= 0.75) {
        pts.push({ x: brush.x, y: brush.y });
      }
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      // 終点でもう一度ロープ解決して取り込み
      const s = getState(store, id, DEFAULTS);
      const tNow = nowMs();
      const dt = Math.max(0, tNow - lastT);
      lastT = tNow;

      target = { x: ev.img.x, y: ev.img.y };
      const kEff = effectiveK(s.stiffness, dt, s.lagFrames);
      brush = ropeStep(brush, target, s.ropeLength, kEff);
      pts.push({ x: brush.x, y: brush.y });

      // ===== 最終ラスタライズ（中心線化 → リボン描画） =====
      const w = Math.max(1, s.brushSize);
      const ds = Math.max(w / 2, 0.5);

      const path = buildSmoothPath(pts, ds);               // 中心線化
      const res = resampleByDistance(path, Math.max(1, s.spacingRatio * w));

      // 太筆リボンで確定描画
      if (res.length >= 2) {
        const aabb = drawRibbonAndAabb(ctx, res, w, s.primaryColor);
        if (aabb) {
          const pad = 2;
          eng.expandPendingRectByRect?.(
            Math.floor(aabb.minX - w / 2 - pad),
            Math.floor(aabb.minY - w / 2 - pad),
            Math.ceil((aabb.maxX - aabb.minX) + w + pad * 2),
            Math.ceil((aabb.maxY - aabb.minY) + w + pad * 2)
          );
        }
      }

      // 片付け
      pts = [];
      target = null;
      brush = null;

      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    // ゴースト/ガイド表示：生ポインタとロープ出力を可視化（プレビューのみ）
    drawPreview(octx) {
      if (!drawing || !brush || pts.length < 1) return;
      const s = getState(store, id, DEFAULTS);

      // 中心線（出力）
      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.strokeStyle = s.primaryColor || '#000';
      octx.lineWidth = Math.max(1, s.brushSize);
      octx.beginPath();
      const off = (s.brushSize <= 1) ? 0.5 : 0;
      octx.moveTo(pts[0].x + off, pts[0].y + off);
      for (let i = 1; i < pts.length; i++) {
        octx.lineTo(pts[i].x + off, pts[i].y + off);
      }
      octx.stroke();
      octx.restore();

      // ロープ円とロープ線（視覚ガイド）
      if (target) {
        octx.save();
        octx.strokeStyle = 'rgba(0,0,0,0.25)';
        octx.lineWidth = 1;
        // ロープ円（brush 周りに L）
        octx.beginPath();
        octx.arc(brush.x + 0.5, brush.y + 0.5, s.ropeLength, 0, Math.PI * 2);
        octx.stroke();
        // ロープ線
        octx.beginPath();
        octx.moveTo(brush.x + 0.5, brush.y + 0.5);
        octx.lineTo(target.x + 0.5, target.y + 0.5);
        octx.stroke();
        octx.restore();
      }
    },
  };

  // ===== ロープ更新（Lazy Brush 風） =====
  // 目標 target と出力 brush の距離が L 以下なら張力 0 → brush は保持。
  // L を超えたら、円周上の「target から L 戻った点」を理想位置として、stiffness で追従。
  function ropeStep(brush, target, L, kEff) {
    const dx = target.x - brush.x;
    const dy = target.y - brush.y;
    const d = Math.hypot(dx, dy);
    if (d <= L) return { x: brush.x, y: brush.y }; // 張力なし（遅延維持）

    const ux = dx / (d || 1), uy = dy / (d || 1);
    const ideal = { x: target.x - ux * L, y: target.y - uy * L };

    return {
      x: brush.x + (ideal.x - brush.x) * kEff,
      y: brush.y + (ideal.y - brush.y) * kEff,
    };
  }

  // dt と lagFrames を考慮した効果剛性（連続時間の減衰近似）
  function effectiveK(kBase, dtMs, lagFrames) {
    const frameMs = 16.6667 * Math.max(1, lagFrames || 1);
    const n = Math.max(dtMs / frameMs, 0);
    // 1ステップで (1 - kBase) を掛ける減衰を n 乗に拡張 → 1 - (1-k)^n
    const keep = Math.pow(Math.max(0, 1 - kBase), n);
    return 1 - keep;
  }

  // ===== リボン描画 & AABB =====
  function drawRibbonAndAabb(ctx, points, width, color) {
    const half = width / 2;
    const left = [], right = [];

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i], p1 = points[i + 1];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len < EPS) continue;
      const nx = (-dy / len) * half, ny = (dx / len) * half;
      left.push({ x: p0.x + nx, y: p0.y + ny });
      right.push({ x: p0.x - nx, y: p0.y - ny });
      if (i === points.length - 2) {
        left.push({ x: p1.x + nx, y: p1.y + ny });
        right.push({ x: p1.x - nx, y: p1.y - ny });
      }
    }
    if (!left.length) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function acc(p){ if (p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x; if(p.y<minY)minY=p.y; if(p.y>maxY)maxY=p.y; }
    left.forEach(acc); right.forEach(acc);
    points.forEach(acc);

    ctx.save();
    ctx.fillStyle = color || '#000';
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    // 丸キャップ
    const start = points[0], end = points[points.length - 1];
    ctx.moveTo(start.x + half, start.y);
    ctx.arc(start.x, start.y, half, 0, Math.PI * 2);
    ctx.moveTo(end.x + half, end.y);
    ctx.arc(end.x, end.y, half, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    return { minX, minY, maxX, maxY };
  }

  // ===== ユーティリティ =====
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clamp(Number(s.brushSize ?? defs.brushSize), 1, 256),
      ropeLength: clamp(Number(s.ropeLength ?? s.L ?? defs.ropeLength), 1, 200),
      stiffness: clamp(Number(s.stiffness ?? s.k ?? defs.stiffness), 0.01, 0.95),
      lagFrames: clampInt(Number(s.lagFrames ?? defs.lagFrames), 1, 4),
      spacingRatio: Number.isFinite(s.spacingRatio) ? s.spacingRatio : defs.spacingRatio,
      primaryColor: s.primaryColor || '#000',
    };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clampInt(v, lo, hi) { v = v | 0; return v < lo ? lo : (v > hi ? hi : v); }

  // === パス補助（既存様式互換） ===
  function buildSmoothPath(ps, ds) {
    if (!ps || ps.length === 0) return [];
    const sm = emaSmooth(ps, 0.35);           // ロープ後なので弱め
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
