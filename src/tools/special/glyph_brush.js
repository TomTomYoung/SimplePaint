// ツール仕様: 概要=表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。 入力=ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。 出力=質感や模様を含むストロークやスタンプ。 操作=左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
/**
 * Glyph Brush（グリフ沿わせ）
 * 入力パスに沿って、文字列やアイコン（画像）を等間隔で配置・回転して合成するブラシ。
 *
 * 仕様概要
 * - 入力：ポインタ座標列（ストリーム）
 * - 弧長駆動：距離累積 acc と「次の配置間隔 L」を用いて Δs ごとに配置
 * - 回転：接線角にアライン（rotateToTangent=true）
 * - ソース：
 *    ・テキスト（glyphText + font で描画）
 *    ・アイコン画像（glyphImage または glyphImages[] をループ）
 * - 通知：各グリフのAABBを都度統合し、pointerup で一括 expandPendingRectByRect
 *
 * store.getToolState('glyph-brush') 主パラメータ（初期値は getState 参照）:
 *   brushSize       : 基準サイズ w（px）… テキスト高さ/画像の目標高さ
 *   primaryColor    : '#rrggbb'（テキスト時の色）
 *   alpha           : 0..1       （テキスト時の不透明度）
 *   rotateToTangent : true/false （接線に回転）
 *   kerningRatio    : -0.1 .. 0.1（幅に対する±比率, 既定 0）
 *   spacingMode     : 'auto'|'fixed'
 *   spacingPx       : 固定間隔 px（spacingMode='fixed' のとき使用）
 *   scale           : 0.5..2.0   （w に対する倍率）
 *   minScale        : 0.5..1.0   （大曲率で潰れ防止の下限、ここでは単純に下限クランプ）
 *   glyphText       : 文字列（null なら画像モード）
 *   fontFamily      : 'sans-serif' など
 *   fontWeight      : 'normal'|'bold'|数値
 *   glyphImage      : CanvasImageSource（単一アイコン）
 *   glyphImages     : CanvasImageSource[]（複数を順繰り）
 *   imageTint       : null|'#rrggbb'（画像に色を掛けたい場合の簡易ティント。nullなら原色）
 *   minSampleDist   : 入力間引き距離（px）
 */
