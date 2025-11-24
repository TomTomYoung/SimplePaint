/*
 * ツール仕様
 * 概要: 表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。
 * 入力: ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。
 * 出力: 質感や模様を含むストロークやスタンプ。
 * 操作: 左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
 */
/**
 * On-Image Warp（描き込み変形）
 * ブラシでキャンバス画像そのものを局所的にワープ（移動/膨張/渦）。
 *
 * 仕様
 * - 各スタンプで対象AABBの元画像を取得 → 逆写像で再サンプル → 書き戻し
 * - モード:
 *   - 'move'   : ブラシの移動ベクトルに沿って押し流す
 *   - 'expand' : 膨張（strength>0） / 収縮（strength<0）※別名 'bulge' と同義
 *   - 'swirl'  : 渦回転（ccw=trueで反時計回り）
 * - 補間: 'bilinear'（既定）/ 'bicubic'
 * - AABB は R と補間の余白（1〜2px）＋モード依存の追加マージンを含めて通知
 *
 * store.getToolState('on-image-warp') 主パラメータ（初期値は getState 参照）:
 *   radius        : 12..48 px
 *   strength      : 0.2..1.0       … 変形強度（expandは±で膨張/収縮）
 *   mode          : 'move' | 'expand' | 'swirl'
 *   swirlAngleDeg : 渦の最大角（deg, 既定 120）
 *   ccw           : 渦の回転方向（true=反時計）
 *   spacingRatio  : Δs = spacingRatio * radius（既定 0.5）
 *   interp        : 'bilinear' | 'bicubic'
 */
