import { initToolbar, setToolCallbacks, bindParameterControls, showRestoreButton, updateAutosaveBadge } from './gui/toolbar.js';
import { initAdjustPanel, initLayerPanel, setAdjustCallbacks, setLayerCallbacks, updateLayerList as panelUpdateLayerList } from './gui/panels.js';
import { updateStatus, updateZoom } from './gui/statusbar.js';
import { Engine } from './engine.js';

/* ===== helpers ===== */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dpr = () => window.devicePixelRatio || 1;
const toHex = (r, g, b) =>
  "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
const nowFmt = () => new Date().toLocaleTimeString();

/* ===== DOM ===== */
const base = document.getElementById("base");
const overlay = document.getElementById("overlay");
const editorLayer = document.getElementById("editorLayer");
const stage = document.getElementById("stage");

function getCanvasArea() {
  // 分割後: stage 内の左ペイン（キャンバス側）を必ず取り直す
  // id が変わっても対応できるよう優先順で探す
  return (
    stage?.querySelector('#canvasArea') ||
    stage?.querySelector('[data-canvas-area="left"]') ||
    stage?.querySelector('.canvas-area') ||
    document.getElementById('canvasArea') ||
    null
  );
}

const headerEl = document.querySelector("header");
function syncHeaderHeight() {
  if (!headerEl) return;
  const h = Math.ceil(headerEl.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--headerH", h + "px");
}

function centerStageScroll() {
  const area = getCanvasArea();
  if (area) {
    area.scrollLeft = (area.scrollWidth - area.clientWidth) / 2;
    area.scrollTop = (area.scrollHeight - area.clientHeight) / 2;
  }
}
new ResizeObserver(() => syncHeaderHeight()).observe(headerEl);
window.addEventListener("load", syncHeaderHeight);
window.addEventListener("resize", syncHeaderHeight);
window.addEventListener("load", centerStageScroll);
window.addEventListener("resize", centerStageScroll);


// 追加：エディタ外クリックでテキスト確定（先に走らせるため capture:true）
document.addEventListener(
  "pointerdown",
  (e) => {
    if (
      activeEditor &&
      !(e.target && e.target.closest && e.target.closest(".text-editor"))
    ) {
      cancelTextEditing(true);
      engine.requestRepaint();
    }
  },
  { capture: true }
);

/* ===== work bitmap ===== */
const bmp = document.createElement("canvas");
const bctx = bmp.getContext("2d", { willReadFrequently: true });
const clipCanvas = document.createElement("canvas");
const clipCtx = clipCanvas.getContext("2d");
const layers = [];
let activeLayer = 0;

function flattenLayers(ctx) {
  ctx.clearRect(0, 0, bmp.width, bmp.height);
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i];
    if (!l.visible) continue;
    ctx.save();
    ctx.globalAlpha = l.opacity ?? 1;
    ctx.globalCompositeOperation = l.mode || "source-over";
    if (l.clip && i > 0) {
      clipCtx.clearRect(0, 0, bmp.width, bmp.height);
      clipCtx.drawImage(layers[i - 1], 0, 0);
      clipCtx.globalCompositeOperation = "source-in";
      clipCtx.drawImage(l, 0, 0);
      ctx.drawImage(clipCanvas, 0, 0);
    } else {
      ctx.drawImage(l, 0, 0);
    }
    ctx.restore();
  }
}

function renderLayers() {
  flattenLayers(bctx);
}

function updateLayerList() {
  const callbacks = {
    onSelect: i => setActiveLayer(i),
    onVisibility: (i, visible) => {
      layers[i].visible = visible;
      renderLayers();
      engine.requestRepaint();
    },
    onOpacity: (i, opacity) => {
      layers[i].opacity = opacity;
      renderLayers();
      engine.requestRepaint();
    },
    onBlendMode: (i, mode) => {
      layers[i].mode = mode;
      renderLayers();
      engine.requestRepaint();
    },
    onClip: (i, clip) => {
      layers[i].clip = clip;
      renderLayers();
      engine.requestRepaint();
    },
    onRename: (i, name) => {
      layers[i].name = name;
      updateLayerList();
    },
    onMove: (from, to) => moveLayer(from, to)
  };
  panelUpdateLayerList(layers, activeLayer, callbacks);
}

window.updateLayerList = updateLayerList;

function setActiveLayer(i) {
  if (i < 0 || i >= layers.length) return;
  activeLayer = i;
  // no direct assignment to engine.ctx; getter reflects active layer
  updateLayerList();
  renderLayers();
  engine.requestRepaint();
}

function moveLayer(from, to) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= layers.length ||
    to >= layers.length
  )
    return;
  const [l] = layers.splice(from, 1);
  layers.splice(to, 0, l);
  engine.history.stack.forEach((p) => {
    if (p.layer === from) p.layer = to;
    else if (from < to && p.layer > from && p.layer <= to) p.layer--;
    else if (to < from && p.layer >= to && p.layer < from) p.layer++;
  });
  setActiveLayer(to);
  renderLayers();
  updateLayerList();
}

// function addLayer() {
//   const c = document.createElement("canvas");
//   c.width = bmp.width;
//   c.height = bmp.height;
//   c.visible = true;
//   c.opacity = 1;
//   c.mode = "source-over";
//   c.clip = false;
//   const idx = Math.min(activeLayer + 1, layers.length);
//   layers.splice(idx, 0, c);
//   setActiveLayer(idx);
// }