export function makeGlyphBrush(store) {
  const id = 'glyph-brush';

  let drawing = false;
  let last = null;           // 前フレームの生座標
  let acc = 0;               // 距離繰越
  let nextSpacing = 0;       // 次に必要な弧長
  let unionRect = null;      // 配置AABB統合
  let glyphIndex = 0;        // テキスト/画像の現在インデックス

  const DEFAULTS = {
    brushSize: 24,
    primaryColor: '#000000',
    alpha: 1.0,
    rotateToTangent: true,
    kerningRatio: 0.0,
    spacingMode: 'auto',     // 'auto' uses glyph advance, 'fixed' uses spacingPx
    spacingPx: 24,
    scale: 1.0,
    minScale: 0.6,
    glyphText: 'Sample',
    fontFamily: 'sans-serif',
    fontWeight: 'normal',
    glyphImage: null,
    glyphImages: null,
    imageTint: null,
    minSampleDist: 0.5
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      drawing = true;
      unionRect = null;
      glyphIndex = 0;
      acc = 0;

      const s = getState(store, id, DEFAULTS);

      last = { ...ev.img };

      // 最初の配置（角度は未確定なので 0 で置いても良い。次フレームで上書きされやすい）
      const angle = 0;
      placeOneGlyph(ctx, last.x, last.y, angle, s);

      // 次の間隔を更新
      nextSpacing = computeNextSpacing(ctx, s);

      // その場の小さなAABBだけ先に通知（安全のため少し広め）
      if (unionRect) {
        eng.expandPendingRectByRect?.(unionRect.x, unionRect.y, unionRect.w, unionRect.h);
      }
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !last) return;
      const s = getState(store, id, DEFAULTS);

      const p = { ...ev.img };
      let dx = p.x - last.x;
      let dy = p.y - last.y;
      let dist = Math.hypot(dx, dy);
      if (dist < s.minSampleDist) return;

      // 弧長等間隔で配置
      let px = last.x, py = last.y;
      while (acc + dist >= nextSpacing) {
        const t = (nextSpacing - acc) / dist;
        const nx = px + dx * t;
        const ny = py + dy * t;

        // 接線角
        const tanDx = p.x - px;
        const tanDy = p.y - py;
        const angle = s.rotateToTangent ? Math.atan2(tanDy, tanDx) : 0;

        placeOneGlyph(ctx, nx, ny, angle, s);

        // 次の間隔を更新
        nextSpacing = computeNextSpacing(ctx, s);

        // 消費＆更新
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

    // 軽量プレビュー：現在位置にブラシガイド円 + 入力経路の細線
    drawPreview(octx) {
      if (!drawing || !last) return;
      const s = getState(store, id, DEFAULTS);
      octx.save();
      octx.strokeStyle = '#00000044';
      octx.setLineDash([4, 4]);
      octx.lineWidth = 1;
      octx.beginPath();
      octx.arc(last.x + 0.5, last.y + 0.5, Math.max(2, s.brushSize / 2), 0, Math.PI * 2);
      octx.stroke();
      octx.restore();
    },
  };

  // =================== 1 グリフ配置（描画 + AABB通知） =====================

  function placeOneGlyph(ctx, cx, cy, angle, s) {
    // スケール（高さ基準）
    const scale = clampNum(s.scale, s.minScale, 8.0);
    const targetH = Math.max(1, s.brushSize) * scale;

    ctx.save();
    ctx.translate(cx, cy);
    if (angle) ctx.rotate(angle);

    let aabb;
    if (hasTextMode(s)) {
      // ---- テキスト描画 ----
      const fontPx = targetH;
      ctx.font = `${s.fontWeight} ${fontPx}px ${s.fontFamily}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = s.primaryColor;
      ctx.globalAlpha = clamp01(s.alpha);

      const ch = pickGlyphChar(s);
      // 計測
      const m = ctx.measureText(ch);
      const asc = (m.actualBoundingBoxAscent ?? fontPx * 0.8);
      const desc = (m.actualBoundingBoxDescent ?? fontPx * 0.2);
      const gw = Math.max(1, m.width);
      const gh = Math.max(1, asc + desc);

      ctx.fillText(ch, 0, 0);

      aabb = rectAabbAfterTransform(cx, cy, angle, gw, gh);
    } else {
      // ---- 画像描画 ----
      const img = pickGlyphImage(s);
      if (!img || !isFinite(img.width * img.height)) {
        ctx.restore();
        return;
      }
      const iw = img.width;
      const ih = img.height || iw;
      // 高さを targetH に合わせる
      const scaleH = targetH / ih;
      const drawW = iw * scaleH;
      const drawH = ih * scaleH;

      if (s.imageTint && typeof s.imageTint === 'string') {
        // ティント（簡易）：画像描画 → source-atop で色面を重ねる
        ctx.globalAlpha = 1;
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = s.imageTint;
        ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.globalAlpha = clamp01(s.alpha);
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      }

      aabb = rectAabbAfterTransform(cx, cy, angle, drawW, drawH);
    }

    ctx.restore();

    // AABB 余白（1px）で拡張し統合
    const pad = 1;
    const rect = {
      x: Math.floor(aabb.minX - pad),
      y: Math.floor(aabb.minY - pad),
      w: Math.ceil(aabb.maxX - aabb.minX + pad * 2),
      h: Math.ceil(aabb.maxY - aabb.minY + pad * 2),
    };
    unionRect = unionRect ? unionAabbRect(unionRect, rect) : rect;

    // 次のグリフへ進める
    glyphIndex++;
  }

  // 次の間隔 L を決定
  function computeNextSpacing(ctx, s) {
    if (s.spacingMode === 'fixed') {
      return Math.max(1, s.spacingPx);
    }
    // auto: 次に置くグリフの advance（幅）× (1 + kerning)
    const kr = clampNum(s.kerningRatio, -0.25, 0.25);
    const scale = clampNum(s.scale, s.minScale, 8.0);
    const targetH = Math.max(1, s.brushSize) * scale;

    if (hasTextMode(s)) {
      const ch = peekGlyphChar(s); // 今回配置した直後に呼ばれるので「次の文字」
      ctx.save();
      ctx.font = `${s.fontWeight} ${targetH}px ${s.fontFamily}`;
      const w = Math.max(1, ctx.measureText(ch).width);
      ctx.restore();
      return Math.max(1, w * (1 + kr));
    } else {
      const img = peekGlyphImage(s);
      if (!img || !img.width) return Math.max(1, s.brushSize * (1 + kr));
      const ih = img.height || img.width;
      const scaleH = targetH / ih;
      const w = img.width * scaleH;
      return Math.max(1, w * (1 + kr));
    }
  }

  // ========================= Glyph 供給 =====================================

  function hasTextMode(s) {
    return !!(s.glyphText && s.glyphText.length > 0);
  }

  function pickGlyphChar(s) {
    // 現在 index の文字を取得（ループ）
    const txt = s.glyphText || '';
    if (!txt.length) return '?';
    const i = glyphIndex % txt.length;
    return txt.charAt(i);
  }
  function peekGlyphChar(s) {
    const txt = s.glyphText || '';
    if (!txt.length) return '?';
    const i = (glyphIndex) % txt.length;
    return txt.charAt(i);
  }

  function pickGlyphImage(s) {
    if (Array.isArray(s.glyphImages) && s.glyphImages.length) {
      const i = glyphIndex % s.glyphImages.length;
      return s.glyphImages[i];
    }
    return s.glyphImage || null;
  }
  function peekGlyphImage(s) {
    if (Array.isArray(s.glyphImages) && s.glyphImages.length) {
      const i = (glyphIndex) % s.glyphImages.length;
      return s.glyphImages[i];
    }
    return s.glyphImage || null;
  }

  // ========================= Geometry / AABB ================================

  function rectAabbAfterTransform(cx, cy, angle, w, h) {
    // 中心 (cx,cy) に幅w, 高さh の矩形を角度 angle で回転した AABB
    const hw = w / 2, hh = h / 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    // 4隅
    const pts = [
      { x: -hw, y: -hh }, { x: hw, y: -hh },
      { x: hw, y: hh },   { x: -hw, y: hh }
    ];
    let minX = +Infinity, minY = +Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      const x = cx + p.x * c - p.y * s;
      const y = cy + p.x * s + p.y * c;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  }

  function unionRectAabb(a, b) {
    return {
      minX: Math.min(a.minX, b.minX),
      minY: Math.min(a.minY, b.minY),
      maxX: Math.max(a.maxX, b.maxX),
      maxY: Math.max(a.maxY, b.maxY),
    };
  }

  function unionRectToRect(a, b) {
    // a:{x,y,w,h} + b:{x,y,w,h} → AABB形式で統合
    const A = { minX: a.x, minY: a.y, maxX: a.x + a.w, maxY: a.y + a.h };
    const B = { minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h };
    const U = unionRectAabb(A, B);
    return { x: U.minX, y: U.minY, w: U.maxX - U.minX, h: U.maxY - U.minY };
  }

  function unionAabbRect(a, bRect) {
    if (!a) return { ...bRect };
    return unionRectToRect(a, bRect);
  }

  // ========================= State / Utils =================================

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    const spacingMode = (s.spacingMode === 'fixed') ? 'fixed' : 'auto';
    return {
      brushSize:       clampNum(s.brushSize ?? defs.brushSize, 1, 512),
      primaryColor:    s.primaryColor || defs.primaryColor,
      alpha:           clamp01(s.alpha ?? defs.alpha),
      rotateToTangent: s.rotateToTangent !== undefined ? !!s.rotateToTangent : defs.rotateToTangent,
      kerningRatio:    clampNum(s.kerningRatio ?? defs.kerningRatio, -0.25, 0.5),
      spacingMode,
      spacingPx:       clampNum(s.spacingPx ?? defs.spacingPx, 1, 1024),
      scale:           clampNum(s.scale ?? defs.scale, 0.1, 8.0),
      minScale:        clampNum(s.minScale ?? defs.minScale, 0.1, 2.0),

      glyphText:       (typeof s.glyphText === 'string') ? s.glyphText : defs.glyphText,
      fontFamily:      s.fontFamily || defs.fontFamily,
      fontWeight:      s.fontWeight || defs.fontWeight,

      glyphImage:      s.glyphImage || null,
      glyphImages:     Array.isArray(s.glyphImages) ? s.glyphImages : null,
      imageTint:       s.imageTint || null,

      minSampleDist:   clampNum(s.minSampleDist ?? defs.minSampleDist, 0.1, 4.0),
    };
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function clampNum(v, lo, hi) { v = +v; if (!Number.isFinite(v)) v = lo; return v < lo ? lo : (v > hi ? hi : v); }
}
