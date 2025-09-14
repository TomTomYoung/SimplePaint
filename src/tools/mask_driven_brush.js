/**
 * Mask-Driven（マスク駆動）
 * 選択範囲/透明マスク(0..1)を参照し、スタンプαを減衰して合成するブラシ。
 *
 * 使い方（状態パラメータ：store.getToolState('mask-driven')）:
 *   brushSize     : 8..64px（既定 18）
 *   primaryColor  : '#rrggbb'
 *   alpha         : 0..1（既定 1.0）
 *   spacingRatio  : Δs = spacingRatio * brushSize（既定 0.5）
 *   featherPx     : 2..8px（既定 4） … 合成マスクの境界をぼかす（分離ボックス近似）
 *   compose       : 'multiply' | 'min' | 'max'（既定 'multiply'）
 *   selectionMask : CanvasImageSource|null（先頭に適用）
 *   masks         : [{ source:CanvasImageSource, opacity?:0..1, invert?:bool, feather?:px, priority?:number, channel?:'alpha'|'luma' }]
 *   maskVersion   : number（マスク更新の通知用。増やすと再構築＆広域無効化）
 *
 * 再描画通知：
 *   - 通常時：スタンプAABBを統合
 *   - マスクが変わったと検知（maskVersion 変化 or 参照の変更）した場合は、キャンバス全体を1回無効化
 *
 * 注意：
 *   - マスクとキャンバスの解像度が異なる場合、内部でキャンバス解像度へリサンプル（バイリニア）
 *   - 合成は sRGB 直近似（高忠実度が必要なら線形合成に差し替え可）
 */