function addLayer() {
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.visible = true;
  c.opacity = 1;
  c.mode = "source-over";
  c.clip = false;

  // 追加：レイヤ固有のidとname（並べ替えで変わらない）
  if (c._id == null)
    c._id =
      crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : "L" + Date.now() + Math.random().toString(16).slice(2);
  if (typeof c.name !== "string" || !c.name)
    c.name = `Layer ${layers.length + 1}`;

  const idx = Math.min(activeLayer + 1, layers.length);
  layers.splice(idx, 0, c);
  setActiveLayer(idx);
}

function deleteLayer() {
  if (layers.length <= 1) return;

  // 履歴スタック内の削除されるレイヤーを参照するエントリを調整
  const orig = engine.history.stack;
  let removedBefore = 0;
  const filtered = [];
  orig.forEach((p, i) => {
    if (p.layer === activeLayer) {
      if (i <= engine.history.index) removedBefore++;
      return; // 削除レイヤーの履歴を除去
    }
    if (p.layer > activeLayer) p.layer--; // より上位のレイヤー番号を調整
    filtered.push(p);
  });
  engine.history.stack = filtered;
  engine.history.index = Math.max(
    -1,
    Math.min(filtered.length - 1, engine.history.index - removedBefore)
  );

  layers.splice(activeLayer, 1);
  if (activeLayer >= layers.length) activeLayer = layers.length - 1;
  setActiveLayer(activeLayer);
}

