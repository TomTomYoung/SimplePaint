/*
 * ツール仕様
 * 概要: ベクターパスの作成・編集ツール。
 * 入力: ポインタクリック/ドラッグ、修飾キー、必要に応じてキーボード確定操作。
 * 出力: ベクターレイヤー上のパスやアウトライン操作結果。
 * 操作: クリックで点やパスを追加、ドラッグで制御点調整、Enterで確定、Escでキャンセル。
 */
/**
 * Path Booleans（経路ブーリアン）v2
 * 複数パスの和/差/積で形状を合成し、結果を塗りとして確定描画。
 *
 * 方式：
 * - 入力で得た閉パスを state.paths に蓄積（各パスごとに op = union/subtract/intersect）
 * - 確定タイミングでオフスクリーンに順次コンポジット（Canvas の合成モード使用）
 *   ・union       : source-over で追加
 *   ・subtract    : destination-out で差し引き
 *   ・intersect   : destination-in で共通部分
 * - ラスタ方式なので数値ロバスト（自己交差・退化点に強い）
 *
 * 操作：
 * - store.getToolState('path-bool') の op が新規パスの演算子になる
 * - さらに修飾キーで一時切替（あれば）: Shift=union / Alt=subtract / Ctrl(or Meta)=intersect
 *
 * パラメータ（store.getToolState('path-bool')）：
 *   primaryColor : '#rrggbb'（既定 '#000'）
 *   alpha        : 0..1（既定 1）
 *   op           : 'union' | 'subtract' | 'intersect'（既定 'union'）
 *   epsilon      : 数値許容（点間引き/終端クローズ）既定 1e-6
 *   fillRule     : 'nonzero' | 'evenodd'（既定 'nonzero'）
 *   previewFill  : プレビュー塗りの可視化 true/false（既定 true）
 *   minSampleDist: 入力間引き px（既定 0.5）
 *
 * 再描画通知：
 *   - 追加/編集したパス群の AABB を統合し、余白（2px）を足して eng.expandPendingRectByRect
 *
 * 注意：
 *   - 本実装はベクタブーリアンではなくラスタ合成。高解像度キャンバスでの使用を推奨。
 *   - ベクタ輪郭が必要な場合は、別途「ベイク（輪郭追跡）」処理で抽出してください。
 */

