/**
 * Snap / Grid（スナップ）
 * グリッド・角度・頂点（過去端点）へ吸着して整った線を描くブラシ。
 *
 * 仕様
 * - 入力 → 最近傍の格子点／量子化角度／既存頂点への射影候補を生成
 * - 候補ごとに半径 r 内はハードスナップ、2r までをソフト（距離に応じて線形補間）
 * - 候補は「移動量が最小」のものを採用（頂点は最優先）
 * - ラスタは既定のストローク（source-over, round cap/join）
 *
 * store.getToolState('snap-grid') 主パラメータ（初期値は getState 参照）:
 *   brushSize      : px（既定 12）
 *   primaryColor   : '#rrggbb'
 *   gridSize       : 8..32 px
 *   angleStepDeg   : 15 | 30 ...
 *   snapRadius     : 4..12 px   （ハード：r、ソフト：2r）
 *   snapStrength   : 0..1       （ソフト領域での寄与）
 *   enableGrid     : boolean
 *   enableAngle    : boolean
 *   enableVertex   : boolean
 *   minSampleDist  : 0.5 px（入力間引き）
 *
 * 再描画通知：線分AABBを広めに通知（± brush/2 + snapRadius + 3）。
 */
export function makeSnapGridBrush(store) {
  const id = 'snap-grid';

  let drawing = false;
  let pts = [];          // スナップ後の点列（描画用）
  let rawPrev = null;    // 生入力の前回点
  let unionRect = null;  // ダメージ統合

  // 頂点プール（このツールのセッション/状態に保存）
  function getVertexPool() {
    const st = store.getToolState(id) || {};
    st.vertices = Array.isArray(st.vertices) ? st.vertices : [];
    store.setToolState(id, st);
    return st.vertices;
  }

  const DEFAULTS = {
    brushSize: 12,
    primaryColor: '#000',
    gridSize: 16,
    angleStepDeg: 15,
    snapRadius: 8,
    snapStrength: 1.0,
    enableGrid: true,
    enableAngle: true,
    enableVertex: true,
    minSampleDist: 0.5,
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      drawing = true;
      pts = [];
      rawPrev = { ...ev.img };

      const s = getState(store, id, DEFAULTS);
      const p0 = applySnap(rawPrev, null, s, getVertexPool());
      pts.push(p0);

      // 最初の点の小円（点打ち対応）
      if (s.brushSize <= 2) {
        ctx.save();
        ctx.fillStyle = s.primaryColor;
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, Math.max(0.5, s.brushSize / 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        const pad = Math.ceil(s.brushSize / 2 + s.snapRadius + 3);
        unionRect = unionAabb(null, aabbOfPoints([p0], pad));
      } else {
        unionRect = null;
      }
    },

    onPointerMove(ctx, ev) {
      if (!drawing) return;
      const s = getState(store, id, DEFAULTS);

      const raw = { ...ev.img };
      const lastDraw = pts[pts.length - 1];

      // 入力間引き
      if (dist2(raw, rawPrev) < s.minSampleDist * s.minSampleDist) return;

      const snapped = applySnap(raw, lastDraw, s, getVertexPool());
      if (pts.length === 0 || dist2(snapped, lastDraw) >= 0.01) {
        // ラインをその都度追加描画（軽量セグメント）
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = s.primaryColor;
        ctx.lineWidth = Math.max(1, s.brushSize);
        const off = s.brushSize <= 1 ? 0.5 : 0;
        ctx.beginPath();
        ctx.moveTo(lastDraw.x + off, lastDraw.y + off);
        ctx.lineTo(snapped.x + off, snapped.y + off);
        ctx.stroke();
        ctx.restore();

        pts.push(snapped);

        // ダメージ更新（広め）
        const pad = Math.ceil(s.brushSize / 2 + s.snapRadius + 3);
        unionRect = unionAabb(unionRect, aabbOfPoints([lastDraw, snapped], pad));
      }

      rawPrev = raw;
    },

    onPointerUp(_ctx, _ev, eng) {
      if (!drawing) return;
      drawing = false;

      // 頂点登録（始終点）
      if (pts.length) {
        const verts = getVertexPool();
        const first = pts[0];
        const last = pts[pts.length - 1];
        verts.push({ x: first.x, y: first.y });
        if (dist2(first, last) > 0.01) verts.push({ x: last.x, y: last.y });
        store.setToolState(id, { ...store.getToolState(id), vertices: verts });
      }

      if (unionRect) {
        eng.expandPendingRectByRect?.(unionRect.x, unionRect.y, unionRect.w, unionRect.h);
      }
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());

      pts = [];
      rawPrev = null;
      unionRect = null;
    },

    // 進行中プレビュー：スナップ後のポリラインをオーバーレイ
    drawPreview(octx) {
      if (!drawing || pts.length < 2) return;
      const s = getState(store, id, DEFAULTS);
      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.strokeStyle = s.primaryColor;
      octx.lineWidth = Math.max(1, s.brushSize);
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

  // ===================== スナップ核 =======================

  function applySnap(raw, prevSnap, s, vertexPool) {
    // 1) 頂点スナップ（最優先）
    if (s.enableVertex && vertexPool.length) {
      const v = nearestVertex(raw, vertexPool, s.snapRadius * 1.2);
      if (v) return v;
    }

    // 2) 角度スナップ（前点基準）
    let candAngle = null;
    if (s.enableAngle && prevSnap) {
      const v = { x: raw.x - prevSnap.x, y: raw.y - prevSnap.y };
      const L = Math.hypot(v.x, v.y);
      if (L > 1e-6) {
        const ang = Math.atan2(v.y, v.x);
        const step = (s.angleStepDeg * Math.PI) / 180;
        const q = Math.round(ang / step) * step;
        const dir = { x: Math.cos(q), y: Math.sin(q) };
        candAngle = { x: prevSnap.x + dir.x * L, y: prevSnap.y + dir.y * L };
      }
    }

    // 3) グリッドスナップ
    let candGrid = null;
    if (s.enableGrid) {
      const gs = Math.max(1, s.gridSize | 0);
      candGrid = { x: Math.round(raw.x / gs) * gs, y: Math.round(raw.y / gs) * gs };
    }

    // 4) 候補の採用（移動量が最小のもの）。ソフトスナップをかける。
    let best = raw;
    let bestD = Infinity;

    function consider(target) {
      if (!target) return;
      const d = Math.hypot(target.x - raw.x, target.y - raw.y);
      if (d < bestD) { bestD = d; best = target; }
    }
    consider(candAngle);
    consider(candGrid);

    // ソフト/ハード閾値
    const r = s.snapRadius;
    const d = bestD;
    if (d <= r) {
      // ハードスナップ
      return best;
    } else if (d <= 2 * r) {
      // ソフトスナップ：strength に応じて補間
      const t = s.snapStrength * (1 - (d - r) / r); // r→2r で 1→0
      return lerpPoint(raw, best, t);
    }
    // スナップ外
    return raw;
  }

  // ===================== 幾何ユーティリティ =======================

  function nearestVertex(p, verts, radius) {
    const r2 = radius * radius;
    let best = null, bd2 = r2;
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      const d2 = dist2(p, v);
      if (d2 < bd2) { bd2 = d2; best = v; }
    }
    return best;
  }

  function aabbOfPoints(points, pad = 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: Math.floor(minX - pad),
      y: Math.floor(minY - pad),
      w: Math.ceil((maxX - minX) + pad * 2),
      h: Math.ceil((maxY - minY) + pad * 2),
    };
  }

  function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
  function lerpPoint(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { x: b.x|0, y: b.y|0, w: Math.ceil(b.w), h: Math.ceil(b.h) };
    const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize:     clampNum(s.brushSize ?? defs.brushSize, 1, 256),
      primaryColor:  s.primaryColor || defs.primaryColor,
      gridSize:      clampNum(s.gridSize ?? defs.gridSize, 2, 256),
      angleStepDeg:  clampNum(s.angleStepDeg ?? defs.angleStepDeg, 1, 90),
      snapRadius:    clampNum(s.snapRadius ?? defs.snapRadius, 1, 32),
      snapStrength:  clampNum(s.snapStrength ?? defs.snapStrength, 0, 1),
      enableGrid:    s.enableGrid !== undefined ? !!s.enableGrid : defs.enableGrid,
      enableAngle:   s.enableAngle !== undefined ? !!s.enableAngle : defs.enableAngle,
      enableVertex:  s.enableVertex !== undefined ? !!s.enableVertex : defs.enableVertex,
      minSampleDist: clampNum(s.minSampleDist ?? defs.minSampleDist, 0.1, 4),
    };
  }
  function clampNum(v, lo, hi) { v = +v; if (!Number.isFinite(v)) v = lo; return v < lo ? lo : (v > hi ? hi : v); }
}