/* ===== display resize ===== */
function resizeCanvasToDisplaySize(canvas, cssW, cssH) {
  const ratio = dpr();
  const w = Math.floor(cssW * ratio),
    h = Math.floor(cssH * ratio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

/* ===== store ===== */
function createStore(initial) {
  let state = { ...initial };
  const subs = new Set();
  return {
    getState: () => state,
    set(p) {
      state = { ...state, ...p };
      subs.forEach((f) => f(state));
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

/* ===== viewport ===== */
class Viewport {
  constructor() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }
  screenToImage(x, y) {
    return {
      x: (x - this.panX) / this.zoom,
      y: (y - this.panY) / this.zoom,
    };
  }
  imageToScreen(x, y) {
    return { x: x * this.zoom + this.panX, y: y * this.zoom + this.panY };
  }
}

/* ===== tools: pencil/eraser/eyedropper/bucket/shape/select/text ===== */
// (前回と同等。省略せず記述)
function makeBrush(store) {
  // ===== パラメータ（好みで調整） =====
  const MIN_RADIUS = 0.5;                // 下限半径（px）
  const MAX_WIDTH_SCALE = 1.0;           // UIの brushSize に掛ける最大比
  const MIN_WIDTH_SCALE = 0.35;          // UIの brushSize に掛ける最小比
  const PRESSURE_CURVE = (p) => Math.pow(p, 0.7); // 筆圧→半径のカーブ
  const SPEED_FOR_MIN = 3.0;             // この速度以上で最細（px/フレーム相当）
  const SPEED_FOR_MAX = 0.2;             // この速度以下で最太
  const SPACING_RATIO = 0.4;             // スタンプ間隔 = 半径 * この係数

  // ===== ユーティリティ =====
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const dist2 = (a, b) => {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 速度→幅スケール（0..1）
  function speedToWidthScale(spd) {
    const t = clamp01((spd - SPEED_FOR_MAX) / (SPEED_FOR_MIN - SPEED_FOR_MAX));
    // spd 小 → 0、spd 大 → 1 になるので反転して「遅いほど太い」
    const s = 1 - t;
    return lerp(MIN_WIDTH_SCALE, MAX_WIDTH_SCALE, s);
  }

  // スタンプ描画（丸）
  function stamp(ctx, x, y, radius, color, eng) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(radius, MIN_RADIUS), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const pad = Math.ceil(radius + 1);
    eng.expandPendingRectByRect(x - pad, y - pad, pad * 2, pad * 2);
  }

  // ===== 内部状態 =====
  let drawing = false;
  let last = null;            // {x,y}
  let ema = null;             // 平滑化位置
  let lastStampAt = null;     // 最後にスタンプした点
  let lastRadius = 0;

  function reset() {
    drawing = false;
    last = null;
    ema = null;
    lastStampAt = null;
    lastRadius = 0;
  }

  return {
    id: "brush",
    cursor: "crosshair",
    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      drawing = true;

      const s = store.getState();
      const p0 = { x: ev.img.x, y: ev.img.y };
      last = { ...p0 };
      ema = { ...p0 };
      lastStampAt = null;

      // 1ストローク用スナップショット（履歴）
      eng.beginStrokeSnapshot();

      // 最初のスタンプ
      const baseW = s.brushSize;
      const pr = (typeof ev.pressure === "number") ? PRESSURE_CURVE(ev.pressure) : 0.5;
      const wScale = (typeof ev.pressure === "number")
        ? lerp(MIN_WIDTH_SCALE, MAX_WIDTH_SCALE, pr)
        : MAX_WIDTH_SCALE; // 始点は太めで気持ちよく
      lastRadius = Math.max(MIN_RADIUS, (baseW * wScale) / 2);
      stamp(ctx, p0.x, p0.y, lastRadius, s.primaryColor, eng);
      lastStampAt = { ...p0 };
    },

    onPointerMove(ctx, ev, eng) {
      if (!drawing) return;

      const s = store.getState();
      const cur = { x: ev.img.x, y: ev.img.y };

      // 位置の EMA 平滑化（揺れ抑制）
      ema.x = lerp(ema.x, cur.x, s.smoothAlpha);
      ema.y = lerp(ema.y, cur.y, s.smoothAlpha);

      // 短区間補間（last→ema）を等間隔に敷く
      const segLen = dist2(last, ema);
      if (segLen <= 0) {
        // 半径だけ更新（太さの追従）
        const spd = dist2(last, ema); // 0
        const baseW = s.brushSize;
        const radiusBySpeed = (baseW * speedToWidthScale(spd)) / 2;
        const radiusByPressure =
          typeof ev.pressure === "number"
            ? (baseW * lerp(MIN_WIDTH_SCALE, MAX_WIDTH_SCALE, PRESSURE_CURVE(ev.pressure))) / 2
            : radiusBySpeed;
        lastRadius = Math.max(MIN_RADIUS, radiusByPressure);
        return;
      }

      // 現フレームの太さを決定
      const spd = segLen; // 簡易：距離を速度の代理に
      const baseW = s.brushSize;
      const radiusBySpeed = (baseW * speedToWidthScale(spd)) / 2;
      const radiusByPressure =
        typeof ev.pressure === "number"
          ? (baseW * lerp(MIN_WIDTH_SCALE, MAX_WIDTH_SCALE, PRESSURE_CURVE(ev.pressure))) / 2
          : radiusBySpeed;
      const targetRadius = Math.max(MIN_RADIUS, radiusByPressure);

      // 半径の追従も EMA で滑らかに
      lastRadius = lerp(lastRadius || targetRadius, targetRadius, 0.5);

      // スタンプ間隔（半径に比例）
      const spacing = Math.max(0.5, lastRadius * s.spacingRatio);

      // 途中からでも「間隔ちょうど」で敷けるよう、最後のスタンプ位置から刻む
      let from = lastStampAt || last;
      const dirx = (ema.x - from.x);
      const diry = (ema.y - from.y);
      const total = Math.sqrt(dirx * dirx + diry * diry);
      if (total >= spacing) {
        const ux = dirx / total, uy = diry / total;
        let traveled = 0;
        while (traveled + spacing <= total) {
          traveled += spacing;
          const x = from.x + ux * traveled;
          const y = from.y + uy * traveled;
          stamp(ctx, x, y, lastRadius, s.primaryColor, eng);
          lastStampAt = { x, y };
        }
      }

      // 区間終端（ema）に追従
      last = { ...ema };
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;

      // 終端まで敷き切り（最後の隙間を埋める）
      const s = store.getState();
      const end = { x: ev.img.x, y: ev.img.y };
      const final = { x: lerp(last.x, end.x, s.smoothAlpha), y: lerp(last.y, end.y, s.smoothAlpha) };
      const gap = lastStampAt ? dist2(lastStampAt, final) : dist2(last, final);
      if (gap > 0) {
        const spacing = Math.max(0.5, lastRadius * s.spacingRatio);
        const steps = Math.max(1, Math.ceil(gap / spacing));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const x = lerp((lastStampAt?.x ?? last.x), final.x, t);
          const y = lerp((lastStampAt?.y ?? last.y), final.y, t);
          stamp(ctx, x, y, lastRadius, s.primaryColor, eng);
          lastStampAt = { x, y };
        }
      }

      // 履歴確定
      eng.finishStrokeToHistory();
      reset();
    },

    drawPreview() { /* スタンプ式は実描画なのでプレビュー不要 */ },
  };
}


function floodFill(ctx, x0, y0, rgba, th = 0) {
  if (x0 < 0 || y0 < 0 || x0 >= bmp.width || y0 >= bmp.height)
    return null;
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height),
    d = img.data,
    w = bmp.width,
    h = bmp.height,
    id = (x, y) => (y * w + x) * 4;
  const sr = d[id(x0, y0)],
    sg = d[id(x0, y0) + 1],
    sb = d[id(x0, y0) + 2],
    sa = d[id(x0, y0) + 3];
  const same = (r, g, b, a) =>
    Math.abs(r - sr) +
    Math.abs(g - sg) +
    Math.abs(b - sb) +
    Math.abs(a - sa) <=
    th;
  const [fr, fg, fb, fa] = rgba;
  if (same(fr, fg, fb, fa) && th === 0) return null;
  const st = [[x0, y0]];
  let minx = x0,
    maxx = x0,
    miny = y0,
    maxy = y0;
  while (st.length) {
    let [x, y] = st.pop();
    while (
      x >= 0 &&
      same(d[id(x, y)], d[id(x, y) + 1], d[id(x, y) + 2], d[id(x, y) + 3])
    )
      x--;
    x++;
    let up = false,
      dn = false;
    while (
      x < w &&
      same(d[id(x, y)], d[id(x, y) + 1], d[id(x, y) + 2], d[id(x, y) + 3])
    ) {
      const i = id(x, y);
      d[i] = fr;
      d[i + 1] = fg;
      d[i + 2] = fb;
      d[i + 3] = fa;
      minx = Math.min(minx, x);
      maxx = Math.max(maxx, x);
      miny = Math.min(miny, y);
      maxy = Math.max(maxy, y);
      if (y > 0) {
        const iu = id(x, y - 1);
        const su = same(d[iu], d[iu + 1], d[iu + 2], d[iu + 3]);
        if (!up && su) {
          st.push([x, y - 1]);
          up = true;
        } else if (up && !su) {
          up = false;
        }
      }
      if (y < h - 1) {
        const idd = id(x, y + 1);
        const sd = same(d[idd], d[idd + 1], d[idd + 2], d[idd + 3]);
        if (!dn && sd) {
          st.push([x, y + 1]);
          dn = true;
        } else if (dn && !sd) {
          dn = false;
        }
      }
      x++;
    }
  }
  const rect = {
    x: minx,
    y: miny,
    w: maxx - minx + 1,
    h: maxy - miny + 1,
  };
  const before = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  ctx.putImageData(img, 0, 0);
  const after = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  return { rect, before, after };
}
function drawEllipsePath(ctx, cx, cy, rx, ry) {
  const k = 0.5522847498307936,
    ox = rx * k,
    oy = ry * k;
  ctx.moveTo(cx + rx, cy);
  ctx.bezierCurveTo(cx + rx, cy - oy, cx + ox, cy - ry, cx, cy - ry);
  ctx.bezierCurveTo(cx - ox, cy - ry, cx - rx, cy - oy, cx - rx, cy);
  ctx.bezierCurveTo(cx - rx, cy + oy, cx - ox, cy + ry, cx, cy + ry);
  ctx.bezierCurveTo(cx + ox, cy + ry, cx + rx, cy + oy, cx + rx, cy);
}





function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t,
    t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}
