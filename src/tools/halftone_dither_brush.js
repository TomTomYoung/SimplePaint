/**
 * Halftone / Dither（網点）
 * 局所輝度から網点（丸ドット）サイズ/密度を決めて配置するブラシ。
 * - 既存画像の局所輝度を参照（useSourceLuma=true）し、暗部ほどドットが大きくなる
 * - 閾値は Bayer(8x8/16x16) または簡易 Blue-noise（座標ハッシュ）から選択
 * - ドットは回転スクリーン(angleDeg)とピッチ(pitch)で配置。モアレ抑制に jitter を付与
 *
 * store.getToolState('halftone-dither') 主パラメータ（初期値は getState 参照）:
 *   brushSize    : スタンプ半径の目安（px）
 *   primaryColor : ドット色
 *   opacity      : 合成不透明度
 *   dotDiameter  : ドット最大径（2..6px）
 *   pitch        : ドット間隔（px, 周波数の逆数）。未指定時は dotDiameter*2
 *   angleDeg     : スクリーン角度（度, 版ズレ/モアレ緩和に有効）
 *   matrixKind   : 'bayer' | 'blue'
 *   matrixSize   : 8 | 16  （bayer のみ）
 *   useSourceLuma: true で下地の輝度を使用。false は一定（=primaryColor の輝度）
 *   jitter       : 配置/半径ジッタ係数（0..0.5 推奨 0.15）
 */
