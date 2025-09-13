//水彩
function makeWatercolor(store) {
  const id = 'watercolor';

  let drawing = false;
  let ctxRef = null;
  let engRef = null;

  // ウェット層と吸い取り用の一時キャンバス（自己描画を避ける）
  const wetCanvas = document.createElement('canvas');
  let wetCtx = wetCanvas.getContext('2d');
  const absorbCanvas = document.createElement('canvas');
  let absorbCtx = absorbCanvas.getContext('2d');

  let running = false;
  let hasWet = false;
  let snapshotOpen = false;

  function ensureCanvas(ctx) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (wetCanvas.width !== cw || wetCanvas.height !== ch) {
      wetCanvas.width = cw;
      wetCanvas.height = ch;
      wetCtx = wetCanvas.getContext('2d');
    }
    if (absorbCanvas.width !== cw || absorbCanvas.height !== ch) {
      absorbCanvas.width = cw;
      absorbCanvas.height = ch;
      absorbCtx = absorbCanvas.getContext('2d');
    }
  }

  function beginSnapshot(eng) {
    if (!snapshotOpen && typeof eng?.beginStrokeSnapshot === 'function') {
      eng.beginStrokeSnapshot();
      snapshotOpen = true;
    }
  }
  function endSnapshot(eng) {
    if (!snapshotOpen) return;
    if (typeof eng?.commitStrokeSnapshot === 'function') eng.commitStrokeSnapshot();
    else if (typeof eng?.finishStrokeToHistory === 'function') eng.finishStrokeToHistory();
    else if (typeof eng?.endStrokeSnapshot === 'function') eng.endStrokeSnapshot();
    snapshotOpen = false;
  }

  function stamp(x, y, size, color) {
    const r = Math.max((size || 0) / 2, 0);
    if (r <= 0) return;
    wetCtx.save();
    wetCtx.fillStyle = color || '#000';
    wetCtx.beginPath();
    wetCtx.arc(x, y, r, 0, Math.PI * 2);
    wetCtx.fill();
    wetCtx.restore();
    hasWet = true;
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function step() {
    // 何もなければ終了。スナップショットが残っていたら閉じる。
    if (!ctxRef || !hasWet) {
      running = false;
      endSnapshot(engRef);
      return;
    }

    // ツール設定の取得と安全域クランプ
    const st = store.getToolState(id) || {};
    let D = Number(st.diffusion ?? 0.1);
    let E = Number(st.evaporation ?? 0.02);
    const absorption = 0.05;

    if (!Number.isFinite(D)) D = 0.1;
    if (!Number.isFinite(E)) E = 0.02;
    // 明示陽解法の安定域にクリップ（目安）
    D = Math.max(0, Math.min(0.24, D));
    E = clamp01(E);

    const w = wetCanvas.width, h = wetCanvas.height;
    if (w === 0 || h === 0) { running = false; endSnapshot(engRef); return; }

    // 全面走査（必要なら将来タイル化）
    const img = wetCtx.getImageData(0, 0, w, h);
    const src = img.data; // Uint8Clamped
    const dst = new Uint8ClampedArray(src.length);

    let maxA = 0;

    // 5点ラプラシアン（境界はクランプ）
    for (let y = 0; y < h; y++) {
      const yUp = (y > 0 ? -w : 0) * 4;
      const yDn = (y < h - 1 ? w : 0) * 4;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const xLt = (x > 0 ? -1 : 0) * 4;
        const xRt = (x < w - 1 ? 1 : 0) * 4;

        // RGB と A を同様に拡散。A は蒸発も適用。
        for (let c = 0; c < 4; c++) {
          const center = src[idx + c];
          const up = src[idx + yUp + c];
          const down = src[idx + yDn + c];
          const left = src[idx + xLt + c];
          const right = src[idx + xRt + c];

          let val = center + D * (up + down + left + right - 4 * center);

          if (c === 3) { // Alpha
            val *= (1 - E);
            if (val > maxA) maxA = val;
          }

          // Uint8ClampedArray へセットするので最終は [0,255] にクリップ
          dst[idx + c] = val < 0 ? 0 : (val > 255 ? 255 : val);
        }
      }
    }

    img.data.set(dst);
    wetCtx.putImageData(img, 0, 0);

    // 吸収：メインへ転写（straight α前提）
    ctxRef.save();
    ctxRef.globalAlpha = absorption;
    ctxRef.globalCompositeOperation = 'source-over';
    ctxRef.drawImage(wetCanvas, 0, 0);
    ctxRef.restore();

    // ウェット層から同率だけ減算（自己描画は避ける：スナップショットコピーを使用）
    absorbCtx.clearRect(0, 0, w, h);
    absorbCtx.drawImage(wetCanvas, 0, 0); // snapshot
    wetCtx.save();
    wetCtx.globalCompositeOperation = 'destination-out';
    wetCtx.globalAlpha = absorption;
    wetCtx.drawImage(absorbCanvas, 0, 0);
    wetCtx.restore();

    // 失効領域（簡便に全面）
    engRef?.expandPendingRectByRect?.(0, 0, w, h);

    // 継続 or 終了
    // maxA は浮動小数。次フレームで 0 に落ちることを考慮し閾値で判断。
    if (maxA > 0.5) {
      requestAnimationFrame(step);
    } else {
      hasWet = false;
      running = false;
      endSnapshot(engRef);
    }
  }

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      ensureCanvas(ctx);
      ctxRef = ctx;
      engRef = eng;

      // 既に拡散中ならスナップショットは開かない（多重開始防止）
      if (!running) beginSnapshot(eng);

      drawing = true;
      const s = store.getToolState(id) || {};
      stamp(ev.img.x, ev.img.y, s.brushSize, s.primaryColor);

      if (!running) {
        running = true;
        requestAnimationFrame(step);
      }
    },

    onPointerMove(ctx, ev) {
      if (!drawing) return;
      const s = store.getToolState(id) || {};
      stamp(ev.img.x, ev.img.y, s.brushSize, s.primaryColor);
    },

    onPointerUp() {
      drawing = false;
      // 拡散・吸収は step() 側で継続／終了管理
    },

    drawPreview() {},
  };
}