function catmullRomSpline(pts, seg = 16) {
  const out = [];
  if (pts.length < 2) return pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    for (let j = 0; j <= seg; j++) {
      const t = j / seg;
      out.push(catmullRom(p0, p1, p2, p3, t));
    }
  }
  return out;
}


function makeCatmull(store) {
  let pts = [],
    fresh = true,
    hover = null;
  const reset = () => {
    pts = [];
    fresh = true;
    hover = null;
  };

  function finalize(ctx, eng) {
    if (pts.length < 4) {
      reset();
      eng.requestRepaint();
      return;
    }
    const s = store.getState();
    const cr = catmullRomSpline(pts);
    ctx.save();
    ctx.lineWidth = s.brushSize;
    ctx.strokeStyle = s.primaryColor;
    ctx.beginPath();
    ctx.moveTo(cr[0].x + 0.5, cr[0].y + 0.5);
    for (let i = 1; i < cr.length; i++) {
      ctx.lineTo(cr[i].x + 0.5, cr[i].y + 0.5);
    }
    ctx.stroke();
    ctx.restore();

    let minX = cr[0].x,
      maxX = cr[0].x,
      minY = cr[0].y,
      maxY = cr[0].y;
    cr.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
    eng.expandPendingRectByRect(
      minX - s.brushSize,
      minY - s.brushSize,
      maxX - minX + s.brushSize * 2,
      maxY - minY + s.brushSize * 2
    );
    eng.finishStrokeToHistory();
    eng.requestRepaint();
    reset();
  }

  return {
    id: "catmull",
    cursor: "crosshair",
    previewRect: null,
    onEnter(ctx, eng) {
      finalize(ctx, eng);
    },
    cancel() {
      reset();
      engine.requestRepaint();
    },
    onPointerDown(ctx, ev, eng) {
      if (ev.button === 0 && ev.detail === 2) {
        if (pts.length === 0) eng.beginStrokeSnapshot();
        pts.push({ ...ev.img });
        finalize(ctx, eng);
        return;
      }
      if (fresh) {
        pts = [];
        fresh = false;
      }
      pts.push({ ...ev.img });
    },
    onPointerMove(ctx, ev) {
      hover = { ...ev.img };
    },
    onPointerUp() { },
    drawPreview(octx) {
      const s = store.getState();
      octx.save();
      octx.lineWidth = s.brushSize;
      octx.strokeStyle = s.primaryColor;

      if (pts.length >= 2) {
        const src = hover ? [...pts, hover] : pts;
        const cr = catmullRomSpline(src);
        if (cr.length >= 2) {
          octx.beginPath();
          octx.moveTo(cr[0].x + 0.5, cr[0].y + 0.5);
          for (let i = 1; i < cr.length; i++) {
            octx.lineTo(cr[i].x + 0.5, cr[i].y + 0.5);
          }
          octx.stroke();
        }
      } else if (pts.length === 1 && hover) {
        octx.beginPath();
        octx.moveTo(pts[0].x + 0.5, pts[0].y + 0.5);
        octx.lineTo(hover.x + 0.5, hover.y + 0.5);
        octx.stroke();
      }
      octx.restore();
    },
  };
}

function bspline(points, deg = 3, seg = 32) {
  const n = points.length - 1;
  if (n < deg) return points;
  const knots = [];
  const m = n + deg + 1;
  for (let i = 0; i <= m; i++) {
    if (i <= deg) knots.push(0);
    else if (i >= n + 1) knots.push(n - deg + 1);
    else knots.push(i - deg);
  }
  const out = [];
  const start = knots[deg],
    end = knots[n + 1];
  const step = (end - start) / seg;
  for (let s = 0; s <= seg; s++) {
    const u = start + s * step;
    let j = n;
    if (u < end) {
      for (let k = deg; k <= n; k++) {
        if (u >= knots[k] && u < knots[k + 1]) {
          j = k;
          break;
        }
      }
    }
    out.push(deBoor(deg, u, knots, points, j));
  }
  return out;
}
function deBoor(k, u, t, c, j) {
  const d = [];
  for (let r = 0; r <= k; r++) d[r] = { ...c[j - k + r] };
  for (let r = 1; r <= k; r++) {
    for (let i = k; i >= r; i--) {
      const idx = j - k + i;
      const alpha = (u - t[idx]) / (t[idx + k + 1 - r] - t[idx]);
      d[i] = {
        x: (1 - alpha) * d[i - 1].x + alpha * d[i].x,
        y: (1 - alpha) * d[i - 1].y + alpha * d[i].y,
      };
    }
  }
  return d[k];
}


