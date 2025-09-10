import { initToolbar, setToolCallbacks, bindParameterControls } from './gui/toolbar.js';
import { initAdjustPanel, initLayerPanel, setAdjustCallbacks, setLayerCallbacks } from './gui/panels.js';
import { updateStatus, updateZoom } from './gui/statusbar.js';
import { Engine } from './engine.js';
import { bmp, clipCanvas, layers, activeLayer, flattenLayers, renderLayers, updateLayerList, addLayer, deleteLayer } from './layer.js';
import { catmullRomSpline } from './spline.js';
import { applyFilterToCanvas } from './filters.js';
import { initIO, initDocument, openImageFile, triggerSave, doCopy, doCut, handleClipboardItems, restoreSession, checkSession, saveSessionDebounced } from './io.js';

window.bmp = bmp;

/* ===== helpers ===== */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dpr = () => window.devicePixelRatio || 1;
const toHex = (r, g, b) =>
  "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");

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
initIO(engine, fitToScreen);

//#region UI bind
/* ===== UI bind ===== */
// ツールバーコールバックの設定
setToolCallbacks({
  onToolChange: toolId => {
    store.set({ toolId });
    engine.setTool(toolId);
  },
  onOpenFile: file => openImageFile(file),
  onSave: format => triggerSave(format),
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
  onAdd: () => addLayer(engine),
  onDelete: () => deleteLayer(engine)
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

//#endregion




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