export function makePathBooleans(store) {
  const id = 'path-bool';

  let drawing = false;
  let pts = [];
  let unionRect = null;

  // state.paths: [{points:[{x,y}], aabb:{minX,minY,maxX,maxY}, op:'union'|'subtract'|'intersect'}]
  function getStateObj() {
    const s = store.getToolState(id) || {};
    if (!Array.isArray(s.paths)) s.paths = [];
    store.setToolState(id, s);
    return s;
  }

  const DEFAULTS = {
    primaryColor: '#000000',
    alpha: 1.0,
    op: 'union',
    epsilon: 1e-6,
    fillRule: 'nonzero',
    previewFill: true,
    minSampleDist: 0.5,
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(_ctx, ev) {
      drawing = true;
      pts = [{ ...ev.img }];
      unionRect = null;
    },

    onPointerMove(_ctx, ev) {
      if (!drawing || pts.length === 0) return;
      const s = getState(store, id, DEFAULTS);
      const last = pts[pts.length - 1];
      const dx = ev.img.x - last.x, dy = ev.img.y - last.y;
      if (dx * dx + dy * dy < s.minSampleDist * s.minSampleDist) return;
      pts.push({ ...ev.img });
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      const s = getState(store, id, DEFAULTS);
      const poly = finalizePolygon(pts, s.epsilon);
      pts = [];

      if (!poly) return;

      // 演算子決定（修飾キー優先）
      const op = pickOp(ev, s.op);

      // パスを蓄積
      const st = getStateObj();
      st.paths.push({ points: poly.points, aabb: poly.aabb, op });
      store.setToolState(id, st);

      // 合成して確定描画
      const resRect = booleanRasterFill(ctx, st.paths, s);
      if (resRect) {
        eng.beginStrokeSnapshot?.();
        eng.expandPendingRectByRect?.(resRect.x, resRect.y, resRect.w, resRect.h);
        eng.commitStrokeSnapshot?.();
      }
    },

    // プレビュー：現在の pending パス輪郭＋（任意）暫定合成の薄い塗り
    drawPreview(octx) {
      const s = getState(store, id, DEFAULTS);
      const st = getStateObj();

      // 既存パスの輪郭（色別）
      for (const p of st.paths) {
        const col =
          p.op === 'subtract' ? '#ff0066' :
          p.op === 'intersect' ? '#00a0ff' : '#00aa55';
        drawOutline(octx, p.points, col, 1.5, [5, 4]);
      }

      // 入力中
      if (drawing && pts.length >= 2) {
        drawOutline(octx, pts, '#ffaa00', 1.5, [3, 3]);
      }

      // 軽いプレビュー塗り（負荷を抑えるため輪郭だけでもよい）
      if (s.previewFill && st.paths.length > 0) {
        // 小さめの offscreen を避け、直接 overlay へ半透明で塗る
        octx.save();
        octx.globalAlpha = 0.15;
        octx.fillStyle = s.primaryColor;
        // ざっくり union で見せる（正確な op でのプレビューが必要なら
        // 背景と別キャンバス合成が必要になるためコスト増）
        for (const p of st.paths) {
          path2D(octx, p.points, 0, 0);
          octx.fill(s.fillRule);
        }
        octx.restore();
      }
    },
  };

  // ========= 演算子選択（修飾キーで一時切替） =========
  function pickOp(ev, baseOp) {
    if (ev && (ev.ctrlKey || ev.metaKey)) return 'intersect';
    if (ev && ev.altKey) return 'subtract';
    if (ev && ev.shiftKey) return 'union';
    return (baseOp === 'subtract' || baseOp === 'intersect') ? baseOp : 'union';
  }

  // ========= 合成（オフスクリーン・ラスタ） =========
  function booleanRasterFill(ctx, paths, s) {
    if (!paths || paths.length === 0) return null;

    // AABB 統合（余白 2px）
    const pad = 2;
    let aabb = null;
    for (const p of paths) aabb = unionAabb(aabb, p.aabb);
    if (!aabb) return null;

    const minX = Math.floor(aabb.minX - pad);
    const minY = Math.floor(aabb.minY - pad);
    const maxX = Math.ceil(aabb.maxX + pad);
    const maxY = Math.ceil(aabb.maxY + pad);
    const W = Math.max(1, maxX - minX);
    const H = Math.max(1, maxY - minY);

    // offscreen へ合成
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const o = off.getContext('2d', { willReadFrequently: true });
    o.imageSmoothingEnabled = true;
    o.fillStyle = '#fff';
    o.globalCompositeOperation = 'source-over';

    // 先頭は source-over、それ以降は各 op で合成
    if (paths.length > 0) {
      // 1本目
      path2D(o, paths[0].points, -minX, -minY);
      o.fill(s.fillRule);
      // 2本目以降
      for (let i = 1; i < paths.length; i++) {
        const p = paths[i];
        o.globalCompositeOperation =
          p.op === 'subtract' ? 'destination-out' :
          p.op === 'intersect' ? 'destination-in' : 'source-over';
        path2D(o, p.points, -minX, -minY);
        o.fill(s.fillRule);
      }
    }

    // マスクに色乗せ（source-in）
    o.globalCompositeOperation = 'source-in';
    o.globalAlpha = clamp01(s.alpha);
    o.fillStyle = s.primaryColor;
    o.fillRect(0, 0, W, H);

    // 本体へ描画
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(off, minX, minY);
    ctx.restore();

    return { x: minX, y: minY, w: W, h: H };
  }

  // ========= パス確定：間引き・自動クローズ =========
  function finalizePolygon(points, eps = 1e-6) {
    if (!points || points.length < 3) return null;

    // ラジアル間引き
    const tol = Math.max(0.25, Math.sqrt(Math.max(1e-12, eps)) * 1e3);
    const pruned = simplify(points, tol);
    if (pruned.length < 3) return null;

    // 始終点が近ければクローズ
    const a = pruned[0], b = pruned[pruned.length - 1];
    const closeEps2 = Math.max(eps, 1e-6);
    if ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) > closeEps2) {
      pruned.push({ x: a.x, y: a.y });
    }

    // 直線上の冗長点除去
    const clean = collinearCull(pruned, 1e-3);

    // AABB
    let minX = +Infinity, minY = +Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of clean) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (!isFinite(minX)) return null;

    return { points: clean, aabb: { minX, minY, maxX, maxY } };
  }

  // ========= Preview / Draw helpers =========
  function drawOutline(octx, pts, stroke, width = 1, dash = null) {
    if (!pts || pts.length < 2) return;
    octx.save();
    octx.strokeStyle = stroke;
    octx.lineWidth = width;
    if (dash) octx.setLineDash(dash);
    octx.beginPath();
    octx.moveTo(pts[0].x + 0.5, pts[0].y + 0.5);
    for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x + 0.5, pts[i].y + 0.5);
    octx.stroke();
    octx.restore();
  }

  function path2D(ctx, pts, ox, oy) {
    ctx.beginPath();
    if (!pts || pts.length === 0) return;
    ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + ox, pts[i].y + oy);
    // 明示クローズ
    const s = pts[0], e = pts[pts.length - 1];
    if (Math.hypot(s.x - e.x, s.y - e.y) > 1e-4) ctx.closePath();
  }

  // ========= Geometry utils =========
  function simplify(points, tol = 0.25) {
    if (points.length < 3) return points.slice();
    const out = [points[0]];
    const tol2 = tol * tol;
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i], q = out[out.length - 1];
      const dx = p.x - q.x, dy = p.y - q.y;
      if (dx * dx + dy * dy >= tol2) out.push(p);
    }
    out.push(points[points.length - 1]);
    return out;
  }

  function collinearCull(pts, areaTol = 1e-3) {
    if (pts.length < 3) return pts.slice();
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
      const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      if (area2 > areaTol) out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { ...b };
    return {
      minX: Math.min(a.minX, b.minX),
      minY: Math.min(a.minY, b.minY),
      maxX: Math.max(a.maxX, b.maxX),
      maxY: Math.max(a.maxY, b.maxY),
    };
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    const op = (s.op === 'subtract' || s.op === 'intersect') ? s.op : 'union';
    const fr = (s.fillRule === 'evenodd') ? 'evenodd' : 'nonzero';
    return {
      primaryColor: s.primaryColor || defs.primaryColor,
      alpha: clamp01(s.alpha ?? defs.alpha),
      op,
      epsilon: Number.isFinite(s.epsilon) ? s.epsilon : defs.epsilon,
      fillRule: fr,
      previewFill: s.previewFill !== undefined ? !!s.previewFill : defs.previewFill,
      minSampleDist: clampNum(s.minSampleDist ?? defs.minSampleDist, 0.1, 5.0),
    };
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function clampNum(v, lo, hi) { v = +v; if (!Number.isFinite(v)) v = lo; return v < lo ? lo : (v > hi ? hi : v); }
}