function nurbs(points, weights, deg = 3, seg = 32) {
  const n = points.length - 1;
  // （そのままでも動くが、端点補間が欲しければクランプに置換する）
  const knots = [];
  for (let i = 0; i <= n + deg + 1; i++) knots.push(i);

  function N(i, k, u) {
    // ★ 末端uで最後の基底だけ1にする（w=0防止）
    if (k === 0) {
      if (u === knots[knots.length - 1]) return i === n ? 1 : 0;
      return u >= knots[i] && u < knots[i + 1] ? 1 : 0;
    }
    const den1 = knots[i + k] - knots[i];
    const den2 = knots[i + k + 1] - knots[i + 1];
    const a = den1 ? (u - knots[i]) / den1 : 0;
    const b = den2 ? (knots[i + k + 1] - u) / den2 : 0;
    return a * N(i, k - 1, u) + b * N(i + 1, k - 1, u);
  }

  const uStart = knots[deg];
  const uEnd = knots[n + 1];
  const out = [];
  // ★ 末端を含めない（代わりに最後だけ一歩手前でサンプル）
  const step = (uEnd - uStart) / seg;
  for (let s = 0; s <= seg; s++) {
    // s==seg のときはごくわずか手前に寄せる
    const u = s === seg ? uEnd - 1e-9 : uStart + s * step;
    let x = 0,
      y = 0,
      w = 0;
    for (let i = 0; i <= n; i++) {
      const b = N(i, deg, u) * (weights[i] ?? 1);
      x += points[i].x * b;
      y += points[i].y * b;
      w += b;
    }
    if (!isFinite(w) || Math.abs(w) < 1e-8) continue; // ★ 念のためNaN/ゼロガード
    out.push({ x: x / w, y: y / w });
  }
  return out;
}





let activeEditor = null;
// 置換：テキスト確定処理（Canvas用フォント＆二重スケール防止）
function cancelTextEditing(commit = false) {
  if (!activeEditor) return;

  if (commit) {
    // editorLayer は translate+scale 済 → left/top/サイズは「画像座標px」そのもの
    const x = Math.round(parseFloat(activeEditor.style.left) || 0);
    const y = Math.round(parseFloat(activeEditor.style.top) || 0);
    const w = Math.ceil(activeEditor.offsetWidth); // zoom で割らない
    const h = Math.ceil(activeEditor.offsetHeight); // zoom で割らない

    const cs = getComputedStyle(activeEditor);
    const color = cs.color;
    const fontSizePx = parseFloat(cs.fontSize) || 16;
    const fontWeight = cs.fontWeight || "normal";
    const fontStyle = cs.fontStyle || "normal";
    const fontFamily = cs.fontFamily || "system-ui, sans-serif";
    const canvasFont = `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`;

    // line-height が 'normal' の場合は 1.4倍で代用
    let lineHeightPx = parseFloat(cs.lineHeight);
    if (isNaN(lineHeightPx)) lineHeightPx = Math.round(fontSizePx * 1.4);

    const paddingX = 6,
      paddingY = 4;
    const lines = activeEditor.innerText.replace(/\r/g, "").split("\n");

    const ctx = layers[activeLayer].getContext("2d");
    ctx.save();
    ctx.font = canvasFont; // Canvasは「xxpx ファミリ」形式のみ有効
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    let ycur = y + paddingY;
    for (const line of lines) {
      ctx.fillText(line, x + paddingX, ycur);
      ycur += lineHeightPx;
    }
    ctx.restore();

    // 履歴（beginStrokeSnapshot は Textツール起動時に呼んでいる前提）
    engine.expandPendingRectByRect(x, y, w, h);
    engine.finishStrokeToHistory();
  }

  if (activeEditor._onKey) {
    activeEditor.removeEventListener("keydown", activeEditor._onKey);
    delete activeEditor._onKey;
  }
  editorLayer.removeChild(activeEditor);
  activeEditor = null;
  editorLayer.style.pointerEvents = "none"; // ★ここ！ camelCase
}


/* ===== init ===== */
const store = createStore({
  toolId: "pencil",
  primaryColor: "#000000",
  secondaryColor: "#ffffff",
  brushSize: 4,
  smoothAlpha: 0.55,
  spacingRatio: 0.4,
  fillOn: true,
  antialias: false,
});
const vp = new Viewport();
const engine = new Engine(store, vp);

//#region UI bind
/* ===== UI bind ===== */
// ツールバーコールバックの設定
setToolCallbacks({
  onToolChange: toolId => {
    store.set({ toolId });
    engine.setTool(toolId);
  },
  onOpenFile: file => openImageFile(file),
  onSave: format => {
    if (format === 'png') document.getElementById('savePNG').click();
    else if (format === 'jpg') document.getElementById('saveJPG').click();
    else if (format === 'webp') document.getElementById('saveWEBP').click();
  },
  onUndo: () => engine.undo(),
  onRedo: () => engine.redo(),
  onClear: () => {
    cancelTextEditing(false);
    const ctx = layers[activeLayer].getContext("2d");
    const before = ctx.getImageData(0, 0, bmp.width, bmp.height);
    ctx.clearRect(0, 0, bmp.width, bmp.height);
    if (activeLayer === 0) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, bmp.width, bmp.height);
    }
    const after = ctx.getImageData(0, 0, bmp.width, bmp.height);
    engine.history.pushPatch({
      layer: activeLayer,
      rect: { x: 0, y: 0, w: bmp.width, h: bmp.height },
      before,
      after,
    });
    renderLayers();
    engine.requestRepaint();
  },
  onFitToScreen: () => fitToScreen(),
  onActualSize: () => {
    vp.zoom = 1;
    vp.panX = 0;
    vp.panY = 0;
    engine.requestRepaint();
  },
  onCopy: () => doCopy(),
  onCut: () => doCut(),
  onPaste: () => navigator.clipboard?.read?.()
    .then(handleClipboardItems)
    .catch(() => { }),
  onRestore: () => restoreSession(),
  isTextEditing: () => !!activeEditor,
  onCancelText: () => {
    cancelTextEditing(false);
    engine.requestRepaint();
  },
  onCancel: () => engine.current?.cancel?.(),
  onEnter: () => engine.current?.onEnter?.(engine.ctx, engine),
  onSpaceDown: () => base.style.cursor = "grab",
  onSpaceUp: () => base.style.cursor = engine.current?.cursor || "default"
});

