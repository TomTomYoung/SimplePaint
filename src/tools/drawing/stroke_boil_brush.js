// ツール仕様: 概要=ストローク系の描画ツール群。筆圧や速度に応じてピクセルを塗布し、形状や質感を変化させます。 入力=ペン/マウスのポインタイベント、筆圧や速度、Shiftなどの修飾キー。 出力=ラスターレイヤー上の筆跡や効果付きストローク。 操作=左ドラッグで描画開始→移動でストローク更新→離して確定。右クリックやスポイト機能がある場合は色取得に使用。
/**
 * Stroke Boil（微揺らぎ）
 * アニメの“ゆらぎ”をフレームごとに付与するベクタ保持型ブラシ。
 *
 * 仕組み
 * - ラフは「ベクタ（点列）」として store に保持（ラスタへ直描きしない）
 * - drawPreview(octx) で毎フレーム、点列を微小ノイズで変位＋幅揺らぎして描画
 * - 内部ループが AABB を invalidation 通知 → ホストがプレビューを再描画
 *
 * パラメータ（store.getToolState('stroke-boil')）
 *   brushSize     : 基準幅 px（既定 12）
 *   primaryColor  : '#rrggbb'
 *   color         : 同上（primaryColor を使用）
 *   alpha         : 0.3..1（既定 1）
 *   amplitude     : 0.5..1.5（px, 既定 1.0）… 頂点揺らぎの振幅
 *   widthJitter   : 0..0.35（既定 0.15）… 幅の±揺らぎ比率
 *   boilStep      : 1|2（既定 1）… フレーム更新間隔（1:毎フレ/2:隔フレ）
 *   spacingRatio  : Δs = spacingRatio * brushSize（既定 0.5, 入力中の間引き用）
 *   minSampleDist : 0.5（px, 入力間引き）
 *   seedBase      : 32bit 整数（既定: ランダム）
 *
 * 再描画通知
 *   - 常時：既存ストロークの拡張AABB（ベースAABB + 振幅 + 幅/2 + 2）を毎フレーム通知
 *   - 入力中：現在パスのAABBも逐次通知
 *
 * 注意
 *   - これは「プレビュー層」にのみ描く設計。最終フラット化が必要なら、別の「ベイク」処理で
 *     strokes を確定ラスタライズしてください（本ツールは行いません）。
 */
