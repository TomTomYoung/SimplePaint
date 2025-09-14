/**
 * Vectorization（ラフ→ベクター化）
 * 入力ラフ点列 → Douglas–Peucker で単純化 → Catmull–Rom を Bezier に変換 → 既定ラスタで描画
 * - 仕上がったベクタは store へ保存（後編集しやすい構造）
 * - 再描画通知は最終ベクタの AABB のみ
 */
function makeVectorizationBrush(store) {
  const id = 'vectorization';

  let drawing = false;
  /** @type {{x:number,y:number}[]} */
  let pts = [];

  const DEFAULTS = {
    brushSize: 12,
    primaryColor: '#000',
    epsilon: 1.2,      // 許容誤差 ε（0.5〜2.0px 目安）
    minSeg: 1.0,       // 最小セグメント長（px）
    join: 'round',
    cap: 'round',
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      drawing = true;
      pts.length = 0;
      pts.push({ ...ev.img });
    },

    onPointerMove(_ctx, ev) {
      if (!drawing) return;
      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      // サンプル過多を抑える（0.5px 未満は棄却）
      const dx = p.x - last.x, dy = p.y - last.y;
      if (dx * dx + dy * dy < 0.25) return;
      pts.push(p);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;
      pts.push({ ...ev.img });
      if (pts.length < 2) return;

      const s = getState(store, id, DEFAULTS);

      // 1) 単純化（Douglas–Peucker）
      const simplified = rdpSimplify(pts, s.epsilon);

      // 2) 最小セグメント長でさらっと間引き
      const coarse = dropShortSegments(simplified, s.minSeg);

      // 3) Bezier セグメントへ（Catmull–Rom → Bezier）
      const segments = catmullRomToBeziers(coarse);

      // 4) 描画（既定ラスタ）
      const aabb = strokeBezierPath(ctx, segments, s);

      // 5) AABB 通知（ライン幅分の余白を含む）
      eng.expandPendingRectByRect?.(aabb.x, aabb.y, aabb.w, aabb.h);

      // 6) ベクタを保存（後編集用）
      const state = store.getToolState(id) || {};
      const vectors = state.vectors || [];
      vectors.push({
        type: 'bezierPath',
        segments,                       // [{p0,c1,c2,p3}]
        color: s.primaryColor,
        width: s.brushSize,
        join: s.join,
        cap: s.cap,
        meta: { epsilon: s.epsilon, minSeg: s.minSeg, closed: false },
      });
      store.setToolState(id, { ...state, vectors });

      pts.length = 0;

      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    // 進行中は素直なポリラインで軽量プレビュー（確定時にベクタで上書き）
    drawPreview(octx) {
      if (!drawing || pts.length < 2) return;
      const s = getState(store, id, DEFAULTS);
      octx.save();
      octx.lineCap = s.cap;
      octx.lineJoin = s.join;
      octx.strokeStyle = s.primaryColor;
      octx.lineWidth = s.brushSize;
      const off = s.brushSize <= 1 ? 0.5 : 0;
      octx.beginPath();
      octx.moveTo(pts[0].x + off, pts[0].y + off);
      for (let i = 1; i < pts.length; i++) {
        octx.lineTo(pts[i].x + off, pts[i].y + off);
      }
      octx.stroke();
      octx.restore();
    },
  };

  // ===== Douglas–Peucker ===================================================
  function rdpSimplify(points, epsilon) {
    if (!points || points.length <= 2) return points.slice();
    const out = [];
    _rdp(0, points.length - 1);
    function _rdp(first, last) {
      let idx = -1;
      let maxD = 0;
      const a = points[first], b = points[last];
      for (let i = first + 1; i < last; i++) {
        const d = pointLineDistance(points[i], a, b);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > epsilon && idx !== -1) {
        _rdp(first, idx);
        _rdp(idx, last);
      } else {
        if (out.length === 0 || out[out.length - 1] !== a) out.push(a);
        out.push(b);
      }
    }
    // 重複除去
    const dedup = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const p = out[i], q = dedup[dedup.length - 1];
      if (p.x !== q.x || p.y !== q.y) dedup.push(p);
    }
    return dedup;
  }

  function pointLineDistance(p, a, b) {
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = p.x - a.x, wy = p.y - a.y;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(wx, wy);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
    const t = c1 / c2;
    const px = a.x + vx * t, py = a.y + vy * t;
    return Math.hypot(p.x - px, p.y - py);
  }

  // ===== 最小セグメント長フィルタ =========================================
  function dropShortSegments(points, minLen) {
    if (points.length < 2) return points.slice();
    const out = [points[0]];
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - out[out.length - 1].x;
      const dy = points[i].y - out[out.length - 1].y;
      const d = Math.hypot(dx, dy);
      if (d >= minLen) out.push(points[i]);
      else acc += d; // （必要なら Δs 繰越に使える）
    }
    if (out.length < 2) out.push(points[points.length - 1]);
    return out;
  }

  // ===== Catmull–Rom → Cubic Bezier（端点は複製で自然端） =================
  // ここでは安定性重視で「一様 CR」からの簡易変換を採用。
  // セグメント (P1→P2) に対して：
  //   C1 = P1 + (P2 - P0) / 6
  //   C2 = P2 - (P3 - P1) / 6
  function catmullRomToBeziers(points) {
    if (points.length < 2) {
      return [];
    } else if (points.length === 2) {
      const p0 = points[0], p3 = points[1];
      const c1 = { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 };
      const c2 = { x: p0.x + (p3.x - p0.x) * 2 / 3, y: p0.y + (p3.y - p0.y) * 2 / 3 };
      return [{ p0, c1, c2, p3 }];
    }
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) {
      const P0 = points[i - 1] || points[i];
      const P1 = points[i];
      const P2 = points[i + 1];
      const P3 = points[i + 2] || points[i + 1];

      const c1 = {
        x: P1.x + (P2.x - P0.x) / 6,
        y: P1.y + (P2.y - P0.y) / 6,
      };
      const c2 = {
        x: P2.x - (P3.x - P1.x) / 6,
        y: P2.y - (P3.y - P1.y) / 6,
      };
      segs.push({ p0: { x: P1.x, y: P1.y }, c1, c2, p3: { x: P2.x, y: P2.y } });
    }
    return segs;
  }

  // ===== Bezier パスのストローク描画 & AABB算出 ============================
  function strokeBezierPath(ctx, segments, s) {
    if (!segments.length) return { x: 0, y: 0, w: 0, h: 0 };

    ctx.save();
    ctx.lineCap = s.cap;
    ctx.lineJoin = s.join;
    ctx.strokeStyle = s.primaryColor;
    ctx.lineWidth = Math.max(1, s.brushSize);

    const off = s.brushSize <= 1 ? 0.5 : 0;

    ctx.beginPath();
    ctx.moveTo(segments[0].p0.x + off, segments[0].p0.y + off);
    for (const seg of segments) {
      ctx.bezierCurveTo(
        seg.c1.x + off, seg.c1.y + off,
        seg.c2.x + off, seg.c2.y + off,
        seg.p3.x + off, seg.p3.y + off
      );
    }
    ctx.stroke();
    ctx.restore();

    // ざっくり AABB：端点/制御点の min/max にライン幅の半分 + 2px を追加
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const seg of segments) {
      const pts = [seg.p0, seg.c1, seg.c2, seg.p3];
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    const pad = Math.ceil(s.brushSize / 2 + 2);
    return {
      x: Math.floor(minX - pad),
      y: Math.floor(minY - pad),
      w: Math.ceil((maxX - minX) + pad * 2),
      h: Math.ceil((maxY - minY) + pad * 2),
    };
  }

  // ===== ユーティリティ =====================================================
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clampNum(s.brushSize ?? defs.brushSize, 1, 256),
      primaryColor: s.primaryColor || defs.primaryColor,
      epsilon: clampNum(s.epsilon ?? defs.epsilon, 0.1, 8.0),
      minSeg: clampNum(s.minSeg ?? defs.minSeg, 0.1, 8.0),
      join: (s.join === 'bevel' || s.join === 'miter') ? s.join : defs.join,
      cap: (s.cap === 'butt' || s.cap === 'square') ? s.cap : defs.cap,
    };
  }
  function clampNum(v, lo, hi) { v = +v; if (!Number.isFinite(v)) v = lo; return v < lo ? lo : (v > hi ? hi : v); }
}

window.makeVectorizationBrush = makeVectorizationBrush;