// パラメータコントロールのバインド
bindParameterControls({
  onBrushSizeChange: v => store.set({ brushSize: v }),
  onSmoothChange: v => store.set({ smoothAlpha: v }),
  onSpacingChange: v => store.set({ spacingRatio: v }),
  onColorChange: v => store.set({ primaryColor: v }),
  onColor2Change: v => store.set({ secondaryColor: v }),
  onFillChange: v => store.set({ fillOn: v }),
  onAntialiasChange: v => {
    store.set({ antialias: v });
    engine.requestRepaint();
  },
  onFontFamilyChange: v => {
    if (activeEditor) activeEditor.style.fontFamily = v;
  },
  onFontSizeChange: v => {
    if (activeEditor) {
      let fs = parseFloat(v || "24");
      if (isNaN(fs)) fs = 24;
      activeEditor.style.fontSize = fs + "px";
      activeEditor.style.lineHeight = Math.round(fs * 1.4) + "px";
    }
  }
});

// レイヤーパネルコールバックの設定  
setLayerCallbacks({
  onAdd: () => addLayer(),
  onDelete: () => deleteLayer()
});

function selectTool(id) {
  cancelTextEditing(false);
  store.set({ toolId: id });
  document
    .querySelectorAll(".tool")
    .forEach((b) => b.classList.toggle("active", b.dataset.tool === id));
  engine.setTool(id);
}
window.selectTool = selectTool;
function updateCursorInfo(pos) {
  updateStatus(
    `x:${Math.floor(pos.img.x)}, y:${Math.floor(pos.img.y)}  線:${store.getState().primaryColor
    } 塗:${document.getElementById("color2").value}  幅:${store.getState().brushSize
    }`
  );
}

/* register tools */
engine.register(makeSelectRect());
engine.register(makePencil(store));
engine.register(makePencilClick(store));
engine.register(makeBrush(store));
engine.register(makeEraser(store));
engine.register(makeEraserClick(store));
engine.register(makeEyedropper(store));
engine.register(makeBucket(store));
engine.register(makeShape("line", store));
engine.register(makeShape("rect", store));
engine.register(makeShape("ellipse", store));
engine.register(makeQuadratic(store));
engine.register(makeCubic(store));
engine.register(makeArc(store));
engine.register(makeSector(store));
engine.register(makeCatmull(store));
engine.register(makeBSpline(store));
engine.register(makeNURBS(store));
engine.register(makeEllipse2(store));
engine.register(makeFreehand(store));
engine.register(makeFreehandClick(store));
engine.register(makeTextTool(store));
selectTool("pencil");

//#endregion

//#region IO: open/save
/* ===== IO: open/save ===== */
function initDocument(w = 1280, h = 720, bg = "#ffffff") {
  bmp.width = w;
  bmp.height = h;
  clipCanvas.width = w;
  clipCanvas.height = h;
  layers.length = 0;
  addLayer();
  layers.forEach((l) => {
    l.width = w;
    l.height = h;
    l.getContext("2d").clearRect(0, 0, w, h);
  });
  const bgctx = layers[0].getContext("2d");
  bgctx.fillStyle = bg;
  bgctx.fillRect(0, 0, w, h);
  renderLayers();
  fitToScreen();
  updateLayerList();
}

function openImageFile(file) {
  const img = new Image();
  img.onload = () => {
    initDocument(img.naturalWidth, img.naturalHeight, "#ffffff");
    layers[activeLayer].getContext("2d").drawImage(img, 0, 0);
    renderLayers();
    engine.clearSelection();
    fitToScreen();
    engine.requestRepaint();
    saveSessionDebounced();
  };
  img.src = URL.createObjectURL(file);
}