export function makeStrokeBoilBrush(store) {
  const id = 'stroke-boil';

  let drawing = false;
  let pts = [];           // 入力中の生点列
  let engRef = null;      // invalidation 用参照
  let running = false;    // RAF ループ
  let lastUnion = null;   // 前フレームに通知したAABB（必要なら差分最適化に利用可）

  // ストロークレコードは store 側に保持
  // { id, points:[{x,y}], color, width, alpha, seed, aabb:{minX,minY,maxX,maxY} }
  function getStrokes() {
    const s = store.getToolState(id) || {};
    if (!Array.isArray(s.strokes)) s.strokes = [];
    if (s.nextId == null) s.nextId = 1;
    if (s.seedBase == null) s.seedBase = (Math.random() * 0x7fffffff) | 0;
    store.setToolState(id, s);
    return s.strokes;
  }

  const DEFAULTS = {
    brushSize: 12,
    primaryColor: '#000000',
    alpha: 1.0,
    amplitude: 1.0,
    widthJitter: 0.15,
    boilStep: 1,           // 1:毎フレ / 2:隔フレ
    spacingRatio: 0.5,
    minSampleDist: 0.5,
    seedBase: (Math.random() * 0x7fffffff) | 0,
  };

  // ============================ Public API ============================

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(_ctx, ev, eng) {
      eng.clearSelection?.();
      engRef = eng;

      drawing = true;
      pts = [{ ...ev.img }];
      // 入力開始時にもプレビュー更新領域を通知
      const s = getState(store, id, DEFAULTS);
      const pad = Math.ceil(s.brushSize / 2 + s.amplitude + 2);
      eng.expandPendingRectByRect?.(ev.img.x - pad, ev.img.y - pad, pad * 2, pad * 2);

      ensureLoop(); // ループ起動（未起動なら）
    },

    onPointerMove(_ctx, ev, eng) {
      if (!drawing || pts.length === 0) return;
      const s = getState(store, id, DEFAULTS);
      const last = pts[pts.length - 1];
      const dx = ev.img.x - last.x, dy = ev.img.y - last.y;
      if (dx * dx + dy * dy < s.minSampleDist * s.minSampleDist) return;
      pts.push({ ...ev.img });

      // 入力中プレビューAABBを広めに通知
      const pad = Math.ceil(s.brushSize / 2 + s.amplitude + 2);
      eng.expandPendingRectByRect?.(
        Math.min(last.x, ev.img.x) - pad,
        Math.min(last.y, ev.img.y) - pad,
        Math.abs(ev.img.x - last.x) + pad * 2,
        Math.abs(ev.img.y - last.y) + pad * 2
      );
    },

    onPointerUp(_ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      if (pts.length >= 2) {
        const s = getState(store, id, DEFAULTS);
        const strokes = getStrokes();
        const toolState = store.getToolState(id);

        const strokeId = toolState.nextId++ | 0;
        const seed = (toolState.seedBase | 0) ^ (strokeId * 0x9e3779b1);
        const aabb = aabbOfPoints(pts);

        strokes.push({
          id: strokeId,
          points: resampleByDist(pts, Math.max(1, s.brushSize * 0.5)), // 均一化して揺らぎを安定
          color: s.primaryColor,
          width: s.brushSize,
          alpha: s.alpha,
          seed,
          aabb
        });
        store.setToolState(id, { ...toolState, strokes });

        // 確定ストローク領域を広めに通知
        const ex = expandAabb(aabb, s.brushSize / 2 + s.amplitude + 2);
        eng.expandPendingRectByRect?.(ex.x, ex.y, ex.w, ex.h);
      }

      pts = [];
      engRef = eng;
      ensureLoop();
    },

    // 毎フレーム：全ストローク＋入力中のパスを「揺らぎ付き」でプレビュー層に描画
    drawPreview(octx) {
      const s = getState(store, id, DEFAULTS);

      // 参照フレームID（VSync単位）。boilStep=2 のときは隔フレで状態が変わる。
      const now = performance.now();
      const frame = Math.floor(now / 16.6667);
      const fgrp = Math.floor(frame / Math.max(1, s.boilStep));

      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';

      // 既存ストローク
      const strokes = getStrokes();
      for (let k = 0; k < strokes.length; k++) {
        const st = strokes[k];
        drawBoilPolyline(octx, st.points, st.color || s.primaryColor, st.alpha ?? s.alpha,
                         st.width || s.brushSize, s, st.seed, fgrp);
      }
      // 入力中パス（色/幅は現設定）
      if (drawing && pts.length >= 2) {
        drawBoilPolyline(octx, pts, s.primaryColor, s.alpha, s.brushSize, s,
                         // 入力中は仮seed
                         (s.seedBase|0) ^ 0x1234abcd, fgrp);
      }
      octx.restore();
    },
  };

  // ============================ Draw Impl ============================

  function drawBoilPolyline(ctx, points, color, alpha, baseW, s, seed, fgrp) {
    if (!points || points.length < 2) return;

    // 事前に接線・法線を求める
    const N = points.length;
    const tang = new Array(N);
    const norm = new Array(N);
    for (let i = 0; i < N; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[Math.min(N - 1, i + 1)];
      let tx = p1.x - p0.x, ty = p1.y - p0.y;
      const L = Math.hypot(tx, ty) || 1;
      tx /= L; ty /= L;
      tang[i] = { x: tx, y: ty };
      norm[i] = { x: -ty, y: tx };
    }

    // 端点ごとに位置揺らぎ＆幅揺らぎを与えた座標列を作成
    const amp = s.amplitude;
    const wj = s.widthJitter;
    const jittered = new Array(N);
    const widthSeg = new Array(N);

    for (let i = 0; i < N; i++) {
      // シード：strokeSeed ^ (fgrp<<16) ^ i
      const h = hash32(seed ^ (fgrp * 0x9e3779b1) ^ i);
      // [-1,1] ノイズ2成分（位相違い）
      const n1 = (hashFloat(h) * 2 - 1);
      const n2 = (hashFloat(h ^ 0x68bc21eb) * 2 - 1);

      const dn = amp * n1;                         // 法線方向の変位（主）
      const dt = (amp * 0.35) * n2;                // 接線方向は弱め
      const jx = norm[i].x * dn + tang[i].x * dt;
      const jy = norm[i].y * dn + tang[i].y * dt;

      jittered[i] = { x: points[i].x + jx, y: points[i].y + jy };

      // 幅揺らぎ（±wj）
      const nw = (hashFloat(h ^ 0x2c1b3c6d) * 2 - 1);
      widthSeg[i] = baseW * (1 + wj * nw);
    }

    // 短いセグメントごとに stroke（lineWidth をセグメント平均で更新）
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;

    const off = baseW <= 1.0 ? 0.5 : 0.0; // 1px 線のキレ補正
    for (let i = 0; i < N - 1; i++) {
      const p0 = jittered[i], p1 = jittered[i + 1];
      const w = Math.max(0.5, (widthSeg[i] + widthSeg[i + 1]) * 0.5);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(p0.x + off, p0.y + off);
      ctx.lineTo(p1.x + off, p1.y + off);
      ctx.stroke();
    }
  }

  // ============================ Runner ============================

  function ensureLoop() {
    if (running) return;
    running = true;
    requestAnimationFrame(step);
  }

  function step() {
    // ストロークが無い・入力も無ければ停止
    const hasSomething = drawing || (getStrokes().length > 0);
    if (!hasSomething) { running = false; return; }

    // AABB を広めに集約して invalidation
    if (engRef && engRef.expandPendingRectByRect) {
      const s = getState(store, id, DEFAULTS);
      const strokes = getStrokes();
      let uni = null;

      for (let i = 0; i < strokes.length; i++) {
        const ex = expandAabb(strokes[i].aabb, s.brushSize / 2 + s.amplitude + 2);
        uni = unionAabb(uni, rectToAabb(ex));
      }
      if (drawing && pts.length > 0) {
        const a = aabbOfPoints(pts);
        const ex = expandAabb(a, s.brushSize / 2 + s.amplitude + 2);
        uni = unionAabb(uni, rectToAabb(ex));
      }

      if (uni) engRef.expandPendingRectByRect(uni.minX, uni.minY, uni.maxX - uni.minX, uni.maxY - uni.minY);
      lastUnion = uni;
    }

    requestAnimationFrame(step);
  }

  // ============================ Utils ============================

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize:     clampNum(s.brushSize ?? defs.brushSize, 1, 256),
      primaryColor:  s.primaryColor || defs.primaryColor || s.color || '#000',
      alpha:         clampNum(s.alpha ?? defs.alpha, 0.1, 1.0),
      amplitude:     clampNum(s.amplitude ?? defs.amplitude, 0, 4),
      widthJitter:   clampNum(s.widthJitter ?? defs.widthJitter, 0, 0.5),
      boilStep:      (s.boilStep === 2 ? 2 : 1),
      spacingRatio:  clampNum(s.spacingRatio ?? defs.spacingRatio, 0.1, 2.0),
      minSampleDist: clampNum(s.minSampleDist ?? defs.minSampleDist, 0.1, 4.0),
      seedBase:      (s.seedBase ?? defs.seedBase) | 0,
    };
  }

  function resampleByDist(points, ds) {
    if (!points || points.length < 2) return points || [];
    const out = [points[0]];
    let prev = points[0];
    let acc = 0;
    for (let i = 1; i < points.length; i++) {
      let curr = points[i];
      let seg = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      if (seg === 0) continue;
      while (acc + seg >= ds) {
        const t = (ds - acc) / seg;
        const nx = prev.x + (curr.x - prev.x) * t;
        const ny = prev.y + (curr.y - prev.y) * t;
        out.push({ x: nx, y: ny });
        prev = { x: nx, y: ny };
        seg = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        acc = 0;
      }
      acc += seg;
      prev = curr;
    }
    if (out.length < 2) out.push(points[points.length - 1]);
    return out;
  }

  function aabbOfPoints(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (!isFinite(minX)) minX = minY = maxX = maxY = 0;
    return { minX, minY, maxX, maxY };
  }
  function expandAabb(a, pad) {
    return { x: Math.floor(a.minX - pad), y: Math.floor(a.minY - pad),
             w: Math.ceil((a.maxX - a.minX) + pad * 2), h: Math.ceil((a.maxY - a.minY) + pad * 2) };
  }
  function rectToAabb(r){ return { minX:r.x, minY:r.y, maxX:r.x+r.w, maxY:r.y+r.h }; }
  function unionAabb(a,b){
    if(!b) return a || null;
    if(!a) return { ...b };
    return { minX: Math.min(a.minX,b.minX), minY: Math.min(a.minY,b.minY),
             maxX: Math.max(a.maxX,b.maxX), maxY: Math.max(a.maxY,b.maxY) };
  }

  // 32bit ハッシュ & 0..1 乱数
  function hash32(x) {
    x |= 0; x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16; return x >>> 0;
  }
  function hashFloat(h){ return (h >>> 8) / 0x01000000; } // [0,1)

  function clampNum(v, lo, hi) { v = +v; if (!Number.isFinite(v)) v = lo; return v < lo ? lo : (v > hi ? hi : v); }
}
