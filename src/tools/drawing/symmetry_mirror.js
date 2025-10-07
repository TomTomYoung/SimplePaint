export function makeSymmetryMirror(store) {
  const id = 'symmetry-mirror';

  let drawing = false;
  let pts = [];
  const EPS = 1e-6;

  // 既定値
  const DEFAULTS = {
    brushSize: 12,
    n: 6,                 // 2〜12
    mode: 'dihedral',     // 'rotate' | 'dihedral'
    reflect: true,        // mode='dihedral'で既定 true（鏡映を有効化）
    axisAngle: 0,         // 基準軸（度）
    // center は {x,y} または centerX/centerY をサポート。未指定ならキャンバス中心。
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      // Alt/Option/Meta で中心点の設定モード（描画はしない）
      const alt = !!(ev.altKey || ev.metaKey || (ev.mod && (ev.mod.alt || ev.mod.meta)));
      if (alt) {
        const cur = store.getToolState(id) || {};
        const center = { x: ev.img.x, y: ev.img.y };
        store.setToolState(id, { ...cur, center });
        return;
      }

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
      const w = Math.max(1, s.brushSize);
      const path = buildSmoothPath(pts, Math.max(w / 2, 0.5));
      if (path.length < 2) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // 対称群パラメータ
      const n = clampInt(s.n, 2, 12);
      const center = getCenter(s, ctx);
      const axisRad = (Number(s.axisAngle) || 0) * Math.PI / 180;
      const doReflect = (s.mode === 'dihedral') || (!!s.reflect);

      // AABB 統合用
      let minX =  Infinity, minY =  Infinity, maxX = -Infinity, maxY = -Infinity;
      const pad = w / 2 + 2;

      // 回転 n 分割
      for (let k = 0; k < n; k++) {
        const rot = (2 * Math.PI * k) / n;

        // 回転コピー
        {
          const rp = transformPath(path, (pt) => rotatePoint(pt, center, rot));
          drawRibbon(ctx, rp, w, s.primaryColor);
          const bb = boundsOfPoints(rp);
          minX = Math.min(minX, bb.minX); minY = Math.min(minY, bb.minY);
          maxX = Math.max(maxX, bb.maxX); maxY = Math.max(maxY, bb.maxY);
        }

        // 鏡映 + 回転（D_n の反転要素）
        if (doReflect) {
          const refp = transformPath(path, (pt) => rotatePoint(reflectPoint(pt, center, axisRad), center, rot));
          drawRibbon(ctx, refp, w, s.primaryColor);
          const bb2 = boundsOfPoints(refp);
          minX = Math.min(minX, bb2.minX); minY = Math.min(minY, bb2.minY);
          maxX = Math.max(maxX, bb2.maxX); maxY = Math.max(maxY, bb2.maxY);
        }
      }

      // 再描画範囲（ストローク幅分の余白込み）
      if (isFinite(minX)) {
        eng.expandPendingRectByRect?.(
          Math.floor(minX - pad),
          Math.floor(minY - pad),
          Math.ceil(maxX - minX + pad * 2),
          Math.ceil(maxY - minY + pad * 2)
        );
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

  // ===== 変換ユーティリティ =====
  function rotatePoint(p, c, ang) {
    const x = p.x - c.x, y = p.y - c.y;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    return { x: c.x + x * cs - y * sn, y: c.y + x * sn + y * cs };
  }

  // 角度 axis（ラジアン）の直線に対する鏡映（中心 c を通る）
  function reflectPoint(p, c, axis) {
    const x = p.x - c.x, y = p.y - c.y;
    const cs = Math.cos(2 * axis), sn = Math.sin(2 * axis);
    // M = [cs sn; sn -cs]
    const rx =  cs * x + sn * y;
    const ry =  sn * x - cs * y;
    return { x: c.x + rx, y: c.y + ry };
  }

  function transformPath(path, fn) {
    const out = new Array(path.length);
    for (let i = 0; i < path.length; i++) out[i] = fn(path[i]);
    return out;
  }

  function boundsOfPoints(arr) {
    let minX = arr[0].x, maxX = arr[0].x, minY = arr[0].y, maxY = arr[0].y;
    for (let i = 1; i < arr.length; i++) {
      const p = arr[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  // ===== 太筆リボン描画（丸キャップ） =====
  function drawRibbon(ctx, points, width, color) {
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
    if (!left.length) return;

    ctx.save();
    ctx.fillStyle = color || '#000';
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();

    // 両端の丸キャップ
    const start = points[0], end = points[points.length - 1];
    ctx.moveTo(start.x + half, start.y);
    ctx.arc(start.x, start.y, half, 0, Math.PI * 2);
    ctx.moveTo(end.x + half, end.y);
    ctx.arc(end.x, end.y, half, 0, Math.PI * 2);

    ctx.fill();
    ctx.restore();
  }

  // ===== 状態・補助 =====
  function getCenter(s, ctx) {
    if (s.center && Number.isFinite(s.center.x) && Number.isFinite(s.center.y)) return s.center;
    if (Number.isFinite(s.centerX) && Number.isFinite(s.centerY)) return { x: s.centerX, y: s.centerY };
    const cnv = ctx.canvas;
    return { x: cnv ? cnv.width / 2 : 0, y: cnv ? cnv.height / 2 : 0 };
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clamp(Number(s.brushSize ?? defs.brushSize), 1, 256),
      n: clampInt(Number(s.n ?? defs.n) || defs.n, 2, 12),
      mode: (s.mode === 'rotate' || s.mode === 'dihedral') ? s.mode : defs.mode,
      reflect: (s.reflect !== undefined) ? !!s.reflect : defs.reflect,
      axisAngle: Number.isFinite(s.axisAngle) ? s.axisAngle : defs.axisAngle,
      center: s.center || null,
      centerX: s.centerX, centerY: s.centerY,
      primaryColor: s.primaryColor || '#000',
    };
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