function downloadDataURL(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

document.getElementById("savePNG").addEventListener("click", () => {
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const cctx = c.getContext("2d");
  flattenLayers(cctx);
  downloadDataURL(c.toDataURL("image/png"), "image.png");
});

document.getElementById("saveJPG").addEventListener("click", () => {
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const cctx = c.getContext("2d");
  cctx.fillStyle = "#ffffff";
  cctx.fillRect(0, 0, c.width, c.height);
  flattenLayers(cctx);
  downloadDataURL(c.toDataURL("image/jpeg", 0.92), "image.jpg");
});

document.getElementById("saveWEBP").addEventListener("click", () => {
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const cctx = c.getContext("2d");
  flattenLayers(cctx);
  downloadDataURL(c.toDataURL("image/webp", 0.92), "image.webp");
});

/* ===== Clipboard: Copy / Cut / Paste ===== */

async function doCopy() {
  const sel = engine.selection;
  let srcCanvas = null;
  if (sel) {
    const { x, y, w, h } = sel.rect;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cctx = c.getContext("2d");
    if (sel.floatCanvas) {
      cctx.drawImage(sel.floatCanvas, 0, 0);
    } else {
      const ctx = layers[activeLayer].getContext("2d");
      const img = ctx.getImageData(x, y, w, h);
      cctx.putImageData(img, 0, 0);
    }
    srcCanvas = c;
  } else {
    srcCanvas = bmp;
  }
  try {
    const blob = await new Promise((res) =>
      srcCanvas.toBlob(res, "image/png")
    );
    if (!blob) throw new Error("blob null");
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    updateStatus("コピー完了");
  } catch (e) {
    updateStatus("コピー不可（権限/ブラウザ制限）");
  }
}

async function doCut() {
  const sel = engine.selection;
  if (!sel) {
    updateStatus("選択がないためカット不可");
    return;
  }
  await doCopy();
  // クリア＆履歴
  const { x, y, w, h } = sel.rect;
  const ctx = layers[activeLayer].getContext("2d");
  const before = ctx.getImageData(x, y, w, h);
  ctx.clearRect(x, y, w, h);
  const after = ctx.getImageData(x, y, w, h);
  engine.history.pushPatch({ rect: { x, y, w, h }, before, after });
  engine.clearSelection();
  engine.requestRepaint();
  saveSessionDebounced();
}

window.addEventListener("paste", async (e) => {
  if (e.clipboardData) {
    const items = [...e.clipboardData.items].filter((it) =>
      it.type.startsWith("image/")
    );
    if (items.length) {
      e.preventDefault();
      const file = items[0].getAsFile();
      if (file) pasteImageFile(file);
    }
  } else if (navigator.clipboard && navigator.clipboard.read) {
    try {
      const items = await navigator.clipboard.read();
      handleClipboardItems(items);
    } catch { }
  }
});

function handleClipboardItems(items) {
  for (const item of items) {
    for (const type of item.types) {
      if (type.startsWith("image/")) {
        item.getType(type).then((blob) => pasteImageFile(blob));
        return;
      }
    }
  }
}

function pasteImageFile(file) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    // 中央にフロートで貼り付け
    const cx = bmp.width / 2 - c.width / 2,
      cy = bmp.height / 2 - c.height / 2;
    engine.selection = {
      rect: {
        x: Math.floor(cx),
        y: Math.floor(cy),
        w: c.width,
        h: c.height,
      },
      floatCanvas: c,
      pos: { x: Math.floor(cx), y: Math.floor(cy) },
    };
    engine.requestRepaint();
    saveSessionDebounced();
  };
  img.src = URL.createObjectURL(file);
}

//#endregion

//#region Adjustments: UI + Preview + Apply

/* ===== Adjustments: UI + Preview + Apply ===== */
const adjPanel = document.getElementById("adjustPanel");
const adjBtn = document.getElementById("adjustBtn");
const brightnessEl = document.getElementById("adjBrightness");
const contrastEl = document.getElementById("adjContrast");
const saturationEl = document.getElementById("adjSaturation");
const hueEl = document.getElementById("adjHue");
const invertEl = document.getElementById("adjInvert");

setAdjustCallbacks({
  onOpen: () => startFilterPreview(),
  onClose: () => clearFilterPreview(),
  onUpdate: () => updateFilterPreview(),
  onCancel: () => clearFilterPreview(),
  onApply: () => {
    applyFilter();
    resetAdjustUIToDefaults();
    saveSessionDebounced();
  }
});

function resetAdjustUIToDefaults() {
  brightnessEl.value = 0;
  contrastEl.value = 0;
  saturationEl.value = 0;
  hueEl.value = 0;
  invertEl.checked = false;
}

function startFilterPreview() {
  updateFilterPreview();
}

function clearFilterPreview() {
  engine.filterPreview = null;
  engine.requestRepaint();
}

function updateFilterPreview() {
  const sel = engine.selection;
  const params = {
    brightness: +brightnessEl.value, // [-100..100]
    contrast: +contrastEl.value, // [-100..100]
    saturation: +saturationEl.value, // [-100..100]
    hue: +hueEl.value, // [-180..180]
    invert: invertEl.checked ? 1 : 0,
  };
  if (sel && sel.floatCanvas) {
    const src = sel.floatCanvas;
    const can = applyFilterToCanvas(src, params);
    engine.filterPreview = { canvas: can, x: sel.pos.x, y: sel.pos.y };
  } else if (sel) {
    const { x, y, w, h } = sel.rect;
    const src = document.createElement("canvas");
    src.width = w;
    src.height = h;
    src.getContext("2d").drawImage(bmp, x, y, w, h, 0, 0, w, h);
    const can = applyFilterToCanvas(src, params);
    engine.filterPreview = { canvas: can, x, y };
  } else {
    const src = bmp;
    const can = applyFilterToCanvas(src, params);
    engine.filterPreview = { canvas: can, x: 0, y: 0 };
  }
  engine.requestRepaint();
}

function applyFilter() {
  if (!engine.filterPreview) {
    return;
  }
  const { canvas, x, y } = engine.filterPreview;
  if (engine.selection && engine.selection.floatCanvas) {
    // フロートはそのまま置換（履歴は後で合成時）
    const sel = engine.selection;
    sel.floatCanvas = canvas; // 置き換え
    engine.filterPreview = null;
    engine.requestRepaint();
  } else {
    // before/after で履歴登録
    engine.beginStrokeSnapshot();
    const w = canvas.width,
      h = canvas.height;
    const ctx = layers[activeLayer].getContext("2d");
    const before = ctx.getImageData(x, y, w, h);
    ctx.clearRect(x, y, w, h);
    ctx.drawImage(canvas, x, y);
    const after = ctx.getImageData(x, y, w, h);
    engine.history.pushPatch({ rect: { x, y, w, h }, before, after });
    engine.filterPreview = null;
    engine.requestRepaint();
  }
}

