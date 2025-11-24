/*
 * ツール仕様
 * 概要: ツール管理や描画エンジンの共通基盤。
 * 入力: ツール実装から呼び出される内部API。
 * 出力: ツール生成やレンダリングに必要なデータ。
 * 操作: ツール登録・遅延処理・タイル描画などを内部で処理。
 */
/**
 * Deferred Commands（遅延コマンド）
 * - 入力中の描画を「コマンド」として記録し、VSync(rAF)で一括実行
 * - 記録順で合成（順序安定）
 * - AABBはコマンドごとに集約し、フレーム末に 1 回だけ無効化通知
 *
 * 想定運用：
 *   const view = canvas.getContext('2d');
 *   const eng  = makeDeferredCommands(view, { batchThresholdMs: 2, maxDelayFrames: 1 });
 *
 *   // ツール側：即時プレビューは octx に描く。確定は eng.queue(...) で登録。
 *   tool.onPointerMove(view, ev, eng) {
 *     // プレビュー (octx) は別経路で即時
 *     drawPreview(octx, ...);
 *     // 確定描画はコマンド化
 *     eng.queueCircle(ev.img.x, ev.img.y, s.brushSize/2, {
 *       fillStyle: s.primaryColor, composite: 'source-over', alpha: 1
 *     });
 *   }
 *
 *   // rAFタイミングで自動 flush（最大遅延 1 フレーム）
 *   // 必要なら手動で eng.flushNow()
 */
