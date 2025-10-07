export function makeNoiseDisplaced(store) {
  const id = 'noise-displaced';
  let drawing = false;
  let pts = [];
  let strokeSeq = 0; // 種：ストロークID固定（ツール内で単調増加）
  const EPS = 1e-6;

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();
      drawing = true;
      pts = [{ ...ev.img }];
      strokeSeq++;
    },

    onPointerMove(ctx, ev) {
      if (!drawing) return;
      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      const dx = p.x - last.x, dy = p.y - last.y;
      if (dx * dx + dy * dy < 1) return; // 近接点間引き
      pts.push(p);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;
      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) pts.push(p);

      const s = store.getToolState(id) || {};
      const width = Math.max(Number(s.brushSize) || 0, 0.1);
      if (pts.length < 2 || width <= 0) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // 1) ストローク形状の整形
      const basePath = buildSmoothPath(pts, Math.max(width / 2, 0.5));
      if (basePath.length < 2) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // 2) 法線方向のノイズ変位
      const A = clamp(Number(s.ndAmplitude ?? 2), 0, 6); // 初期 1〜3px、上限 6px
      const f = clamp(Number(s.ndFrequency ?? 0.25), 0.02, 1.0); // 0.1〜0.4/点を中心に
      const seed = (Number(s.ndSeed ?? 0) | 0) ^ (strokeSeq & 0x7fffffff);

      const displaced = displaceAlongNormal(basePath, A, f, seed);

      // 3) 描画（膨張塗り＝リボンメッシュ）
      drawRibbon(ctx, displaced, width, s.primaryColor || '#000');

      // 4) 再描画領域（A と 幅/2 を加味）
      let minX = displaced[0].x, maxX = displaced[0].x, minY = displaced[0].y, maxY = displaced[0].y;
      for (const q of displaced) {
        if (q.x < minX) minX = q.x;
        if (q.x > maxX) maxX = q.x;
        if (q.y < minY) minY = q.y;
        if (q.y > maxY) maxY = q.y;
      }
      const pad = A + width / 2 + 2;
      if (eng.expandPendingRectByRect) {
        eng.expandPendingRectByRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
      } else {
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const rx = (maxX - minX) / 2 + pad, ry = (maxY - minY) / 2 + pad;
        eng.expandPendingRect?.(cx, cy, Math.hypot(rx, ry));
      }

      pts = [];
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview(octx) {
      if (!drawing || pts.length < 2) return;
      const s = store.getToolState(id) || {};
      const lw = Math.max(Number(s.brushSize) || 1, 1);
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

  // ===== Helpers =====

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function displaceAlongNormal(points, amp, freq, seed) {
    if (points.length < 2 || amp <= 0 || freq <= 0) return points.slice();

    // 法線計算（中心差分）
    const nrm = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y;
      const len = Math.hypot(tx, ty);
      if (len < EPS) { nrm[i] = { x: 0, y: 0 }; continue; }
      tx /= len; ty /= len;                // 接線
      nrm[i] = { x: -ty, y: tx };          // 法線
    }

    // 1D Value Noise（種固定）
    const out = new Array(points.length);
    let u = 0; // パラメータ（サンプル間で 1 進める想定）
    for (let i = 0; i < points.length; i++, u += 1) {
      const t = u * freq;
      const n = valueNoise1D(t, seed);       // 0..1
      const dn = (n * 2 - 1) * amp;          // -A..A
      out[i] = { x: points[i].x + nrm[i].x * dn, y: points[i].y + nrm[i].y * dn };
    }
    return out;
  }

  // 1D Value noise with linear interpolation and smooth fade
  function valueNoise1D(x, seed) {
    const i0 = Math.floor(x), i1 = i0 + 1;
    const t = x - i0;
    const a = hash01(i0, seed);
    const b = hash01(i1, seed);
    const f = t * t * (3 - 2 * t); // smoothstep
    return a * (1 - f) + b * f;
  }

  function hash01(i, seed) {
    // 32bit 整数ハッシュ → 0..1
    let h = (i | 0) ^ (seed | 0);
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  function buildSmoothPath(rawPts, ds) {
    if (!rawPts || rawPts.length === 0) return [];
    const sm = emaSmooth(rawPts, 0.4);
    const cr = centripetalCRSpline(sm, 16);
    const rs = resampleByDistance(cr, Math.max(ds || 2, 0.5));
    // 終点保障
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

  function drawRibbon(ctx, points, width, color) {
    const half = width / 2;
    const left = [], right = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i], p1 = points[i + 1];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len < EPS) continue;
      const nx = (-dy / len) * half;
      const ny = (dx / len) * half;
      left.push({ x: p0.x + nx, y: p0.y + ny });
      right.push({ x: p0.x - nx, y: p0.y - ny });
      if (i === points.length - 2) {
        left.push({ x: p1.x + nx, y: p1.y + ny });
        right.push({ x: p1.x - nx, y: p1.y - ny });
      }
    }
    if (!left.length) return;

    ctx.save();
    ctx.fillStyle = color;
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
}