/* ===== Filter core (CPU) ===== */
function applyFilterToCanvas(srcCanvas, p) {
  const w = srcCanvas.width,
    h = srcCanvas.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const sctx = srcCanvas.getContext("2d");
  const dctx = out.getContext("2d");
  const img = sctx.getImageData(0, 0, w, h);
  const d = img.data;

  const b = p.brightness / 100; // add in [ -1 .. 1 ]
  //const c = Math.tan(((p.contrast / 100) * Math.PI) / 4); // contrast factor
  const c = 1 + (p.contrast / 100); // 0 → 1.0（無変化）
  const sat = 1 + p.saturation / 100; // multiply
  const hue = ((p.hue || 0) * Math.PI) / 180; // radians
  const inv = p.invert ? 1 : 0;


  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255,
      g = d[i + 1] / 255,
      bch = d[i + 2] / 255,
      a = d[i + 3] / 255;

    // brightness (add)
    r = r + b;
    g = g + b;
    bch = bch + b;

    // contrast around 0.5 -> remap to [-1..1] domain centered at 0
    r = 0.5 + c * (r - 0.5);
    g = 0.5 + c * (g - 0.5);
    bch = 0.5 + c * (bch - 0.5);

    // to HSV for hue/sat
    let {
      h: sH,
      s: sS,
      v: sV,
    } = rgb2hsv(clamp01(r), clamp01(g), clamp01(bch));
    sH = (sH + hue / (2 * Math.PI)) % 1;
    if (sH < 0) sH += 1;
    sS = clamp01(sS * sat);
    ({ r, g, b: bch } = hsv2rgb(sH, sS, sV));

    // invert
    if (inv) {
      r = 1 - r;
      g = 1 - g;
      bch = 1 - bch;
    }

    d[i] = Math.round(clamp01(r) * 255);
    d[i + 1] = Math.round(clamp01(g) * 255);
    d[i + 2] = Math.round(clamp01(bch) * 255);
    d[i + 3] = Math.round(clamp01(a) * 255);
  }
  dctx.putImageData(img, 0, 0);
  return out;
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function rgb2hsv(r, g, b) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6),
    f = h * 6 - i,
    p = v * (1 - s),
    q = v * (1 - f * s),
    t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return { r: v, g: t, b: p };
    case 1:
      return { r: q, g: v, b: p };
    case 2:
      return { r: p, g: v, b: t };
    case 3:
      return { r: p, g: q, b: v };
    case 4:
      return { r: t, g: p, b: v };
    case 5:
      return { r: v, g: p, b: q };
  }
}


//#endregion

/* ===== Session (IndexedDB): autosave / restore ===== */
const DB_NAME = "paintdb",
  STORE = "kv",
  KEY = "autosave";

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function saveSession() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const cctx = c.getContext("2d");
    flattenLayers(cctx);
    const dataURL = c.toDataURL("image/png");
    store.put(
      { dataURL, width: bmp.width, height: bmp.height, ts: Date.now() },
      KEY
    );
    await tx.complete;
    updateAutosaveBadge("AutoSave: " + nowFmt());
  } catch (e) {
    updateAutosaveBadge("AutoSave: 失敗");
  }
}

let saveTimer = null;
function saveSessionDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSession, 800);
}

async function getSessionData() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const data = await new Promise((res, rej) => {
      const g = store.get(KEY);
      g.onsuccess = () => res(g.result);
      g.onerror = () => rej(g.error);
    });
    return data;
  } catch (e) {
    return null;
  }
}

async function restoreSession() {
  const data = await getSessionData();
  if (data && data.dataURL) {
    const img = new Image();
    img.onload = () => {
      initDocument(data.width, data.height, "#ffffff");
      layers[activeLayer].getContext("2d").drawImage(img, 0, 0);
      renderLayers();
      fitToScreen();
      engine.requestRepaint();
      updateAutosaveBadge("Restored: " + nowFmt());
      showRestoreButton(false);
    };
    img.src = data.dataURL;
  }
}

async function checkSession() {
  const data = await getSessionData();
  if (data && data.dataURL) {
    showRestoreButton(true);
  }
}

window.addEventListener("beforeunload", () => {
  saveSession();
});

setInterval(saveSession, 15000); // 15秒ごとに自動保存



/* ===== fit / resize / boot ===== */
function fitToScreen() {
  const area = getCanvasArea();
  if (!area) return;
  const r = area.getBoundingClientRect();
  const zx = r.width / bmp.width,
    zy = r.height / bmp.height;
  vp.zoom = Math.min(zx, zy);
  const c = { x: bmp.width / 2, y: bmp.height / 2 };
  const scr = vp.imageToScreen(c.x, c.y);
  vp.panX += r.width / 2 - scr.x;
  vp.panY += r.height / 2 - scr.y;
  engine.requestRepaint();
}

function bootOnceAreaReady(tryLeft = 10) {
  const area = getCanvasArea();
  if (!area) {
    if (tryLeft > 0) return setTimeout(() => bootOnceAreaReady(tryLeft - 1), 100);
    return;
  }
  const ro = new ResizeObserver(() => engine.requestRepaint());
  ro.observe(area);
  initToolbar();
  initAdjustPanel();
  initLayerPanel();
  initDocument(1280, 720, "#ffffff");
  engine.requestRepaint();
  checkSession();
}
window.addEventListener('load', () => bootOnceAreaReady());
