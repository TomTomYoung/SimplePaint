function makePatternArtBrush(store) {
  const id = 'pattern-art-brush';

  let drawing = false;
  let pts = [];
  const EPS = 1e-6;

  // 既定値
  const DEFAULTS = {
    tileCanvas: null,      // HTMLCanvasElement/ImageBitmap/HTMLImageElement を想定（未指定ならデフォルト生成）
    tileLength: null,      // L（px）未指定ならタイルの幅
    phase: 0,              // φ（px, 0..L）
    stretchTol: 0.10,      // 伸縮許容 ±10%
    tint: true,            // primaryColor でタイルを着色
    spacingScale: 0.25,    // 経路の弧長サンプル間隔（= L * spacingScale）
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();
      drawing = true;
      pts = [{ ...ev.img }];
    },

    onPointerMove(ctx, ev) {
      if (!drawing) return;
      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) < 1) return;
      pts.push(p);
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      const p = { ...ev.img };
      const last = pts[pts.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) pts.push(p);

      const s = getState(store, id, DEFAULTS);
      const tile = ensureTile(s, store, id);
      const L = Math.max(2, Math.round(s.tileLength || tile.width || 16));
      const phase = mod(s.phase || 0, L);
      const ds = Math.max(1, Math.round(L * (s.spacingScale || 0.25)));

      // 経路平滑化 & 細かい弧長サンプルで再サンプル
      const base = buildSmoothPath(pts, ds);
      if (base.length < 2) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // 弧長配列
      const { cum, total } = cumulativeLengths(base);
      if (total < EPS) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // φ を適用した配置位置列を作成
      const places = [];
      for (let t = phase; t <= total + EPS; t += L) {
        const u = locateAlong(base, cum, t);
        if (!u) break;
        places.push(u); // {x,y,angle}
      }
      if (!places.length) {
        pts = [];
        (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
        return;
      }

      // 描画（タイル単位）＆ AABB 統合
      let aabb = null;
      for (const loc of places) {
        const rect = stampTile(ctx, tile, loc.x, loc.y, loc.angle, L, s);
        if (rect) aabb = unionAabb(aabb, rect);
      }

      if (aabb) eng.expandPendingRectByRect?.(aabb.x, aabb.y, aabb.w, aabb.h);

      pts = [];
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    drawPreview(octx) {
      if (!drawing || pts.length < 2) return;
      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.strokeStyle = '#000';
      octx.lineWidth = 1;
      octx.beginPath();
      octx.moveTo(pts[0].x + 0.5, pts[0].y + 0.5);
      for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x + 0.5, pts[i].y + 0.5);
      octx.stroke();
      octx.restore();
    },
  };

  // === タイル描画 ==========================================================
  // L に合わせて等比スケール（stretchTol の範囲で微調整）。回転は接線に合わせる。
  function stampTile(ctx, tile, x, y, angle, L, s) {
    const tW = tile.width, tH = tile.height;
    if (!tW || !tH) return null;

    // 基本スケール（タイルの「進行方向の長さ」を L に合わせる想定：タイル幅 = 進行方向）
    const baseScale = L / tW;

    // 伸縮許容（±）
    const tol = Math.max(0, Math.min(0.5, s.stretchTol || 0.1));
    const scale = clamp(baseScale, baseScale * (1 - tol), baseScale * (1 + tol));

    // AABB（回転矩形）
    const hw = (tW * scale) / 2, hh = (tH * scale) / 2;
    const c = Math.cos(angle), sn = Math.sin(angle);
    const rx = Math.abs(c) * hw + Math.abs(sn) * hh;
    const ry = Math.abs(sn) * hw + Math.abs(c) * hh;
    const pad = 1;

    // 描画
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.drawImage(tile, -tW / 2, -tH / 2);

    if (s.tint && s.primaryColor) {
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = s.primaryColor;
      ctx.fillRect(-tW / 2, -tH / 2, tW, tH);
    }
    ctx.restore();

    return { x: x - rx - pad, y: y - ry - pad, w: rx * 2 + pad * 2, h: ry * 2 + pad * 2 };
  }

  // === 経路ユーティリティ ====================================================
  function cumulativeLengths(path) {
    const cum = new Array(path.length);
    cum[0] = 0;
    for (let i = 1; i < path.length; i++) {
      cum[i] = cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    return { cum, total: cum[cum.length - 1] };
  }

  // 弧長 t に最も近い位置の座標と接線角を返す
  function locateAlong(path, cum, t) {
    const n = path.length;
    // 二分探索
    let lo = 0, hi = n - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < t) lo = mid; else hi = mid;
    }
    const segLen = Math.max(cum[hi] - cum[lo], EPS);
    const u = clamp((t - cum[lo]) / segLen, 0, 1);
    const p0 = path[lo], p1 = path[hi];
    const x = p0.x + (p1.x - p0.x) * u;
    const y = p0.y + (p1.y - p0.y) * u;

    // 接線角（lo-1..hi+1 の近傍から安定化）
    const i0 = Math.max(0, lo - 1);
    const i1 = Math.min(n - 1, hi + 1);
    const dx = path[i1].x - path[i0].x;
    const dy = path[i1].y - path[i0].y;
    const angle = Math.atan2(dy, dx);

    return { x, y, angle };
  }

  // === タイル生成（未指定時のデフォルト） ===================================
  function ensureTile(s, store, id) {
    let t = s.tileCanvas;
    if (t && t.width && t.height) return t;

    // シンプルなドット（丸いグリフ）：幅=16, 高さ=16
    const W = Math.max(8, Math.min(128, Math.round(s.tileLength || 16)));
    const H = W;
    const cvs = document.createElement('canvas');
    cvs.width = W; cvs.height = H;
    const c = cvs.getContext('2d');

    c.save();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(W / 2, H / 2, Math.max(1, W * 0.35), 0, Math.PI * 2);
    c.fill();
    c.restore();

    return cvs;
  }

  // === 既存様式のパス補助 ====================================================
  function buildSmoothPath(pts, ds) {
    if (!pts || pts.length === 0) return [];
    const sm = emaSmooth(pts, 0.4);
    const cr = centripetalCRSpline(sm, 16);
    const rs = resampleByDistance(cr, Math.max(ds || 2, 1));
    if (cr.length) {
      const a = cr[cr.length - 1], b = rs[rs.length - 1];
      if (!b || b.x !== a.x || b.y !== a.y) rs.push({ x: a.x, y: a.y });
    }
    return rs;
  }

  function emaSmooth(points, alpha) {
    if (points.length === 0) return [];
    const out = [{ ...points[0] }];
    for (let i = 1; i < points.length; i++) {
      const prev = out[out.length - 1];
      const p = points[i];
      out.push({ x: alpha * p.x + (1 - alpha) * prev.x, y: alpha * p.y + (1 - alpha) * prev.y });
    }
    return out;
  }

  function centripetalCRSpline(ps, seg = 16) {
    if (ps.length < 2) return ps.slice();
    const out = [];
    const alpha = 0.5;
    for (let i = 0; i < ps.length - 1; i++) {
      const p0 = ps[i - 1] || ps[i];
      const p1 = ps[i];
      const p2 = ps[i + 1];
      const p3 = ps[i + 2] || p2;

      const d01 = Math.max(Math.hypot(p1.x - p0.x, p1.y - p0.y), EPS);
      const d12 = Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y), EPS);
      const d23 = Math.max(Math.hypot(p3.x - p2.x, p3.y - p2.y), EPS);

      const t0 = 0, t1 = t0 + Math.pow(d01, alpha);
      const t2 = t1 + Math.pow(d12, alpha);
      const t3 = t2 + Math.pow(d23, alpha);

      for (let j = 0; j < seg; j++) {
        const t = t1 + ((t2 - t1) * j) / seg;
        const A1 = lerpPoint(p0, p1, (t1 - t) / Math.max(t1 - t0, EPS));
        const A2 = lerpPoint(p1, p2, (t2 - t) / Math.max(t2 - t1, EPS));
        const A3 = lerpPoint(p2, p3, (t3 - t) / Math.max(t3 - t2, EPS));
        const B1 = lerpPoint(A1, A2, (t2 - t) / Math.max(t2 - t0, EPS));
        const B2 = lerpPoint(A2, A3, (t3 - t) / Math.max(t3 - t1, EPS));
        out.push(lerpPoint(B1, B2, (t2 - t) / Math.max(t2 - t1, EPS)));
      }
    }
    out.push(ps[ps.length - 1]);
    return out;
  }

  // 既存仕様: t は「a の重み」寄り
  function lerpPoint(a, b, t) {
    return { x: a.x + (b.x - a.x) * (1 - t), y: a.y + (b.y - a.y) * (1 - t) };
  }

  function resampleByDistance(pts, ds) {
    if (!pts || pts.length === 0) return [];
    if (!(ds > 0)) return pts.slice();
    const out = [pts[0]];
    let prev = pts[0], acc = 0;
    for (let i = 1; i < pts.length; i++) {
      let curr = pts[i];
      let segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      if (segLen === 0) continue;
      while (acc + segLen >= ds) {
        const t = (ds - acc) / segLen;
        const nx = prev.x + (curr.x - prev.x) * t;
        const ny = prev.y + (curr.y - prev.y) * t;
        const np = { x: nx, y: ny };
        out.push(np);
        prev = np;
        segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        acc = 0;
      }
      acc += segLen;
      prev = curr;
    }
    return out;
  }

  // === 小物ユーティリティ ====================================================
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      primaryColor: s.primaryColor || '#000',
      tileCanvas: s.tileCanvas || defs.tileCanvas || null,
      tileLength: Number.isFinite(s.tileLength) ? s.tileLength : defs.tileLength,
      phase: Number.isFinite(s.phase) ? s.phase : defs.phase,
      stretchTol: Number.isFinite(s.stretchTol) ? s.stretchTol : defs.stretchTol,
      tint: (s.tint === false) ? false : defs.tint,
      spacingScale: Number.isFinite(s.spacingScale) ? s.spacingScale : defs.spacingScale,
    };
  }

  function unionAabb(a, b) {
    if (!b) return a || null;
    if (!a) return { ...b };
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function mod(a, n) { return ((a % n) + n) % n; }
}

window.makePatternArtBrush = makePatternArtBrush;
