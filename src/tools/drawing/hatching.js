/*
 * ツール仕様
 * 概要: ストローク系の描画ツール群。筆圧や速度に応じてピクセルを塗布し、形状や質感を変化させます。
 * 入力: ペン/マウスのポインタイベント、筆圧や速度、Shiftなどの修飾キー。
 * 出力: ラスターレイヤー上の筆跡や効果付きストローク。
 * 操作: 左ドラッグで描画開始→移動でストローク更新→離して確定。右クリックやスポイト機能がある場合は色取得に使用。
 */
export function makeHatching(store) {
  const id = 'hatching';
  let drawing = false;
  let pts = [];
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
    },

    onPointerMove(ctx, ev) {
      if (!drawing) return;
      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) < EPS) return;
      pts.push(p);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;
      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) pts.push(p);

      const s = store.getToolState(id) || {};
      const brushW = Math.max(Number(s.brushSize) || 0, 0.1);

      // 方向場（固定角 or クロスハッチ）
      let angles = Array.isArray(s.hatchAngles) ? s.hatchAngles.slice() : null;
      if (!angles) {
        if (s.crosshatch) angles = [0, 45, 90, 135];
        else angles = [Number.isFinite(s.hatchAngle) ? s.hatchAngle : 0];
      }

      // 線間隔（濃度→間隔 12→4px）/ 明示指定があれば優先
      const density = Number.isFinite(s.hatchDensity) ? s.hatchDensity : 0.5; // 0..1
      const spacingDefault = 12 - 8 * Math.max(0, Math.min(1, density));
      const spacing = Math.max(2, Number.isFinite(s.hatchSpacing) ? s.hatchSpacing : spacingDefault);

      // 線幅
      const lineW = Math.max(0.5, Math.min(4, Number.isFinite(s.hatchWidth) ? s.hatchWidth : 1));

      // プレビュー用パスから平滑化→再サンプル（AABBとマスク用）
      const path = buildSmoothPath(pts, Math.max(brushW / 2, 0.5));
      if (path.length === 0) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // AABB
      let minX = path[0].x, maxX = path[0].x, minY = path[0].y, maxY = path[0].y;
      for (const q of path) {
        if (q.x < minX) minX = q.x;
        if (q.x > maxX) maxX = q.x;
        if (q.y < minY) minY = q.y;
        if (q.y > maxY) maxY = q.y;
      }
      const pad = brushW / 2 + lineW + 2;
      const bx = Math.floor(minX - pad), by = Math.floor(minY - pad);
      const bw = Math.ceil(maxX + pad) - bx, bh = Math.ceil(maxY + pad) - by;
      if (bw <= 0 || bh <= 0) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // オフスクリーンでハッチ生成 → マスク（ストローク形状）
      const off = document.createElement('canvas');
      off.width = bw; off.height = bh;
      const octx = off.getContext('2d');

      // ハッチ本体（複数角度を重ねる）
      for (const deg of angles) {
        drawHatchLines(octx, bw, bh, deg * Math.PI / 180, spacing, lineW, s.primaryColor || '#000');
      }

      // マスク：太線ストローク領域
      octx.save();
      octx.globalCompositeOperation = 'destination-in';
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.strokeStyle = 'rgba(0,0,0,1)';
      octx.lineWidth = brushW;
      octx.beginPath();
      octx.moveTo(path[0].x - bx, path[0].y - by);
      for (let i = 1; i < path.length; i++) octx.lineTo(path[i].x - bx, path[i].y - by);
      octx.stroke();
      octx.restore();

      // 合成
      ctx.drawImage(off, bx, by);

      // 無効領域
      eng.expandPendingRectByRect?.(bx, by, bw, bh);

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

  // === helpers ===
  function drawHatchLines(ctx, w, h, theta, spacing, lineW, color) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(theta);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'square';

    const L = Math.hypot(w, h); // 対角長で充分にカバー
    const start = -L, end = L;
    const step = Math.max(2, spacing);

    ctx.beginPath();
    for (let y = -L; y <= L; y += step) {
      ctx.moveTo(start, y);
      ctx.lineTo(end, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function buildSmoothPath(pts, ds) {
    if (!pts || pts.length === 0) return [];
    const sm = emaSmooth(pts, 0.4);
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
    const EPS2 = 1e-6;
    for (let i = 0; i < ps.length - 1; i++) {
      const p0 = ps[i - 1] || ps[i];
      const p1 = ps[i];
      const p2 = ps[i + 1];
      const p3 = ps[i + 2] || p2;

      const d01 = Math.max(Math.hypot(p1.x - p0.x, p1.y - p0.y), EPS2);
      const d12 = Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y), EPS2);
      const d23 = Math.max(Math.hypot(p3.x - p2.x, p3.y - p2.y), EPS2);

      const t0 = 0, t1 = t0 + Math.pow(d01, alpha);
      const t2 = t1 + Math.pow(d12, alpha);
      const t3 = t2 + Math.pow(d23, alpha);

      for (let j = 0; j < seg; j++) {
        const t = t1 + ((t2 - t1) * j) / seg;
        const A1 = lerpPoint(p0, p1, (t1 - t) / Math.max(t1 - t0, EPS2));
        const A2 = lerpPoint(p1, p2, (t2 - t) / Math.max(t2 - t1, EPS2));
        const A3 = lerpPoint(p2, p3, (t3 - t) / Math.max(t3 - t2, EPS2));
        const B1 = lerpPoint(A1, A2, (t2 - t) / Math.max(t2 - t0, EPS2));
        const B2 = lerpPoint(A2, A3, (t3 - t) / Math.max(t3 - t1, EPS2));
        out.push(lerpPoint(B1, B2, (t2 - t) / Math.max(t2 - t1, EPS2)));
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
