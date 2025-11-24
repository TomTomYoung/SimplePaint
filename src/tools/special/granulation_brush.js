// ツール仕様: 概要=表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。 入力=ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。 出力=質感や模様を含むストロークやスタンプ。 操作=左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
/**
 * Granulation（粒状化）
 * 顔料が「低流速」領域へ沈積して粒子感（ザラつき）を作る水彩系効果。
 * - 入力：距離主導のソフト円スタンプ（pigment キャンバスに蓄積）
 * - ステップ：拡散 → 流速（∥∇α∥）評価 → 低流速で沈積マップを加算 → 顔料色へ粒状減光を適用 → 表示
 * - 再描画通知：影響 AABB のみ（タイルレンダラと相性良）
 *
 * 注意：
 *  - 数値爆発を避けるため、D/E/沈積はクリップ＆正規化。
 *  - 粒径はノイズ周波数で表現（1/粒径 ≒ 空間周波数）。
 */
export function makeGranulationBrush(store) {
  const id = 'granulation';

  // ---- ランタイム状態 ----
  let drawing = false;
  let ctxRef = null, engRef = null;

  // 顔料バッファ（RGBA, sRGB想定）
  const pigmentCanvas = document.createElement('canvas');
  let pctx = pigmentCanvas.getContext('2d');

  // 沈積マップ（0..1 の Float32, 画素ごと）
  let depo = null, depoTmp = null;

  // ループ制御
  let running = false;
  let hasActivity = false;
  let dirtyRect = null;

  // 乱数シード（ストロークごと固定）
  let strokeSeed = 1;

  // 既定値
  const DEFAULTS = {
    brushSize: 18,
    primaryColor: '#2040ff',

    // 物理近似
    diffusion: 0.10,      // D（拡散） 0.05..0.2 程度
    evaporation: 0.015,   // E（乾燥） 0.01..0.03/step

    // 粒状化
    grainSize: 1.0,       // 粒径（px）0.5〜2.0
    depositRate: 0.02,    // 沈積率 0.01〜0.05/step
    flowTau: 0.05,        // 流速しきい（小）0.02〜0.08
    grainStrength: 0.35,  // 粒状による減光係数（0..1）

    // AABB
    pad: 3,               // 拡散/AA の余白
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      ensureBuffers(ctx);
      ctxRef = ctx; engRef = eng;
      drawing = true;
      strokeSeed = ((Math.random() * 0x7fffffff) | 0) ^ (Date.now() & 0x7fffffff);

      const s = getState(store, id, DEFAULTS);
      // 起点スタンプ
      stampPigment(ev.img.x, ev.img.y, s.brushSize, s.primaryColor);

      if (!running) {
        running = true;
        hasActivity = true;
        requestAnimationFrame(step);
      }
    },

    onPointerMove(_ctx, ev) {
      if (!drawing) return;
      const s = getState(store, id, DEFAULTS);
      stampPigment(ev.img.x, ev.img.y, s.brushSize, s.primaryColor);
    },

    onPointerUp() {
      drawing = false;
      // 顔料がなくなるまでランする（自然減衰）
    },

    drawPreview() {}, // プレビューは不要（確定系）
  };

  // ---- スタンプ：顔料を蓄積（ソフト円） ----
  function stampPigment(x, y, size, color) {
    pctx.save();
    pctx.fillStyle = color;
    pctx.beginPath();
    pctx.arc(x, y, Math.max(0.5, size / 2), 0, Math.PI * 2);
    pctx.fill();
    pctx.restore();

    const r = Math.max(1, Math.round(size / 2));
    const rect = {
      x: Math.floor(x - r - 2),
      y: Math.floor(y - r - 2),
      w: Math.ceil((r + 2) * 2),
      h: Math.ceil((r + 2) * 2),
    };
    dirtyRect = unionAabb(dirtyRect, rect);
    hasActivity = true;
  }

  // ---- シミュレーションステップ ----
  function step() {
    if (!ctxRef || !hasActivity) { running = false; return; }

    const s = getState(store, id, DEFAULTS);
    const W = pigmentCanvas.width, H = pigmentCanvas.height;

    const pad = Math.max(1, s.pad | 0);
    const rect = expandRect(dirtyRect || { x: 0, y: 0, w: W, h: H }, pad, W, H);

    // 1) 顔料の拡散＋乾燥（4近傍）
    const img = pctx.getImageData(rect.x, rect.y, rect.w, rect.h);
    const src = img.data;
    const out = new Uint8ClampedArray(src.length);

    const stride = rect.w * 4;
    let maxAlpha = 0;

    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const i = (y * rect.w + x) * 4;
        const xm = Math.max(0, x - 1), xp = Math.min(rect.w - 1, x + 1);
        const ym = Math.max(0, y - 1), yp = Math.min(rect.h - 1, y + 1);

        const iL = (y * rect.w + xm) * 4;
        const iR = (y * rect.w + xp) * 4;
        const iU = (ym * rect.w + x) * 4;
        const iD = (yp * rect.w + x) * 4;

        // 各色
        for (let c = 0; c < 3; c++) {
          const cC = src[i + c];
          const cL = src[iL + c], cR = src[iR + c], cU = src[iU + c], cD = src[iD + c];
          let v = cC + s.diffusion * (cL + cR + cU + cD - 4 * cC);
          v *= (1 - s.evaporation);
          out[i + c] = clampByte(v);
        }
        // α
        const aC = src[i + 3];
        const aL = src[iL + 3], aR = src[iR + 3], aU = src[iU + 3], aD = src[iD + 3];
        let a = aC + s.diffusion * (aL + aR + aU + aD - 4 * aC);
        a *= (1 - s.evaporation);
        maxAlpha = Math.max(maxAlpha, a);
        out[i + 3] = clampByte(a);
      }
    }

    img.data.set(out);
    pctx.putImageData(img, rect.x, rect.y);

    // 2) 低流速（|∇α| が小）で沈積を加算
    const freq = Math.max(0.25, 1 / clampNum(s.grainSize, 0.5, 2.0)); // 大粒ほど低周波
    const depRate = clampNum(s.depositRate, 0.001, 0.2);
    const tau = clampNum(s.flowTau, 0.005, 0.2);

    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const i = (y * rect.w + x) * 4;
        const xm = Math.max(0, x - 1), xp = Math.min(rect.w - 1, x + 1);
        const ym = Math.max(0, y - 1), yp = Math.min(rect.h - 1, y + 1);

        const iL = (y * rect.w + xm) * 4;
        const iR = (y * rect.w + xp) * 4;
        const iU = (ym * rect.w + x) * 4;
        const iD = (yp * rect.w + x) * 4;

        // 空間勾配（流速 proxy）
        const aL = out[iL + 3], aR = out[iR + 3], aU = out[iU + 3], aD = out[iD + 3];
        const dx = (aR - aL) * 0.5, dy = (aD - aU) * 0.5;
        const speed = Math.hypot(dx, dy) / 255; // 0..~1

        if (speed < tau) {
          const pig = out[i + 3] / 255;     // 顔料濃度 proxy
          if (pig <= 0) continue;

          const wx = rect.x + x, wy = rect.y + y;
          const cellX = Math.floor(wx * freq), cellY = Math.floor(wy * freq);
          const nz = hash2D(cellX, cellY, strokeSeed); // 0..1
          const gain = 0.75 + 0.5 * (nz - 0.5) * 2;    // 0.25..1.25

          const w = 1 - (speed / tau);                 // 低速ほど 1 に近い
          const inc = depRate * pig * clampNum(w, 0, 1) * clampNum(gain, 0.25, 1.25);

          const idx = (wy * W + wx) | 0;
          depo[idx] = Math.min(1, depo[idx] + inc);
        }
      }
    }

    // 3) 粒状による減光（顔料色 × (1 - strength * depo））
    const gk = clampNum(s.grainStrength, 0, 1);
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const i = (y * rect.w + x) * 4;
        const wx = rect.x + x, wy = rect.y + y;
        const idx = wy * W + wx;
        const shade = 1 - gk * clampNum(depo[idx], 0, 1);
        out[i]     = clampByte(out[i]     * shade);
        out[i + 1] = clampByte(out[i + 1] * shade);
        out[i + 2] = clampByte(out[i + 2] * shade);
        // αはそのまま（プリマルチ前提でないため）
      }
    }
    img.data.set(out);
    pctx.putImageData(img, rect.x, rect.y);

    // 4) 表示キャンバスへ反映（部分 blit）
    ctxRef.drawImage(
      pigmentCanvas,
      rect.x, rect.y, rect.w, rect.h,
      rect.x, rect.y, rect.w, rect.h
    );

    // 5) 再描画通知（影響タイルのみ）
    engRef?.expandPendingRectByRect?.(
      Math.floor(rect.x),
      Math.floor(rect.y),
      Math.ceil(rect.w),
      Math.ceil(rect.h)
    );

    // 6) 活動判定（顔料が十分薄くなったら停止）
    hasActivity = (maxAlpha > 1); // 1/255 を越える間は継続
    if (hasActivity) {
      requestAnimationFrame(step);
    } else {
      running = false;
      dirtyRect = null;
      engRef?.commitStrokeSnapshot?.();
    }
  }

  // ---- バッファ確保/更新 ----
  function ensureBuffers(ctx) {
    if (pigmentCanvas.width !== ctx.canvas.width || pigmentCanvas.height !== ctx.canvas.height) {
      pigmentCanvas.width = ctx.canvas.width;
      pigmentCanvas.height = ctx.canvas.height;
      pctx = pigmentCanvas.getContext('2d', { alpha: true });

      depo = new Float32Array(pigmentCanvas.width * pigmentCanvas.height);
      depoTmp = new Float32Array(pigmentCanvas.width * pigmentCanvas.height);

      dirtyRect = { x: 0, y: 0, w: pigmentCanvas.width, h: pigmentCanvas.height };
    }
  }

  // ---- Utils ----
  function expandRect(r, pad, W, H) {
    const x = Math.max(0, (r?.x ?? 0) - pad);
    const y = Math.max(0, (r?.y ?? 0) - pad);
    const w = Math.min(W - x, (r?.w ?? W) + pad * 2);
    const h = Math.min(H - y, (r?.h ?? H) + pad * 2);
    return { x, y, w, h };
  }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { x: b.x|0, y: b.y|0, w: Math.ceil(b.w), h: Math.ceil(b.h) };
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function clampByte(v) { return Math.max(0, Math.min(255, v | 0)); }
  function clampNum(v, lo, hi) { v = Number.isFinite(v) ? v : lo; return v < lo ? lo : (v > hi ? hi : v); }

  // 座標ハッシュノイズ（0..1, 粒径スケール済みセルに対して一定）
  function hash2D(ix, iy, seed) {
    // 整数座標 → 疑似乱数
    const k1 = 0x27d4eb2d, k2 = 0x165667b1;
    let n = (ix * k1) ^ (iy * k2) ^ (seed | 0);
    n = (n ^ (n >>> 15)) * 0x45d9f3b;
    n = (n ^ (n >>> 13)) * 0x45d9f3b;
    n = (n ^ (n >>> 15)) >>> 0;
    return (n & 0xffff) / 0xffff; // 0..1
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clampNum(Number(s.brushSize ?? defs.brushSize), 1, 256),
      primaryColor: s.primaryColor || defs.primaryColor,

      diffusion: clampNum(Number(s.diffusion ?? defs.diffusion), 0.01, 0.35),
      evaporation: clampNum(Number(s.evaporation ?? defs.evaporation), 0.005, 0.06),

      grainSize: clampNum(Number(s.grainSize ?? defs.grainSize), 0.5, 2.0),
      depositRate: clampNum(Number(s.depositRate ?? defs.depositRate), 0.005, 0.08),
      flowTau: clampNum(Number(s.flowTau ?? defs.flowTau), 0.01, 0.15),
      grainStrength: clampNum(Number(s.grainStrength ?? defs.grainStrength), 0, 1),

      pad: (s.pad ?? defs.pad) | 0,
    };
  }
}
