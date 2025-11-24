// ツール仕様: 概要=表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。 入力=ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。 出力=質感や模様を含むストロークやスタンプ。 操作=左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
export function makeSmudge(store) {
  const id = 'smudge';

  let drawing = false;
  let last = null;
  let acc = 0;            // 弧長の残距離（等間隔サンプリング用）
  let lastDir = { x: 1, y: 0 }; // 接線が取れない時のフォールバック

  const EPS = 1e-6;

  // 既定値
  const DEFAULTS = {
    radius: 16,          // 8〜24px 推奨（後でクランプ）
    strength: 0.5,       // k: 0.3〜0.8
    dirMode: 'tangent',  // 'tangent' | 'angle'
    angle: 0,            // 度（dirMode='angle'用）
    spacingRatio: 0.5,   // R に対するサンプル間隔倍率
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      drawing = true;
      last = { ...ev.img };
      acc = 0;

      // 方向フォールバック初期化
      lastDir = { x: 1, y: 0 };
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !last) return;

      const p = { ...ev.img };
      const s = getState(store, id, DEFAULTS);

      // 等間隔サンプリング
      let dx = p.x - last.x, dy = p.y - last.y;
      let dist = Math.hypot(dx, dy);
      if (dist < EPS) return;

      const spacing = Math.max(1, s.spacingRatio * s.radius);

      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;
        const cx = last.x + dx * t;
        const cy = last.y + dy * t;

        // 方向決定
        const dir = getDirection(s, dx, dy);
        if (dir.len > EPS) {
          lastDir = { x: dir.x, y: dir.y };
        }
        // スマッジ
        smudgeStamp(ctx, cx, cy, s, (dir.len > EPS) ? dir : lastDir);

        // 次
        last = { x: cx, y: cy };
        dx = p.x - last.x; dy = p.y - last.y;
        dist = Math.hypot(dx, dy);
        acc = 0;
        if (dist < EPS) break;
      }
      acc += dist;
      last = p;
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      const p = { ...ev.img };
      const s = getState(store, id, DEFAULTS);

      // 終点も念のため 1 回
      const dx = p.x - last.x, dy = p.y - last.y;
      const dir = getDirection(s, dx, dy);
      const useDir = (dir.len > EPS) ? dir : lastDir;
      smudgeStamp(ctx, p.x, p.y, s, useDir);

      // AABB 通知（1ステップ毎に十分広いAABBを用いているため、ここでは終点の円でもOK）
      const R = s.radius;
      if (eng.expandPendingRectByRect) {
        eng.expandPendingRectByRect(p.x - R * 2, p.y - R * 2, R * 4, R * 4); // 入出力両側を包含
      } else {
        eng.expandPendingRect?.(p.x, p.y, R * 2.828); // √2 * 2R の近似
      }

      last = null;
      acc = 0;
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview(octx) {
      // シンプルな軌跡プレビュー（標準様式）
      // 実際のスマッジは onMove 内で実行される
    },
  };

  // ===== スマッジ本体 =====
  // 中心 (cx,cy) に半径 R の円領域を取り、方向ベクトル dir に沿って
  // 画素を引き延ばす。s.strength (k) で lerp。
  function smudgeStamp(ctx, cx, cy, s, dir) {
    const R = Math.max(1, Math.min(64, Math.round(s.radius)));
    const k = clamp(s.strength, 0, 1);

    // 2R の外接AABB（サンプル元も含め安全側）
    const pad = 2 * R + 2;
    let bx = Math.floor(cx - pad);
    let by = Math.floor(cy - pad);
    let bw = Math.ceil(cx + pad) - bx;
    let bh = Math.ceil(cy + pad) - by;

    // キャンバスクリップ
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const clip = clipRectToCanvas(bx, by, bw, bh, cw, ch);
    if (!clip) return;
    bx = clip.x; by = clip.y; bw = clip.w; bh = clip.h;

    // 読み取り（source）と書き込みバッファ（dest）
    const img = ctx.getImageData(bx, by, bw, bh);
    const src = img.data; // 0..255
    const dst = new Uint8ClampedArray(src); // まずはコピー（同領域内での読み出し・書き込みの干渉を防ぐ）

    // 単位方向
    let vx = dir.x, vy = dir.y;
    const vlen = Math.hypot(vx, vy);
    if (vlen < EPS) { vx = 1; vy = 0; }
    else { vx /= vlen; vy /= vlen; }

    // オフセット（後ろから引っ張る）
    const offX = vx * R;
    const offY = vy * R;

    const cxLocal = cx - bx, cyLocal = cy - by;
    const R2 = R * R;

    // 画素処理
    for (let j = 0; j < bh; j++) {
      const py = j + 0.5;
      const dy = py - cyLocal;
      for (let i = 0; i < bw; i++) {
        const px = i + 0.5;
        const dx = px - cxLocal;
        if (dx * dx + dy * dy > R2) continue; // 円外はスキップ

        // サンプル元（円の内部でも「後方」から）
        const sx = px - offX;
        const sy = py - offY;

        // バイリニアで src をサンプル
        const sRGBA = sampleRGBA_bilinear(src, bw, bh, sx, sy);

        // 現在色
        const idx = (j * bw + i) * 4;
        const dR = dst[idx] / 255, dG = dst[idx + 1] / 255, dB = dst[idx + 2] / 255, dA = dst[idx + 3] / 255;

        // sRGB → Linear
        const dRL = srgbToLinear(dR), dGL = srgbToLinear(dG), dBL = srgbToLinear(dB);
        const sRL = srgbToLinear(sRGBA.r), sGL = srgbToLinear(sRGBA.g), sBL = srgbToLinear(sRGBA.b);

        // 単純 lerp（線形空間）：out = (1-k)*dst + k*src
        const outA = dA * (1 - k) + sRGBA.a * k;
        const outRL = dRL * (1 - k) + sRL * k;
        const outGL = dGL * (1 - k) + sGL * k;
        const outBL = dBL * (1 - k) + sBL * k;

        // Linear → sRGB
        dst[idx]     = linearToSrgb(outRL);
        dst[idx + 1] = linearToSrgb(outGL);
        dst[idx + 2] = linearToSrgb(outBL);
        dst[idx + 3] = Math.round(clamp(outA, 0, 1) * 255);
      }
    }

    // 書き戻し
    img.data.set(dst);
    ctx.putImageData(img, bx, by);
  }

  // ===== Direction helpers =====
  function getDirection(s, dx, dy) {
    if (s.dirMode === 'angle') {
      const th = (Number(s.angle) || 0) * Math.PI / 180;
      return { x: Math.cos(th), y: Math.sin(th), len: 1 };
    }
    const len = Math.hypot(dx, dy);
    if (len < EPS) return { x: 0, y: 0, len: 0 };
    return { x: dx / len, y: dy / len, len };
  }

  // ===== State / Utils =====
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      radius: clamp(Number(s.radius ?? s.brushSize ?? defs.radius), 1, 64),
      strength: clamp(Number(s.strength ?? defs.strength), 0, 1),
      dirMode: (s.dirMode === 'angle') ? 'angle' : 'tangent',
      angle: Number(s.angle ?? defs.angle) || 0,
      spacingRatio: Number.isFinite(s.spacingRatio) ? s.spacingRatio : defs.spacingRatio,
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function clipRectToCanvas(x, y, w, h, cw, ch) {
    let nx = x, ny = y, nw = w, nh = h;
    if (nx < 0) { nw += nx; nx = 0; }
    if (ny < 0) { nh += ny; ny = 0; }
    if (nx + nw > cw) nw = cw - nx;
    if (ny + nh > ch) nh = ch - ny;
    if (nw <= 0 || nh <= 0) return null;
    return { x: nx, y: ny, w: nw, h: nh };
  }

  // sRGB <-> Linear（0..1）
  function srgbToLinear(u) {
    if (u <= 0.04045) return u / 12.92;
    return Math.pow((u + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(v) {
    v = clamp(v, 0, 1);
    if (v <= 0.0031308) v = 12.92 * v;
    else v = 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(clamp(v, 0, 1) * 255);
  }

  // バイリニアサンプル（src: Uint8ClampedArray, 0..255）
  function sampleRGBA_bilinear(buf, w, h, x, y) {
    // クランプ（円内からのオフセットで 2R を確保しているため基本は範囲内）
    if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
    if (y < 0) y = 0; else if (y > h - 1) y = h - 1;

    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const tx = x - x0, ty = y - y0;

    const i00 = (y0 * w + x0) * 4;
    const i10 = (y0 * w + x1) * 4;
    const i01 = (y1 * w + x0) * 4;
    const i11 = (y1 * w + x1) * 4;

    // 0..1 に正規化
    const r00 = buf[i00] / 255, g00 = buf[i00 + 1] / 255, b00 = buf[i00 + 2] / 255, a00 = buf[i00 + 3] / 255;
    const r10 = buf[i10] / 255, g10 = buf[i10 + 1] / 255, b10 = buf[i10 + 2] / 255, a10 = buf[i10 + 3] / 255;
    const r01 = buf[i01] / 255, g01 = buf[i01 + 1] / 255, b01 = buf[i01 + 2] / 255, a01 = buf[i01 + 3] / 255;
    const r11 = buf[i11] / 255, g11 = buf[i11 + 1] / 255, b11 = buf[i11 + 2] / 255, a11 = buf[i11 + 3] / 255;

    // 線形補間（sRGB空間でのサンプル値だが、この段階では色空間は保持）
    const r0 = r00 * (1 - tx) + r10 * tx;
    const g0 = g00 * (1 - tx) + g10 * tx;
    const b0 = b00 * (1 - tx) + b10 * tx;
    const a0 = a00 * (1 - tx) + a10 * tx;

    const r1 = r01 * (1 - tx) + r11 * tx;
    const g1 = g01 * (1 - tx) + g11 * tx;
    const b1 = b01 * (1 - tx) + b11 * tx;
    const a1 = a01 * (1 - tx) + a11 * tx;

    return {
      r: r0 * (1 - ty) + r1 * ty,
      g: g0 * (1 - ty) + g1 * ty,
      b: b0 * (1 - ty) + b1 * ty,
      a: a0 * (1 - ty) + a1 * ty,
    };
  }
}
