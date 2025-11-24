/*
 * ツール仕様
 * 概要: ツール管理や描画エンジンの共通基盤。
 * 入力: ツール実装から呼び出される内部API。
 * 出力: ツール生成やレンダリングに必要なデータ。
 * 操作: ツール登録・遅延処理・タイル描画などを内部で処理。
 */
/**
 * Tile-Based Renderer（タイル再描画）
 * 画面をタイル分割し、expandPendingRect... で集めたダメージだけを
 * バックバッファ → 表示キャンバスへタイル単位でブリットします。
 *
 * 既存ツールは ctx に対して直接描画し、描画範囲を eng.expandPendingRectByRect(...) で通知してください。
 * 本エンジンは rAF で 1 フレームに統合して該当タイルのみを表示側へ反映します。
 */
export function makeTileRenderer(viewCanvas, opts = {}) {
  const id = 'tile-renderer';

  // ===== 表示 / バック（描画先） =====
  const viewCtx = viewCanvas.getContext('2d', { alpha: true });
  const backCanvas = document.createElement('canvas');
  backCanvas.width = viewCanvas.width;
  backCanvas.height = viewCanvas.height;
  const ctx = backCanvas.getContext('2d', { alpha: true });
  if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = true;

  // ===== タイル設定 =====
  let tileSize = clampInt(opts.tileSize ?? 192, 64, 1024); // 128〜256 推奨、中庸は 192
  let overlapPad = clampInt(opts.overlapPad ?? 24, 0, 256); // 「w + AA 幅」を想定した余白
  let cols = Math.ceil(backCanvas.width / tileSize);
  let rows = Math.ceil(backCanvas.height / tileSize);

  // ===== ダメージ管理 =====
  const dirtyTiles = new Set();      // "x,y" 文字列の集合
  let strokeAabb = null;             // ストローク単位のAABB（履歴用）
  let rafToken = null;

  // ===== 履歴 / スナップショット（簡易） =====
  let snapshot = null;               // {rect: {x,y,w,h}, data: ImageData}（必要なら拡張）
  const historyCallback = opts.onCommitStroke || null;

  // ===== 公開インターフェース（ツールから使う想定） =====
  const eng = {
    id,
    // ツールへ渡す描画先（既存様式）
    get ctx() { return ctx; },

    // 選択などのUIクリアが必要ならここに（今は no-op）
    clearSelection() {},

    // --- ダメージ通知（矩形 / 円） ---------------------------------------
    expandPendingRectByRect(x, y, w, h) {
      // AABB をタイル集合にマップ
      const rx = Math.floor(x - overlapPad);
      const ry = Math.floor(y - overlapPad);
      const rw = Math.ceil(w + overlapPad * 2);
      const rh = Math.ceil(h + overlapPad * 2);
      markTiles(rx, ry, rw, rh);
      strokeAabb = unionAabb(strokeAabb, { x: Math.floor(x), y: Math.floor(y), w: Math.ceil(w), h: Math.ceil(h) });
      scheduleFlush();
    },
    expandPendingRect(cx, cy, r) {
      const x = cx - r, y = cy - r, w = r * 2, h = r * 2;
      this.expandPendingRectByRect(x, y, w, h);
    },

    // --- スナップショット（簡易） -----------------------------------------
    beginStrokeSnapshot() {
      snapshot = null; // 必要ならここで差分用の領域を押さえる
    },
    commitStrokeSnapshot() {
      if (historyCallback && strokeAabb) {
        try { historyCallback(strokeAabb); } catch (_) {}
      }
      snapshot = null;
      strokeAabb = null;
    },
    endStrokeSnapshot() { this.commitStrokeSnapshot(); },
    finishStrokeToHistory() { this.commitStrokeSnapshot(); },

    // --- フレーム制御 ------------------------------------------------------
    flushNow() { flushTiles(); },
    resize(width, height) {
      // バックバッファを保持したい場合は一時退避 → 再描画コールバックで復元する設計に
      const prevBack = document.createElement('canvas');
      prevBack.width = backCanvas.width; prevBack.height = backCanvas.height;
      const pctx = prevBack.getContext('2d');
      pctx.drawImage(backCanvas, 0, 0);

      viewCanvas.width = width; viewCanvas.height = height;
      backCanvas.width = width; backCanvas.height = height;
      cols = Math.ceil(width / tileSize);
      rows = Math.ceil(height / tileSize);

      // 旧内容をコピー
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(prevBack, 0, 0);

      // 全面をダーティに
      markTiles(0, 0, width, height);
      scheduleFlush();
    },

    // --- タイル設定 --------------------------------------------------------
    setTileSize(size) {
      tileSize = clampInt(size, 64, 1024);
      cols = Math.ceil(backCanvas.width / tileSize);
      rows = Math.ceil(backCanvas.height / tileSize);
    },
    setOverlapPad(padPx) { overlapPad = clampInt(padPx, 0, 256); },

    // --- デバッグ ----------------------------------------------------------
    debugDrawGrid(show = true) {
      if (!show) return;
      viewCtx.save();
      viewCtx.strokeStyle = 'rgba(0,0,0,0.15)';
      for (let i = 1; i < cols; i++) {
        const x = i * tileSize + 0.5;
        viewCtx.beginPath(); viewCtx.moveTo(x, 0); viewCtx.lineTo(x, viewCanvas.height); viewCtx.stroke();
      }
      for (let j = 1; j < rows; j++) {
        const y = j * tileSize + 0.5;
        viewCtx.beginPath(); viewCtx.moveTo(0, y); viewCtx.lineTo(viewCanvas.width, y); viewCtx.stroke();
      }
      viewCtx.restore();
    },
  };

  // ====== 内部：タイル反映 =================================================
  function scheduleFlush() {
    if (rafToken != null) return;
    rafToken = requestAnimationFrame(() => {
      rafToken = null;
      flushTiles();
    });
  }

  function flushTiles() {
    if (dirtyTiles.size === 0) return;

    // タイル単位で合成（back → view）
    viewCtx.save();
    for (const key of dirtyTiles) {
      const [ix, iy] = key.split(',').map(n => parseInt(n, 10));
      const rect = tileRect(ix, iy);
      if (!rect) continue;

      // 境界アーティファクトを避けるため、タイルを overlapPad 分だけ膨らませてブリット
      const ex = Math.max(0, rect.x - overlapPad);
      const ey = Math.max(0, rect.y - overlapPad);
      const ew = Math.min(backCanvas.width - ex, rect.w + overlapPad * 2);
      const eh = Math.min(backCanvas.height - ey, rect.h + overlapPad * 2);

      // クリップしてから等倍ブリット
      viewCtx.save();
      viewCtx.beginPath();
      viewCtx.rect(rect.x, rect.y, rect.w, rect.h);
      viewCtx.clip();
      viewCtx.drawImage(backCanvas, ex, ey, ew, eh, ex, ey, ew, eh);
      viewCtx.restore();
    }
    viewCtx.restore();

    dirtyTiles.clear();
  }

  function markTiles(x, y, w, h) {
    // x..x+w, y..y+h に重なるタイルをセットに追加
    const minI = clampInt(Math.floor(x / tileSize), 0, cols - 1);
    const maxI = clampInt(Math.floor((x + Math.max(0, w - 1)) / tileSize), 0, cols - 1);
    const minJ = clampInt(Math.floor(y / tileSize), 0, rows - 1);
    const maxJ = clampInt(Math.floor((y + Math.max(0, h - 1)) / tileSize), 0, rows - 1);
    for (let j = minJ; j <= maxJ; j++) {
      for (let i = minI; i <= maxI; i++) {
        dirtyTiles.add(i + ',' + j);
      }
    }
  }

  function tileRect(i, j) {
    if (i < 0 || j < 0 || i >= cols || j >= rows) return null;
    const x = i * tileSize;
    const y = j * tileSize;
    const w = Math.min(tileSize, backCanvas.width - x);
    const h = Math.min(tileSize, backCanvas.height - y);
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h };
  }

  // ====== 便利ユーティリティ ==============================================
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { ...b };
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function clampInt(v, lo, hi) { v = v | 0; return v < lo ? lo : (v > hi ? hi : v); }

  return eng;
}

// ---- 参考：既存ツールとの接続例 -------------------------------------------
// const eng = makeTileRenderer(canvas, { tileSize: 192, overlapPad: 24 });
// const tool = makeSomeBrush(store); // 既存のブラシ
// // onPointerDown:
// tool.onPointerDown(eng.ctx, ev, eng); // ctx はバックバッファ
// // onPointerMove:
// tool.onPointerMove(eng.ctx, ev, eng);
// // onPointerUp:
// tool.onPointerUp(eng.ctx, ev, eng);
// // rAF により必要タイルだけが表示キャンバスへ反映される