export function makeDeferredCommands(targetCtx, opts = {}) {
  const id = 'deferred-commands';

  // ========= 設定 =========
  const cfg = {
    batchThresholdMs: clampInt(opts.batchThresholdMs ?? 2, 0, 8), // 1〜2ms 推奨（rAF予約のデバウンス用）
    maxDelayFrames:  clampInt(opts.maxDelayFrames ?? 1, 1, 2),    // 最大 1 フレーム遅延
    onDirty: typeof opts.onDirty === 'function' ? opts.onDirty : null, // (rect) => {}
  };

  // ========= 状態 =========
  const queue = [];            // {fn, rect:{x,y,w,h}, order}
  let orderSeq = 0;            // 記録順の安定化
  let frameUnion = null;       // 当フレームの AABB 統合
  let rafToken = null;         // requestAnimationFrame id
  let debounceTimer = null;    // setTimeout で rAF 予約をまとめる
  let frameStamp = 0;          // 連番フレーム
  let lastFlushFrame = -1;

  // ストローク履歴連携（任意）
  let strokeAabb = null;

  // ========= 公開エンジンIF =========
  const eng = {
    id,
    // ツールと互換のためダミーAPIも用意（選択は無視）
    clearSelection() {},
    beginStrokeSnapshot() { strokeAabb = null; },
    commitStrokeSnapshot() { strokeAabb = null; },
    endStrokeSnapshot() { strokeAabb = null; },
    finishStrokeToHistory() { strokeAabb = null; },

    // 既存API互換（直接AABB通知したい場合）
    expandPendingRectByRect(x, y, w, h) { frameUnion = unionAabb(frameUnion, { x, y, w, h }); scheduleFlush(); },
    expandPendingRect(cx, cy, r) { this.expandPendingRectByRect(cx - r, cy - r, r * 2, r * 2); },

    // ========== コマンド記録 ==========

    /**
     * 任意コマンド登録
     * @param {(ctx:CanvasRenderingContext2D)=>void} fn 実行関数（副作用：ctxへ描く）
     * @param {{x:number,y:number,w:number,h:number}} rect AABB（必須）
     */
    queue(fn, rect) {
      if (!rect || !isFinite(rect.x) || !isFinite(rect.y) || !isFinite(rect.w) || !isFinite(rect.h)) return;
      queue.push({ fn, rect: { x: rect.x|0, y: rect.y|0, w: Math.ceil(rect.w), h: Math.ceil(rect.h) }, order: orderSeq++ });
      frameUnion = unionAabb(frameUnion, rect);
      strokeAabb = unionAabb(strokeAabb, rect);
      scheduleFlush();
    },

    /**
     * 代表的なスタンプ（円・プリマルチ前提の単色塗り）
     */
    queueCircle(cx, cy, r, opt = {}) {
      r = Math.max(0.5, r);
      const pad = 1;
      const rect = { x: Math.floor(cx - r - pad), y: Math.floor(cy - r - pad), w: Math.ceil(r * 2 + pad * 2), h: Math.ceil(r * 2 + pad * 2) };
      const fillStyle = opt.fillStyle || '#000';
      const alpha = clamp(opt.alpha ?? 1, 0, 1);
      const gco = opt.composite || 'source-over';

      this.queue((ctx) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = gco;
        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }, rect);
    },

    /**
     * テクスチャ描画（drawImage）
     * @param {CanvasImageSource} img
     * @param {number} dx
     * @param {number} dy
     * @param {number} dw
     * @param {number} dh
     * @param {object} [opt] {alpha, composite}
     */
    queueImage(img, dx, dy, dw, dh, opt = {}) {
      const alpha = clamp(opt.alpha ?? 1, 0, 1);
      const gco = opt.composite || 'source-over';
      this.queue((ctx) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = gco;
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.restore();
      }, { x: dx|0, y: dy|0, w: Math.ceil(dw), h: Math.ceil(dh) });
    },

    /**
     * パスのストローク（ラウンド端/結合）
     * @param {{x:number,y:number}[]} pts
     * @param {{width?:number, strokeStyle?:string, alpha?:number, composite?:GlobalCompositeOperation}} opt
     */
    queuePolylineStroke(pts, opt = {}) {
      if (!pts || pts.length < 2) return;
      const w = Math.max(1, opt.width || 1);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const pad = Math.ceil(w / 2 + 2);
      const rect = { x: Math.floor(minX - pad), y: Math.floor(minY - pad), w: Math.ceil((maxX - minX) + pad * 2), h: Math.ceil((maxY - minY) + pad * 2) };

      const strokeStyle = opt.strokeStyle || '#000';
      const alpha = clamp(opt.alpha ?? 1, 0, 1);
      const gco = opt.composite || 'source-over';
      this.queue((ctx) => {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = strokeStyle;
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = gco;
        ctx.lineWidth = w;
        ctx.beginPath();
        const off = w <= 1 ? 0.5 : 0; // 細線AA対策
        ctx.moveTo(pts[0].x + off, pts[0].y + off);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + off, pts[i].y + off);
        ctx.stroke();
        ctx.restore();
      }, rect);
    },

    // ========== フラッシュ制御 ==========
    flushNow() { flush(true); },
  };

  // ================== スケジューリング ==================
  function scheduleFlush() {
    // rAF 予約（デバウンス）
    if (debounceTimer == null && cfg.batchThresholdMs > 0) {
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (rafToken == null) rafToken = requestAnimationFrame(onRaf);
      }, cfg.batchThresholdMs);
    }
    // 安全側：rAF は常に 1 回は予約しておく（最大 1 フレーム遅延）
    if (rafToken == null) {
      rafToken = requestAnimationFrame(onRaf);
    }
  }

  function onRaf() {
    rafToken = null;
    frameStamp++;
    flush(false);
  }

  // 実行：記録順で一括
  function flush(force) {
    if (queue.length === 0 && !frameUnion) return;

    // 最大遅延 1 フレームを守るため、基本は rAF で全コマンド実行
    // （force=true のときは即時）
    const startLen = queue.length;

    if (startLen) {
      // 記録順で安定化（order 挿入順）
      queue.sort((a, b) => a.order - b.order);

      targetCtx.save();
      for (let i = 0; i < startLen; i++) {
        const cmd = queue[i];
        try { cmd.fn(targetCtx); } catch (_) {}
      }
      targetCtx.restore();

      // 消費
      queue.splice(0, startLen);
      lastFlushFrame = frameStamp;
    }

    // ダメージ反映（1回に集約）
    if (frameUnion) {
      cfg.onDirty?.(frameUnion);
      // onDirty が無い場合は何もしない（上位エンジンが無い純描画運用想定）
      frameUnion = null;
    }
  }

  // ================== ユーティリティ ==================
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { x: b.x|0, y: b.y|0, w: Math.ceil(b.w), h: Math.ceil(b.h) };
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clampInt(v, lo, hi) { v = v | 0; return v < lo ? lo : (v > hi ? hi : v); }

  return eng;
}
/* =======================================================================================
 * 参考ツール：Deferred・距離主導スタンプ
 * - プレビューは octx に即時描画
 * - 確定描画は eng.queueCircle(...) で記録 → rAF で一括実行
 * - AABB はエンジン側で集約（eng の onDirty 経由でタイルレンダラへ）
 * =======================================================================================
 */
