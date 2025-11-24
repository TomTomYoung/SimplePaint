// ツール仕様: 概要=ベクターパスの作成・編集ツール。 入力=ポインタクリック/ドラッグ、修飾キー、必要に応じてキーボード確定操作。 出力=ベクターレイヤー上のパスやアウトライン操作結果。 操作=クリックで点やパスを追加、ドラッグで制御点調整、Enterで確定、Escでキャンセル。
/**
 * Outline / Stroke-to-Fill（輪郭化）
 * 中心線（ポリライン）と線幅から左右オフセットを生成し、join/cap を構築して
 * 外形ポリゴンとして塗り保持します。最終ポリゴンの AABB を 1 回通知します。
 *
 * 仕様メモ
 * - join: "round" | "bevel" | "miter"
 * - cap : "round" | "square"  （butt は square=0延長/round=半円のみ として扱える）
 * - miterLimit: 4〜6（miter長 / (w/2) の上限。超えたら bevel へフォールバック）
 * - 自己交差は Canvas の非ゼロ塗りルールで自然に解消（簡易クリッピング相当）
 */
export function makeOutlineStrokeToFill(store) {
  const id = 'outline-stroke-fill';

  let drawing = false;
  /** @type {{x:number,y:number}[]} */
  let pts = [];

  const DEFAULTS = {
    brushSize: 12,
    primaryColor: '#000',
    join: 'miter',        // 'round' | 'bevel' | 'miter'
    cap: 'round',         // 'round' | 'square'
    miterLimit: 5,
    roundSegments: 12,    // 丸 join/cap の分割数（角度に比例して可変化）
    minSampleDist: 0.25,  // 入力点の間引き（px）
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
      const dx = p.x - last.x, dy = p.y - last.y;
      if (dx * dx + dy * dy < (DEFAULTS.minSampleDist ** 2)) return;
      pts.push(p);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;
      pts.push({ ...ev.img });
      if (pts.length === 1) {
        // 単点：円ディスクで塗り
        const s = getState(store, id, DEFAULTS);
        const r = s.brushSize / 2;
        ctx.save();
        ctx.fillStyle = s.primaryColor;
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        eng.expandPendingRectByRect?.(Math.floor(pts[0].x - r - 2), Math.floor(pts[0].y - r - 2), Math.ceil((r + 2) * 2), Math.ceil((r + 2) * 2));
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        pts.length = 0;
        return;
      }

      const s = getState(store, id, DEFAULTS);

      // 入力を軽く正規化：ゼロ長セグメント除去
      const poly = dedupCollinear(pts, 1e-6);

      // 外形ポリゴン生成
      const polyfill = strokeToFillPolygon(poly, s);

      // 塗り
      const aabb = fillPolygon(ctx, polyfill, s.primaryColor);

      // 通知
      eng.expandPendingRectByRect?.(aabb.x, aabb.y, aabb.w, aabb.h);

      // ベクタ保存（編集用）
      const state = store.getToolState(id) || {};
      const fills = state.fills || [];
      fills.push({
        type: 'outlineFill',
        color: s.primaryColor,
        width: s.brushSize,
        join: s.join,
        cap: s.cap,
        miterLimit: s.miterLimit,
        polygon: polyfill,            // [{x,y}...]
      });
      store.setToolState(id, { ...state, fills });

      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
      pts.length = 0;
    },

    // 進行中は通常ストロークのプレビュー（軽量）
    drawPreview(octx) {
      if (!drawing || pts.length < 2) return;
      const s = getState(store, id, DEFAULTS);
      octx.save();
      octx.lineCap = s.cap === 'square' ? 'square' : 'round';
      octx.lineJoin = s.join;
      octx.strokeStyle = s.primaryColor;
      octx.lineWidth = s.brushSize;
      const off = s.brushSize <= 1 ? 0.5 : 0;
      octx.beginPath();
      octx.moveTo(pts[0].x + off, pts[0].y + off);
      for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x + off, pts[i].y + off);
      octx.stroke();
      octx.restore();
    },
  };

  // ===== メイン：中心線 → 外形ポリゴン ====================================
  function strokeToFillPolygon(points, s) {
    if (points.length < 2) return points.slice();
    const half = Math.max(0.5, s.brushSize / 2);

    // 方向/法線の準備
    const N = points.length;
    const tangents = new Array(N - 1);
    const normals = new Array(N - 1);
    for (let i = 0; i < N - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const len = Math.hypot(dx, dy) || 1e-6;
      const tx = dx / len, ty = dy / len;
      tangents[i] = { x: tx, y: ty };
      normals[i] = { x: -ty, y: tx }; // 左法線
    }

    // 左右ポリライン
    const left = [];
    const right = [];

    // --- 始端 cap の下準備 ---
    const t0 = tangents[0];
    const n0 = normals[0];
    const p0 = points[0];
    let L0 = add(p0, scale(n0, half));
    let R0 = add(p0, scale(n0, -half));
    if (s.cap === 'square') {
      const ext = scale(t0, -half);
      L0 = add(L0, ext);
      R0 = add(R0, ext);
    }
    left.push(L0);
    right.push(R0);

    // --- 中間頂点 join ---
    for (let i = 1; i < N - 1; i++) {
      const P = points[i];
      const tPrev = tangents[i - 1], tNext = tangents[i];
      const nPrev = normals[i - 1],  nNext = normals[i];
      const turn = cross2(tPrev, tNext); // >0: 左旋回

      // 左側
      if (turn > 0) {
        // 外側（左側が外）→ join 適用
        makeJoin(left, P, tPrev, tNext, nPrev, nNext, +1, half, s);
        // 右側（内側）→ 収縮（交点 or 並進）
        makeInner(right, P, tPrev, tNext, nPrev, nNext, -1, half);
      } else if (turn < 0) {
        // 右が外
        makeInner(left, P, tPrev, tNext, nPrev, nNext, +1, half);
        makeJoin(right, P, tPrev, tNext, nPrev, nNext, -1, half, s);
      } else {
        // 直線
        left.push(add(P, scale(nPrev, +half)));
        right.push(add(P, scale(nPrev, -half)));
      }
    }

    // --- 終端 cap 下準備 ---
    const tL = tangents[N - 2];
    const nL = normals[N - 2];
    const pL = points[N - 1];
    let Ln = add(pL, scale(nL, +half));
    let Rn = add(pL, scale(nL, -half));
    if (s.cap === 'square') {
      const ext = scale(tL, +half);
      Ln = add(Ln, ext);
      Rn = add(Rn, ext);
    }
    left.push(Ln);
    right.push(Rn);

    // --- cap（round）の追加 ---
    let poly = [];
    if (s.cap === 'round') {
      // 始端：P0 を中心に L0 → R0 へ半円
      poly = poly.concat(left);
      const startArc = arcPoints(p0, angleOf(n0), angleOf(scale(n0, -1)), half, s.roundSegments, false); // 時計回り（左→右）
      poly = poly.concat(startArc);
      // 右辺（反転）
      const revR = right.slice().reverse();
      poly = poly.concat(revR);
      // 終端：pL を中心に Rn → Ln へ半円
      const endArc = arcPoints(pL, angleOf(scale(nL, -1)), angleOf(nL), half, s.roundSegments, false);
      poly = poly.concat(endArc);
    } else {
      // square: 左辺 → 右辺反転（capは既に延長済み）
      poly = poly.concat(left);
      poly = poly.concat(right.slice().reverse());
    }

    return poly;
  }

  // ===== join 構築（外側） ================================================
  function makeJoin(out, P, tPrev, tNext, nPrev, nNext, sideSign, half, s) {
    // sideSign: +1=左オフセット, -1=右オフセット
    const a = add(P, scale(nPrev, sideSign * half));
    const b = add(P, scale(nNext, sideSign * half));
    const hit = lineIntersection(a, tPrev, b, tNext); // 交点（ミタ）
    if (s.join === 'round') {
      // 丸 join：中心 P、半径 half、法線角 nPrev→nNext 方向に弧を追加
      out.push(a);
      const ccw = (sideSign > 0 ? cross2(tPrev, tNext) > 0 : cross2(tPrev, tNext) < 0);
      const arc = arcPoints(P, angleOf(scale(nPrev, sideSign)), angleOf(scale(nNext, sideSign)), half, s.roundSegments, ccw);
      // 端点は重複するので中間のみ
      for (let k = 1; k < arc.length - 1; k++) out.push(arc[k]);
      out.push(b);
      return;
    }
    if (hit) {
      // miter 長が長すぎるなら bevel
      const miterVec = sub(hit, P);
      const miterLen = length(miterVec);
      if (s.join === 'miter' && miterLen <= s.miterLimit * half * 1.05) {
        out.push(hit);
        return;
      }
      // bevel
      out.push(a);
      out.push(b);
      return;
    } else {
      // ほぼ平行：bevel で繋ぐ
      out.push(a);
      out.push(b);
    }
  }

  // ===== 内側処理（外側と反対側の角は縮む） ================================
  function makeInner(out, P, tPrev, tNext, nPrev, nNext, sideSign, half) {
    // 内側は安全に「平均法線」または交点（無ければ二点）で繋ぐ
    const a = add(P, scale(nPrev, sideSign * half));
    const b = add(P, scale(nNext, sideSign * half));
    const hit = lineIntersection(a, tPrev, b, tNext);
    if (hit) out.push(hit);
    else {
      // 角が鋭すぎて交点が不安定な場合は短い bevel
      out.push(a);
      out.push(b);
    }
  }

  // ====== ポリゴン塗りと AABB =============================================
  function fillPolygon(ctx, poly, color) {
    if (!poly.length) return { x:0, y:0, w:0, h:0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) {
      const p = poly[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill('nonzero'); // 自己交差は非ゼロ塗りで解消
    ctx.restore();

    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = 2; // AA 余白
    return {
      x: Math.floor(minX - pad),
      y: Math.floor(minY - pad),
      w: Math.ceil((maxX - minX) + pad * 2),
      h: Math.ceil((maxY - minY) + pad * 2),
    };
  }

  // ===== 幾何ユーティリティ ===============================================
  function add(a,b){ return { x:a.x+b.x, y:a.y+b.y }; }
  function sub(a,b){ return { x:a.x-b.x, y:a.y-b.y }; }
  function scale(a,s){ return { x:a.x*s, y:a.y*s }; }
  function dot2(a,b){ return a.x*b.x + a.y*b.y; }
  function cross2(a,b){ return a.x*b.y - a.y*b.x; }
  function length(a){ return Math.hypot(a.x, a.y); }
  function angleOf(v){ return Math.atan2(v.y, v.x); }

  function lineIntersection(p, v, q, w) {
    // p + t v と q + u w の交点。v×w ≈ 0 なら null
    const det = cross2(v, w);
    if (Math.abs(det) < 1e-6) return null;
    const t = cross2(sub(q, p), w) / det;
    return add(p, scale(v, t));
  }

  // 角度 from→to を CCW で進む（ccw=true）or CW（false）に分割
  function arcPoints(center, ang0, ang1, r, baseSeg, ccw) {
    let a0 = ang0, a1 = ang1;
    // 差を -PI..PI に正規化
    let da = a1 - a0;
    while (da <= -Math.PI) da += Math.PI * 2;
    while (da >  Math.PI) da -= Math.PI * 2;
    if (ccw && da < 0) da += Math.PI * 2;
    if (!ccw && da > 0) da -= Math.PI * 2;

    const ad = Math.abs(da);
    const seg = Math.max(2, Math.round(baseSeg * (ad / (Math.PI))));
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const a = a0 + da * t;
      pts.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });
    }
    return pts;
  }

  function dedupCollinear(points, eps) {
    if (points.length <= 2) return points.slice();
    const out = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const a = out[out.length - 1];
      const b = points[i];
      const c = points[i + 1];
      const ab = { x: b.x - a.x, y: b.y - a.y };
      const bc = { x: c.x - b.x, y: c.y - b.y };
      const area2 = Math.abs(cross2(ab, bc));
      const ab2 = dot2(ab, ab);
      const bc2 = dot2(bc, bc);
      // 同一点/極短 or 準直線ならスキップ
      if (ab2 < eps || bc2 < eps || area2 < eps) continue;
      out.push(b);
    }
    out.push(points[points.length - 1]);
    return out;
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    const join = (s.join === 'round' || s.join === 'bevel' || s.join === 'miter') ? s.join : defs.join;
    const cap  = (s.cap === 'square' || s.cap === 'round') ? s.cap : defs.cap;
    return {
      brushSize: clampNum(s.brushSize ?? defs.brushSize, 1, 256),
      primaryColor: s.primaryColor || defs.primaryColor,
      join,
      cap,
      miterLimit: clampNum(s.miterLimit ?? defs.miterLimit, 1, 12),
      roundSegments: clampNum(s.roundSegments ?? defs.roundSegments, 4, 32),
    };
  }
  function clampNum(v, lo, hi) { v = +v; if (!Number.isFinite(v)) v = lo; return v < lo ? lo : (v > hi ? hi : v); }
}