export function makeHalftoneDitherBrush(store) {
  const id = 'halftone-dither';

  let drawing = false;
  let last = null;
  let acc = 0;
  let unionRect = null;
  let strokeSeed = 1;

  const DEFAULTS = {
    brushSize: 24,
    primaryColor: '#000000',
    opacity: 1.0,

    dotDiameter: 4,      // 2..6px
    pitch: 0,            // 0 なら自動（= dotDiameter*2）
    angleDeg: 15,        // スクリーン角
    matrixKind: 'bayer', // 'bayer' | 'blue'
    matrixSize: 8,       // 8 | 16（bayer）
    useSourceLuma: true,
    jitter: 0.15,        // 0..0.5
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
      unionRect = null;
      strokeSeed = ((Math.random() * 0x7fffffff) | 0) ^ (Date.now() & 0x7fffffff);

      const s = getState(store, id, DEFAULTS);
      stampHalftone(ctx, last.x, last.y, s);
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !last) return;
      const s = getState(store, id, DEFAULTS);

      const spacing = Math.max(1, 0.5 * s.brushSize); // 距離主導（Δs ≈ w/2）
      let px = last.x, py = last.y;
      const qx = ev.img.x, qy = ev.img.y;
      let dx = qx - px, dy = qy - py;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) return;

      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;
        const nx = px + dx * t, ny = py + dy * t;
        stampHalftone(ctx, nx, ny, s);
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

    drawPreview() {}, // 確定描画系（プレビュー不要）
  };

  // ============== スタンプ処理：網点配置 =================
  function stampHalftone(ctx, cx, cy, s) {
    const R = Math.max(1, s.brushSize / 2);
    const aa = 1;

    // スクリーン基底（回転）
    const theta = (s.angleDeg * Math.PI) / 180;
    const ux = Math.cos(theta),  uy = Math.sin(theta);   // u 軸(+x向きがスクリーン方向)
    const vx = -Math.sin(theta), vy = Math.cos(theta);   // v 軸(直交)

    const pitch = s.pitch > 0 ? s.pitch : (s.dotDiameter * 2);
    const maxR = Math.max(0.5, s.dotDiameter / 2);

    // 対象 AABB
    const minX = Math.floor(cx - R - aa - pitch);
    const minY = Math.floor(cy - R - aa - pitch);
    const maxX = Math.ceil(cx + R + aa + pitch);
    const maxY = Math.ceil(cy + R + aa + pitch);
    const W = maxX - minX, H = maxY - minY;

    // 局所輝度の元データ
    let img = null, data = null;
    if (s.useSourceLuma) {
      try {
        img = ctx.getImageData(minX, minY, W, H);
        data = img.data;
      } catch (_) {
        // セキュリティ制約で取れない場合は下地無し＝一定輝度（=1）
        img = null; data = null;
      }
    }

    // Bayer 閾値（0..1）
    const bayer = (s.matrixKind === 'bayer') ? makeBayerThreshold(s.matrixSize | 0) : null;

    // 角での網点が抜けないよう、矩形の4隅をグリッド空間に投影して範囲決定
    const corners = [
      { x: minX - cx, y: minY - cy },
      { x: maxX - cx, y: minY - cy },
      { x: maxX - cx, y: maxY - cy },
      { x: minX - cx, y: maxY - cy },
    ];
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    for (const c of corners) {
      const u = c.x * ux + c.y * uy;
      const v = c.x * vx + c.y * vy;
      if (u < umin) umin = u; if (u > umax) umax = u;
      if (v < vmin) vmin = v; if (v > vmax) vmax = v;
    }
    const iu0 = Math.floor(umin / pitch) - 1, iu1 = Math.ceil(umax / pitch) + 1;
    const iv0 = Math.floor(vmin / pitch) - 1, iv1 = Math.ceil(vmax / pitch) + 1;

    // 1パスで描き切る（状態切替を減らす）
    ctx.save();
    ctx.globalAlpha = s.opacity;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = s.primaryColor;
    ctx.beginPath();

    const R2 = (R + aa) * (R + aa);
    const jAmp = s.jitter * maxR; // 位置/半径ともに使用

    for (let iv = iv0; iv <= iv1; iv++) {
      for (let iu = iu0; iu <= iu1; iu++) {
        // グリッド中心（世界座標）
        let gx = cx + iu * pitch * ux + iv * pitch * vx;
        let gy = cy + iu * pitch * uy + iv * pitch * vy;

        // スタンプ円内のみ
        const dx = gx - cx, dy = gy - cy;
        if (dx * dx + dy * dy > R2) continue;

        // 局所輝度 L（0..1, 1=白, 0=黒）
        let L = 1.0;
        if (data) {
          const sx = Math.max(0, Math.min(W - 1, gx - minX));
          const sy = Math.max(0, Math.min(H - 1, gy - minY));
          const ix = Math.floor(sx), iy = Math.floor(sy);
          const fx = sx - ix,       fy = sy - iy;

          const i00 = ((iy) * W + ix) * 4;
          const i10 = ((iy) * W + Math.min(W - 1, ix + 1)) * 4;
          const i01 = ((Math.min(H - 1, iy + 1)) * W + ix) * 4;
          const i11 = ((Math.min(H - 1, iy + 1)) * W + Math.min(W - 1, ix + 1)) * 4;

          const r = bilerp(data[i00], data[i10], data[i01], data[i11], fx, fy);
          const g = bilerp(data[i00 + 1], data[i10 + 1], data[i01 + 1], data[i11 + 1], fx, fy);
          const b = bilerp(data[i00 + 2], data[i10 + 2], data[i01 + 2], data[i11 + 2], fx, fy);
          // sRGB 係数で簡易輝度
          L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        } else if (!s.useSourceLuma) {
          // 入力色の輝度を参照（一定パターン）
          const rgb = hexToRgb(s.primaryColor);
          L = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
        }

        // カバレッジ F（暗いほど大）
        let F = 1 - L; // 0..1

        // 閾値（ordered / blue-noise）
        let T = 0.5;
        if (bayer) {
          const N = bayer.N;
          // グリッド座標で modulo（負値対応）
          const mu = posMod(iu, N), mv = posMod(iv, N);
          T = bayer.t[mv * N + mu];
        } else {
          T = hash3(iu, iv, strokeSeed); // 0..1
        }

        // ジッタ（配置 & 半径）
        const jx = (hash3(iu * 17, iv * 19, strokeSeed) - 0.5) * 2 * jAmp;
        const jy = (hash3(iu * 23, iv * 29, strokeSeed) - 0.5) * 2 * jAmp;

        // Ordered/Blue 閾値でドット存在の離散化（F > T のとき描く）
        if (F <= T) continue;

        // 連続半径：面積 ~ F となるよう sqrt
        const rr = Math.max(0, Math.min(1, F));
        let rad = Math.max(0.25, Math.min(maxR, Math.sqrt(rr) * maxR + (hash3(iu, iv * 7, strokeSeed) - 0.5) * jAmp * 0.5));

        ctx.moveTo(gx + jx + rad, gy + jy);
        ctx.arc(gx + jx, gy + jy, rad, 0, Math.PI * 2);
      }
    }

    ctx.fill();
    ctx.restore();

    // 戻し（下地を触っていれば putImageData で戻す）
    if (img) {
      // 今回は読み取りのみなので何もしない
    }

    // AABB 統合
    unionRect = unionAabb(unionRect, { x: minX, y: minY, w: W, h: H });
  }

  // ============== Bayer行列（0..1 閾値） =================
  function makeBayerThreshold(N) {
    N = (N === 16) ? 16 : 8;
    const M = new Float32Array(N * N);
    if (N === 8) {
      // 8x8 既知行列（0..63）
      const B = [
        0,32,8,40,2,34,10,42,
        48,16,56,24,50,18,58,26,
        12,44,4,36,14,46,6,38,
        60,28,52,20,62,30,54,22,
        3,35,11,43,1,33,9,41,
        51,19,59,27,49,17,57,25,
        15,47,7,39,13,45,5,37,
        63,31,55,23,61,29,53,21
      ];
      for (let i = 0; i < 64; i++) M[i] = (B[i] + 0.5) / 64; // 0..1
    } else {
      // 16x16 は 8x8 拡張（Bayer 拡張則）
      const B8 = makeBayerThreshold(8);
      const t = new Float32Array(256);
      const B4 = [[0,2],[3,1]];
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const qx = x >> 1, qy = y >> 1;
          const bx = x & 1,  by = y & 1;
          // 2x2 拡張で位相を散らす（簡易）
          const base = B8.t[(qy % 8) * 8 + (qx % 8)];
          const added = B4[by][bx] / 4;
          t[y * 16 + x] = Math.min(0.999, base * 0.9 + added * 0.1);
        }
      }
      return { t, N: 16 };
    }
    return { t: M, N };
  }

  // ============== ユーティリティ群 =======================
  function bilerp(c00, c10, c01, c11, fx, fy) {
    const a = c00 + (c10 - c00) * fx;
    const b = c01 + (c11 - c01) * fx;
    return a + (b - a) * fy;
    }
  function hexToRgb(hex) {
    const n = hex.startsWith('#') ? hex.slice(1) : hex;
    const v = parseInt(n.length === 3 ? n.replace(/(.)/g, '$1$1') : n, 16) >>> 0;
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function posMod(a, n) { const m = ((a % n) + n) % n; return m; }
  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { x: b.x|0, y: b.y|0, w: Math.ceil(b.w), h: Math.ceil(b.h) };
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function hash3(x, y, s) {
    let n = (x * 73856093) ^ (y * 19349663) ^ (s | 0);
    n = (n ^ (n >>> 13)) * 1274126177;
    n = (n ^ (n >>> 16)) >>> 0;
    return (n & 0xffff) / 0x10000; // 0..1
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    const dotDiameter = clampNum(s.dotDiameter ?? defs.dotDiameter, 1, 12);
    const pitch = s.pitch ? clampNum(s.pitch, 1, 64) : 0;
    const matrixKind = (s.matrixKind === 'blue' ? 'blue' : 'bayer');
    const ms = (s.matrixSize|0) === 16 ? 16 : 8;
    return {
      brushSize: clampNum(s.brushSize ?? defs.brushSize, 1, 512),
      primaryColor: s.primaryColor || defs.primaryColor,
      opacity: clampNum(s.opacity ?? defs.opacity, 0, 1),
      dotDiameter,
      pitch: pitch || dotDiameter * 2,
      angleDeg: Number.isFinite(s.angleDeg) ? s.angleDeg : defs.angleDeg,
      matrixKind,
      matrixSize: ms,
      useSourceLuma: s.useSourceLuma !== undefined ? !!s.useSourceLuma : defs.useSourceLuma,
      jitter: clampNum(s.jitter ?? defs.jitter, 0, 0.5),
    };
  }
  function clampNum(v, lo, hi) { v = +v; if (!Number.isFinite(v)) v = lo; return v < lo ? lo : (v > hi ? hi : v); }
}