function makeMaskDrivenBrush(store) {
  const id = 'mask-driven';

  let drawing = false;
  let last = null;
  let acc = 0;
  let unionRect = null;

  // 合成済みマップのキャッシュ（キャンバス解像度）
  const maskCache = {
    keyHash: null,      // selection/masks の参照・versionから作るキー
    w: 0, h: 0,
    data: null,         // Float32Array (length = w*h), 0..1
  };

  const DEFAULTS = {
    brushSize: 18,
    primaryColor: '#000000',
    alpha: 1.0,
    spacingRatio: 0.5,
    featherPx: 4,
    compose: 'multiply', // 'multiply' | 'min' | 'max'
    selectionMask: null,
    masks: null,
    maskVersion: 0,
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      const s = getState(store, id, DEFAULTS);
      const changed = ensureMaskComposite(ctx, s);
      if (changed) {
        // マスク変更時は広域無効化（タイルレンダラがあればタイル集合に展開される想定）
        eng.expandPendingRectByRect?.(0, 0, ctx.canvas.width, ctx.canvas.height);
      }

      drawing = true;
      last = { ...ev.img };
      acc = 0;
      unionRect = null;

      stampMasked(ctx, last.x, last.y, s);
    },

    onPointerMove(ctx, ev) {
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
        stampMasked(ctx, nx, ny, s);
        px = nx; py = ny;
        dx = qx - px; dy = qy - py;
        dist = Math.hypot(dx, dy);
        acc = 0;
      }
      acc += dist;
      last = { x: qx, y: qy };
    },

    onPointerUp(_ctx, _ev, eng) {
      if (!drawing) return;
      drawing = false;
      last = null;
      acc = 0;

      if (unionRect) {
        eng.expandPendingRectByRect?.(unionRect.x, unionRect.y, unionRect.w, unionRect.h);
      }
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    // プレビュー：軽量の円枠のみ
    drawPreview(octx) {
      if (!drawing || !last) return;
      const s = getState(store, id, DEFAULTS);
      octx.save();
      octx.strokeStyle = '#00000044';
      octx.setLineDash([4, 4]);
      octx.lineWidth = 1;
      octx.beginPath();
      octx.arc(last.x + 0.5, last.y + 0.5, s.brushSize / 2, 0, Math.PI * 2);
      octx.stroke();
      octx.restore();
    },
  };

  // =============== スタンプ（マスク減衰 + 合成） ==========================
  function stampMasked(ctx, cx, cy, s) {
    const r = Math.max(0.5, s.brushSize / 2);
    const aa = 1.0;

    const minX = Math.floor(cx - r - aa);
    const minY = Math.floor(cy - r - aa);
    const maxX = Math.ceil(cx + r + aa);
    const maxY = Math.ceil(cy + r + aa);
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);

    let img;
    try {
      img = ctx.getImageData(minX, minY, w, h);
    } catch (_) {
      // セキュリティ制約等で取得不可→フォールバック（平均マスクで近似）
      const m = sampleMaskBilinear(cx, cy, ctx.canvas.width, ctx.canvas.height);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = clamp01(s.alpha * m);
      ctx.fillStyle = s.primaryColor;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      unionRect = unionAabb(unionRect, { x: minX, y: minY, w, h });
      return;
    }

    const data = img.data;
    const col = hexToRgb(s.primaryColor);

    // ピクセルループ：カバレッジ×マスクでα減衰 → sRGB 直近似の over 合成
    for (let y = 0; y < h; y++) {
      const py = minY + y + 0.5;
      for (let x = 0; x < w; x++) {
        const px = minX + x + 0.5;
        const d = Math.hypot(px - cx, py - cy);
        const t = (r + aa - d) / (aa * 2);
        if (t <= 0) continue;

        const cov = t >= 1 ? 1 : t * t * (3 - 2 * t);
        if (cov <= 0) continue;

        const m = sampleMaskBilinear(px, py, ctx.canvas.width, ctx.canvas.height);
        if (m <= 0) continue;

        const a = clamp01(s.alpha * cov * m);
        const inv = 1 - a;
        const idx = (y * w + x) * 4;

        data[idx + 0] = col.r * a + data[idx + 0] * inv;
        data[idx + 1] = col.g * a + data[idx + 1] * inv;
        data[idx + 2] = col.b * a + data[idx + 2] * inv;
        data[idx + 3] = 255 * a + data[idx + 3] * inv;
      }
    }

    ctx.putImageData(img, minX, minY);
    unionRect = unionAabb(unionRect, { x: minX, y: minY, w, h });
  }

  // =============== マスクの合成・キャッシュ ===============================

  function ensureMaskComposite(ctx, s) {
    const CW = ctx.canvas.width, CH = ctx.canvas.height;

    // キー：参照ハッシュ + feather/compose + サイズ + version
    const key = buildMaskKey(s, CW, CH);

    if (maskCache.keyHash === key && maskCache.data && maskCache.w === CW && maskCache.h === CH) {
      return false; // 変更なし
    }

    // 新規構築
    maskCache.keyHash = key;
    maskCache.w = CW; maskCache.h = CH;
    maskCache.data = composeMasksToCanvasSize(s, CW, CH);
    // フェザー（分離ボックス近似：半径 r を 3パス box に分解 → ここでは 2パス box に簡略化）
    const r = Math.max(0, Math.floor(s.featherPx || 0));
    if (r > 0) boxBlurFloat(maskCache.data, CW, CH, r);

    return true;
  }

  function buildMaskKey(s, W, H) {
    const parts = [
      'W' + W, 'H' + H,
      'F' + (s.featherPx|0),
      'C' + s.compose,
      'V' + (s.maskVersion|0),
      'S:' + (s.selectionMask ? (s.selectionMask.width||s.selectionMask.videoWidth||0) + 'x' + (s.selectionMask.height||s.selectionMask.videoHeight||0) : 'null')
    ];
    if (Array.isArray(s.masks)) {
      parts.push('M' + s.masks.length);
      for (let i = 0; i < s.masks.length; i++) {
        const m = s.masks[i] || {};
        parts.push((m.priority|0) + ':' + (m.invert?1:0) + ':' + (m.opacity ?? 1));
        parts.push('S'+((m.source && (m.source.width||m.source.videoWidth||0))||0)+'x'+((m.source && (m.source.height||m.source.videoHeight||0))||0));
        if (m.feather) parts.push('f'+(m.feather|0));
        if (m.channel) parts.push('ch'+m.channel);
      }
    }
    return parts.join('|');
  }

  function composeMasksToCanvasSize(s, CW, CH) {
    // 初期値
    const acc = new Float32Array(CW * CH);
    let initVal = 1;
    if (s.compose === 'max') initVal = 0;
    for (let i = 0; i < acc.length; i++) acc[i] = initVal;

    // マスク列（selectionMask を最初に）
    const list = [];
    if (s.selectionMask) {
      list.push({
        source: s.selectionMask, opacity: 1, invert: false,
        feather: 0, priority: -1, channel: 'alpha'
      });
    }
    if (Array.isArray(s.masks)) list.push(...s.masks);

    // 優先度でソート（min/max/multiply は順不同だが明示的に）
    list.sort((a, b) => ((a?.priority|0) - (b?.priority|0)));

    // 一時キャンバス
    const tmp = document.createElement('canvas');
    tmp.width = CW; tmp.height = CH;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });

    // 各マスクをキャンバス解像度へ引き伸ばして α/luma を抽出（0..1）
    for (const m of list) {
      if (!m || !m.source) continue;

      try {
        tctx.clearRect(0, 0, CW, CH);
        tctx.drawImage(m.source, 0, 0, CW, CH);
      } catch (_) {
        continue; // クロスオリジン等
      }
      const img = tctx.getImageData(0, 0, CW, CH).data;
      const op = clamp01(m.opacity ?? 1);
      const inv = !!m.invert;
      const ch = (m.channel === 'luma') ? 'luma' : 'alpha';

      // 必要なら個別フェザー（軽量：1回の box）
      let buf = null;
      if ((m.feather|0) > 0) {
        buf = new Float32Array(CW * CH);
      }

      for (let i = 0, j = 0; i < acc.length; i++, j += 4) {
        let v;
        if (ch === 'luma') {
          v = (0.2126 * img[j] + 0.7152 * img[j+1] + 0.0722 * img[j+2]) / 255;
        } else {
          v = img[j + 3] / 255; // alpha
        }
        if (inv) v = 1 - v;
        // 不透過度で線形補間（1→v）
        v = 1 + (v - 1) * op;
        if (buf) buf[i] = v;
        else applyCompose(acc, i, v, s.compose);
      }

      if (buf) {
        boxBlurFloat(buf, CW, CH, m.feather|0);
        for (let i = 0; i < acc.length; i++) applyCompose(acc, i, buf[i], s.compose);
      }
    }

    // クリップ
    for (let i = 0; i < acc.length; i++) {
      const v = acc[i];
      acc[i] = v < 0 ? 0 : (v > 1 ? 1 : v);
    }
    return acc;
  }

  function applyCompose(acc, i, v, mode) {
    if (mode === 'max') acc[i] = Math.max(acc[i], v);
    else if (mode === 'min') acc[i] = Math.min(acc[i], v);
    else acc[i] = acc[i] * v; // multiply
  }

  // バイリニアで合成マスクをサンプル（キャンバス座標）
  function sampleMaskBilinear(x, y, CW, CH) {
    const c = maskCache;
    if (!c.data || c.w !== CW || c.h !== CH) return 1; // マスクなし扱い

    const u = clamp(x, 0, CW - 1);
    const v = clamp(y, 0, CH - 1);
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const x1 = Math.min(CW - 1, x0 + 1);
    const y1 = Math.min(CH - 1, y0 + 1);
    const tx = u - x0, ty = v - y0;

    const i00 = y0 * CW + x0;
    const i10 = y0 * CW + x1;
    const i01 = y1 * CW + x0;
    const i11 = y1 * CW + x1;

    const a = c.data[i00] + (c.data[i10] - c.data[i00]) * tx;
    const b = c.data[i01] + (c.data[i11] - c.data[i01]) * tx;
    return a + (b - a) * ty;
  }

  // =============== ぼかし（分離ボックス簡易） =============================
  function boxBlurFloat(buf, W, H, r) {
    if (r <= 0) return;
    // 横方向
    const tmp = new Float32Array(W * H);
    const w = 2 * r + 1;
    for (let y = 0; y < H; y++) {
      let sum = 0;
      let i0 = y * W;
      for (let x = -r; x <= r; x++) sum += buf[i0 + clampInt(x, 0, W - 1)];
      for (let x = 0; x < W; x++) {
        tmp[i0 + x] = sum / w;
        const x_add = x + r + 1;
        const x_sub = x - r;
        sum += buf[i0 + clampInt(x_add, 0, W - 1)] - buf[i0 + clampInt(x_sub, 0, W - 1)];
      }
    }
    // 縦方向
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[clampInt(y, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        buf[y * W + x] = sum / w;
        const y_add = y + r + 1;
        const y_sub = y - r;
        sum += tmp[clampInt(y_add, 0, H - 1) * W + x] - tmp[clampInt(y_sub, 0, H - 1) * W + x];
      }
    }
  }

  // =============== Utils ====================================================
  function hexToRgb(hex) {
    const n = hex.startsWith('#') ? hex.slice(1) : hex;
    const v = parseInt(n.length === 3 ? n.replace(/(.)/g, '$1$1') : n, 16) >>> 0;
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function clampInt(v, lo, hi) { v = v | 0; return v < lo ? lo : (v > hi ? hi : v); }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { x: b.x|0, y: b.y|0, w: Math.ceil(b.w), h: Math.ceil(b.h) };
    const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    const compose = (s.compose === 'min' || s.compose === 'max') ? s.compose : 'multiply';
    return {
      brushSize:     clamp(s.brushSize ?? defs.brushSize, 1, 512),
      primaryColor:  s.primaryColor || defs.primaryColor,
      alpha:         clamp(s.alpha ?? defs.alpha, 0, 1),
      spacingRatio:  clamp(s.spacingRatio ?? defs.spacingRatio, 0.1, 2.0),
      featherPx:     clamp(s.featherPx ?? defs.featherPx, 0, 32),
      compose,
      selectionMask: s.selectionMask || null,
      masks:         Array.isArray(s.masks) ? s.masks : null,
      maskVersion:   (s.maskVersion|0) || 0,
    };
  }
}

window.makeMaskDrivenBrush = makeMaskDrivenBrush;