export function makeDeferredDistanceStampBrush(store, deferred) {
  const id = 'deferred-distance-stamped';
  let drawing = false, last = null, acc = 0;

  const DEFAULTS = { brushSize: 14, spacingRatio: 0.5 };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(_ctx, ev) {
      drawing = true;
      last = { ...ev.img };
      acc = 0;

      const s = getState(store, id, DEFAULTS);
      deferred.beginStrokeSnapshot?.();
      deferred.queueCircle(last.x, last.y, s.brushSize / 2, { fillStyle: s.primaryColor, alpha: 1 });
    },

    onPointerMove(_ctx, ev) {
      if (!drawing || !last) return;
      const s = getState(store, id, DEFAULTS);
      const spacing = Math.max(1, s.spacingRatio * s.brushSize);

      let px = last.x, py = last.y;
      const qx = ev.img.x, qy = ev.img.y;
      let dx = qx - px, dy = qy - py;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) return;

      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;
        const nx = px + dx * t, ny = py + dy * t;
        deferred.queueCircle(nx, ny, s.brushSize / 2, { fillStyle: s.primaryColor, alpha: 1 });
        px = nx; py = ny;
        dx = qx - px; dy = qy - py;
        dist = Math.hypot(dx, dy);
        acc = 0;
      }
      acc += dist;
      last = { x: qx, y: qy };
    },

    onPointerUp(_ctx, ev) {
      if (!drawing) return;
      drawing = false;

      const s = getState(store, id, DEFAULTS);
      const spacing = Math.max(1, s.spacingRatio * s.brushSize);

      let px = last.x, py = last.y;
      const qx = ev.img.x, qy = ev.img.y;
      let dx = qx - px, dy = qy - py;
      let dist = Math.hypot(dx, dy);

      if (dist > 0) {
        while (acc + dist >= spacing) {
          const t = (spacing - acc) / dist;
          const nx = px + dx * t, ny = py + dy * t;
          deferred.queueCircle(nx, ny, s.brushSize / 2, { fillStyle: s.primaryColor, alpha: 1 });
          px = nx; py = ny;
          dx = qx - px; dy = qy - py;
          dist = Math.hypot(dx, dy);
          acc = 0;
        }
      }

      // 必要なら即時フラッシュ（通常は rAF に任せれば 1 フレーム遅延以内）
      deferred.flushNow?.();

      last = null; acc = 0;
      deferred.commitStrokeSnapshot?.();
    },

    drawPreview(octx) {
      // 必要なら octx で軽量プレビュー（省略可）
    },
  };

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clamp(Number(s.brushSize ?? defs.brushSize), 1, 256),
      spacingRatio: Number.isFinite(s.spacingRatio) ? s.spacingRatio : defs.spacingRatio,
      primaryColor: s.primaryColor || '#000',
    };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
}