export function makeOnImageWarp(store) {
  const id = 'on-image-warp';

  let drawing = false;
  let last = null;     // {x,y}
  let acc = 0;         // 距離繰越
  let unionRect = null;

  const DEFAULTS = {
    radius: 24,
    strength: 0.5,
    mode: 'move',           // 'move' | 'expand' | 'swirl'
    swirlAngleDeg: 120,
    ccw: true,
    spacingRatio: 0.5,
    interp: 'bilinear',     // 'bilinear' | 'bicubic'
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

      const s = getState(store, id, DEFAULTS);
      // 起点は微小移動として処理（move 以外はゼロ位相でも効果あり）
      applyWarpStamp(ctx, last.x, last.y, 0, 0, s);
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !last) return;
      const s = getState(store, id, DEFAULTS);

      const p = { ...ev.img };
      let dx = p.x - last.x, dy = p.y - last.y;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) return;

      const spacing = Math.max(1, s.spacingRatio * s.radius);

      // 距離主導で等間隔スタンプ
      let px = last.x, py = last.y;
      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;
        const nx = px + dx * t;
        const ny = py + dy * t;
        applyWarpStamp(ctx, nx, ny, dx, dy, s);

        px = nx; py = ny;
        dx = p.x - px; dy = p.y - py;
        dist = Math.hypot(dx, dy);
        acc = 0;
      }
      acc += dist;
      last = p;
    },

    onPointerUp(_ctx, _ev, eng) {
      if (!drawing) return;
      drawing = false;
      last = null;

      if (unionRect) {
        eng.expandPendingRectByRect?.(unionRect.x, unionRect.y, unionRect.w, unionRect.h);
      }
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    // プレビュー：半径サークルのみ（処理負荷軽減）
    drawPreview(octx) {
      if (!drawing || !last) return;
      const s = getState(store, id, DEFAULTS);
      octx.save();
      octx.strokeStyle = '#00000044';
      octx.setLineDash([4, 4]);
      octx.lineWidth = 1;
      octx.beginPath();
      octx.arc(last.x + 0.5, last.y + 0.5, s.radius, 0, Math.PI * 2);
      octx.stroke();
      octx.restore();
    },
  };

  // ============== 1スタンプ：局所ワープ適用 ==============================
  function applyWarpStamp(ctx, cx, cy, dx, dy, s) {
    const R = Math.max(1, s.radius | 0);
    const aa = (s.interp === 'bicubic') ? 2 : 1;

    // モードに応じた追加マージン（ソースサンプリングの余白）
    let extra = aa;
    if (s.mode === 'move') {
      const mag = Math.hypot(dx, dy) * clamp01(s.strength);
      extra += Math.min(R, Math.ceil(mag));
    } else {
      extra += Math.ceil(R * clamp01(Math.abs(s.strength)));
    }

    const minX = Math.floor(cx - R - extra);
    const minY = Math.floor(cy - R - extra);
    const maxX = Math.ceil(cx + R + extra);
    const maxY = Math.ceil(cy + R + extra);
    const W = Math.max(1, maxX - minX);
    const H = Math.max(1, maxY - minY);

    let src;
    try {
      src = ctx.getImageData(minX, minY, W, H);
    } catch (_) {
      // セキュリティ制約などで取得不可→何もしない
      return;
    }
    const dst = ctx.createImageData(W, H);

    const sArr = src.data;
    const dArr = dst.data;

    const str = clamp01(s.strength);
    const swirlMax = (Math.abs(s.swirlAngleDeg) || 120) * Math.PI / 180;
    const swirlSign = s.ccw ? +1 : -1;

    const R2 = R * R;

    // 中心を基準とした逆写像
    for (let y = 0; y < H; y++) {
      const gy = minY + y + 0.5;
      const ry = gy - cy;
      for (let x = 0; x < W; x++) {
        const gx = minX + x + 0.5;
        const rx = gx - cx;
        const r2 = rx * rx + ry * ry;

        let sx = gx, sy = gy; // サンプル元（グローバル座標）

        if (r2 <= R2) {
          const r = Math.sqrt(r2);
          const t = 1 - r / R;                  // 0..1（中心1, 外縁0）
          const fall = t * t * (3 - 2 * t);     // smoothstep

          if (s.mode === 'move') {
            // 逆写像：出力(x,y)は元画像の (x - w*dx, y - w*dy) からサンプル
            const w = fall * str;
            sx = gx - dx * w;
            sy = gy - dy * w;

          } else if (s.mode === 'expand' || s.mode === 'bulge') {
            // 半径方向スケール（strength >0: 膨張, <0: 収縮）
            const sign = (s.mode === 'bulge') ? +1 : Math.sign(s.strength) || +1;
            const k = Math.min(0.99, Math.abs(str)) * sign;
            const scale = 1 - k * fall; // 逆写像なので内側に寄せる
            const inv = Math.max(0.05, scale);
            sx = cx + rx * inv;
            sy = cy + ry * inv;

          } else { // 'swirl'
            const theta = swirlSign * fall * str * swirlMax;
            const ct = Math.cos(-theta), st = Math.sin(-theta); // 逆写像は -θ
            sx = cx + rx * ct - ry * st;
            sy = cy + rx * st + ry * ct;
          }
        }

        // サンプル（タイル内座標へ変換）
        const u = sx - minX - 0.5;
        const v = sy - minY - 0.5;

        if (s.interp === 'bicubic') {
          sampleBicubic(sArr, W, H, u, v, dArr, (y * W + x) * 4);
        } else {
          sampleBilinear(sArr, W, H, u, v, dArr, (y * W + x) * 4);
        }
      }
    }

    ctx.putImageData(dst, minX, minY);

    // ダメージ統合（補間余白含む）
    unionRect = unionAabb(unionRect, { x: minX, y: minY, w: W, h: H });
  }

  // ============== サンプリング（補間） ====================================
  function sampleBilinear(src, W, H, x, y, out, oi) {
    // x,y は 0..W-1, 0..H-1 の実数座標
    const x0 = Math.floor(clamp(x, 0, W - 1));
    const y0 = Math.floor(clamp(y, 0, H - 1));
    const x1 = Math.min(W - 1, x0 + 1);
    const y1 = Math.min(H - 1, y0 + 1);
    const tx = clamp(x - x0, 0, 1);
    const ty = clamp(y - y0, 0, 1);

    const i00 = (y0 * W + x0) * 4;
    const i10 = (y0 * W + x1) * 4;
    const i01 = (y1 * W + x0) * 4;
    const i11 = (y1 * W + x1) * 4;

    for (let c = 0; c < 4; c++) {
      const a = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * tx;
      const b = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * tx;
      out[oi + c] = a + (b - a) * ty;
    }
  }

  function sampleBicubic(src, W, H, x, y, out, oi) {
    // Catmull-Rom（A=-0.5）
    const A = -0.5;

    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = x - xi;
    const ty = y - yi;

    function at(xx, yy, c) {
      const X = clampInt(xx, 0, W - 1);
      const Y = clampInt(yy, 0, H - 1);
      return src[(Y * W + X) * 4 + c];
    }

    function w(t) {
      const a = Math.abs(t);
      if (a <= 1) return (A + 2) * a * a * a - (A + 3) * a * a + 1;
      if (a < 2)  return A * a * a * a - 5 * A * a * a + 8 * A * a - 4 * A;
      return 0;
    }

    for (let c = 0; c < 4; c++) {
      let val = 0;
      for (let m = -1; m <= 2; m++) {
        const wy = w(m - ty);
        let row = 0;
        for (let n = -1; n <= 2; n++) {
          row += at(xi + n, yi + m, c) * w(n - tx);
        }
        val += row * wy;
      }
      out[oi + c] = clamp(val, 0, 255);
    }
  }

  // ============== Utils ====================================================
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clampInt(v, lo, hi) { v = v | 0; return v < lo ? lo : (v > hi ? hi : v); }

  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { x: b.x | 0, y: b.y | 0, w: Math.ceil(b.w), h: Math.ceil(b.h) };
    const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    const mode = (s.mode === 'expand' || s.mode === 'swirl' || s.mode === 'move') ? s.mode : defs.mode;
    const interp = (s.interp === 'bicubic') ? 'bicubic' : 'bilinear';
    return {
      radius:        clamp(s.radius ?? defs.radius, 4, 256),
      strength:      clamp(s.strength ?? defs.strength, -1.0, 1.0),
      mode,
      swirlAngleDeg: Number.isFinite(s.swirlAngleDeg) ? s.swirlAngleDeg : defs.swirlAngleDeg,
      ccw:           s.ccw !== undefined ? !!s.ccw : defs.ccw,
      spacingRatio:  clamp(s.spacingRatio ?? defs.spacingRatio, 0.1, 2.0),
      interp,
    };
  }
}
