import { layers, activeLayer, bmp, renderLayers } from './layer.js';
import { clamp, dpr, resizeCanvasToDisplaySize } from './utils/helpers.js';
import { cancelTextEditing, getActiveEditor } from './managers/text-editor.js';
import { openImageFile } from './io.js';
import { updateStatus, updateZoom } from './gui/statusbar.js';

/* ===== history ===== */
class History {
  constructor() {
    this.stack = [];
    this.index = -1;
  }
  pushPatch(p) {
    this.stack.length = this.index + 1;
    this.stack.push(p);
    this.index++;
  }
  undo() {
    if (this.index < 0) return null;
    return this.stack[this.index--];
  }
  redo() {
    if (this.index >= this.stack.length - 1) return null;
    return this.stack[++this.index];
  }
}

/* ===== engine ===== */
export class Engine {
  constructor(store, vp, eventBus) {
    this.store = store;
    this.vp = vp;
    this.eventBus = eventBus;
    this.history = new History();
    this.tools = new Map();
    this.current = null;
    this.selection = null;
    this._antsPhase = 0;
    this._preStrokeCanvas = null;
    this._pendingRect = null;
    this.filterPreview = null; // {canvas, x, y}
    this._bindEvents();
    this.requestRepaint = this.requestRepaint.bind(this);
    const tick = () => {
      this._antsPhase = (this._antsPhase + 1) % 16;
      this.requestRepaint();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  get ctx() {
    return layers[activeLayer].getContext("2d", {
      willReadFrequently: true,
    });
  }
  setTool(id) {
    if (this.current && this.current.cancel) this.current.cancel();
    this.current = this.tools.get(id);
    base.style.cursor = this.current?.cursor || "default";
  }
  register(t) {
    this.tools.set(t.id, t);
  }
  clearSelection() {
    this.selection = null;
    this.current && (this.current.previewRect = null);
  }
  pointInRect(p, r) {
    return p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
  }
  updateCursorInfo(pos) {
    updateStatus(`x:${Math.floor(pos.img.x)}, y:${Math.floor(pos.img.y)}  線:${this.store.getState().primaryColor} 塗:${document.getElementById("color2").value}  幅:${this.store.getState().brushSize}`);
  }

  beginStrokeSnapshot() {
    this._preStrokeCanvas = document.createElement("canvas");
    const layer = layers[activeLayer];
    this._preStrokeCanvas.width = layer.width;
    this._preStrokeCanvas.height = layer.height;
    this._preStrokeCanvas.getContext("2d").drawImage(layer, 0, 0);
    this._strokeLayer = activeLayer;
    this._pendingRect = null;
  }
  expandPendingRectByRect(x, y, w, h) {
    const minX = Math.max(0, Math.floor(x)),
      minY = Math.max(0, Math.floor(y)),
      maxX = Math.min(bmp.width, Math.ceil(x + w)),
      maxY = Math.min(bmp.height, Math.ceil(y + h));
    if (!this._pendingRect)
      this._pendingRect = { minX, minY, maxX, maxY };
    else {
      this._pendingRect.minX = Math.min(this._pendingRect.minX, minX);
      this._pendingRect.minY = Math.min(this._pendingRect.minY, minY);
      this._pendingRect.maxX = Math.max(this._pendingRect.maxX, maxX);
      this._pendingRect.maxY = Math.max(this._pendingRect.maxY, maxY);
    }
  }
  expandPendingRect(x, y, r = 1) {
    this.expandPendingRectByRect(x - r * 2, y - r * 2, r * 4, r * 4);
  }
  finishStrokeToHistory() {
    if (!this._preStrokeCanvas || !this._pendingRect) {
      this._preStrokeCanvas = null;
      this._pendingRect = null;
      return;
    }
    const rect = {
      x: this._pendingRect.minX,
      y: this._pendingRect.minY,
      w: Math.max(1, this._pendingRect.maxX - this._pendingRect.minX),
      h: Math.max(1, this._pendingRect.maxY - this._pendingRect.minY),
    };
    const pre = this._preStrokeCanvas
      .getContext("2d")
      .getImageData(rect.x, rect.y, rect.w, rect.h);
    const layer = layers[this._strokeLayer];
    const aft = layer
      .getContext("2d")
      .getImageData(rect.x, rect.y, rect.w, rect.h);
    this.history.pushPatch({
      layer: this._strokeLayer,
      rect,
      before: pre,
      after: aft,
    });
    this._preStrokeCanvas = null;
    this._pendingRect = null;
    renderLayers();
  }

  requestRepaint() {
    renderLayers();
    const area = getCanvasArea();
    if (!area) return;
    const css = area.getBoundingClientRect();
    resizeCanvasToDisplaySize(base, css.width, css.height);
    resizeCanvasToDisplaySize(overlay, css.width, css.height);
    const ratio = dpr();
    const ctx = base.getContext("2d");
    const aa = this.store.getState().antialias;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, base.width, base.height);
    ctx.setTransform(
      ratio * this.vp.zoom,
      0,
      0,
      ratio * this.vp.zoom,
      ratio * this.vp.panX,
      ratio * this.vp.panY
    );
    ctx.imageSmoothingEnabled = aa;
    ctx.drawImage(bmp, 0, 0);

    const octx = overlay.getContext("2d");
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.setTransform(
      ratio * this.vp.zoom,
      0,
      0,
      ratio * this.vp.zoom,
      ratio * this.vp.panX,
      ratio * this.vp.panY
    );
    octx.imageSmoothingEnabled = aa;
    const rendering = aa ? "auto" : "pixelated";
    base.style.imageRendering = rendering;
    overlay.style.imageRendering = rendering;

    // 調整プレビュー
    if (this.filterPreview) {
      const { canvas, x, y } = this.filterPreview;
      octx.drawImage(canvas, x || 0, y || 0);
    }

    if (this.current && this.current.drawPreview) {
      this.current.drawPreview(octx);
    }

    // 選択の蟻枠／フロート
    if (this.selection) {
      const sel = this.selection;
      if (sel.floatCanvas) {
        octx.drawImage(sel.floatCanvas, sel.pos.x, sel.pos.y);
      }
      const r = this.current?.previewRect || sel.rect;
      if (r) {
        this.drawAnts(octx, r);
      }
    }
    // エディタDOMの変換
    editorLayer.style.transform = `translate(${this.vp.panX}px, ${this.vp.panY}px) scale(${this.vp.zoom})`;
    updateZoom(Math.round(this.vp.zoom * 100));
  }
  drawAnts(octx, r) {
    octx.save();
    octx.lineWidth = 1;
    octx.strokeStyle = "#000";
    octx.setLineDash([6, 4]);
    octx.lineDashOffset = -this._antsPhase;
    octx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
    octx.strokeStyle = "#fff";
    octx.lineDashOffset = 6 - this._antsPhase;
    octx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
    octx.restore();
  }

  undo() {
    const p = this.history.undo();
    if (!p) return;
    layers[p.layer]
      .getContext("2d")
      .putImageData(p.before, p.rect.x, p.rect.y);
    renderLayers();
    this.requestRepaint();
  }
  redo() {
    const p = this.history.redo();
    if (!p) return;
    layers[p.layer]
      .getContext("2d")
      .putImageData(p.after, p.rect.x, p.rect.y);
    renderLayers();
    this.requestRepaint();
  }

  _bindEvents() {
    let lastClickTS = 0,
      lastClickX = 0,
      lastClickY = 0,
      lastClickCount = 0;
    const DC_TIME = 350; // 350ms以内なら連続クリック扱い
    const DC_DIST = 4; // 4px以内なら同じ位置とみなす

    const pointer = (e) => {
      const r = base.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const img = this.vp.screenToImage(sx, sy);

      let detail;
      if (e.type === "pointerdown" && e.button === 0) {
        const now = e.timeStamp || performance.now();
        const dt = now - lastClickTS;
        const dx = sx - lastClickX;
        const dy = sy - lastClickY;
        if (dt <= DC_TIME && dx * dx + dy * dy <= DC_DIST * DC_DIST) {
          lastClickCount = Math.min(lastClickCount + 1, 2);
        } else {
          lastClickCount = 1;
        }
        lastClickTS = now;
        lastClickX = sx;
        lastClickY = sy;
        detail = lastClickCount;
      } else {
        detail = e.detail || 0;
      }

      return {
        sx,
        sy,
        img,
        button: e.button,
        detail,
        shift: e.shiftKey,
        ctrl: e.ctrlKey || e.metaKey,
        alt: e.altKey,
        pressure: e.pressure,
        pointerId: e.pointerId,
        type: e.type,
      };
    };

    const area = getCanvasArea();
    if (!area) return;
    area.addEventListener("pointerdown", (e) => {
      const p = pointer(e);
      if (e.button === 1 || (p.ctrl && e.button === 0)) {
        isPanning = true;
        lastS = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
        base.style.cursor = "grabbing";
        return;
      }
      this.current?.onPointerDown(this.ctx, p, this);
      this.requestRepaint();
      this.updateCursorInfo(p);
    });

    area.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.current?.cancel?.();
      this.requestRepaint();
    });

    area.addEventListener("pointermove", (e) => {
      const p = pointer(e);
      if (isPanning && lastS) {
        const dx = e.clientX - lastS.x,
          dy = e.clientY - lastS.y;
        this.vp.panX += dx;
        this.vp.panY += dy;
        lastS = { x: e.clientX, y: e.clientY };
        this.requestRepaint();
        this.updateCursorInfo(p);
        return;
      }
      this.current?.onPointerMove(this.ctx, p, this);
      this.requestRepaint();
      this.updateCursorInfo(p);
    });
    area.addEventListener("pointerup", (e) => {
      if (
        e.currentTarget.hasPointerCapture &&
        e.currentTarget.hasPointerCapture(e.pointerId)
      ) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (isPanning) {
        isPanning = false;
        return;
      }
      const p = pointer(e);
      this.current?.onPointerUp(this.ctx, p, this);
      this.finishStrokeToHistory();
      this.requestRepaint();
    });
    area.addEventListener(
      "wheel",
      (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        const rect = base.getBoundingClientRect();
        const sx = e.clientX - rect.left,
          sy = e.clientY - rect.top;
        const before = this.vp.screenToImage(sx, sy);
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.vp.zoom = clamp(this.vp.zoom * factor, 0.1, 32);
        const after = this.vp.imageToScreen(before.x, before.y);
        this.vp.panX += sx - after.x;
        this.vp.panY += sy - after.y;
        this.requestRepaint();
      },
      { passive: false }
    );

    window.addEventListener("keydown", (e) => {
      // ★ テキスト編集中はショートカットを殺す（Escだけ通す）
      if (getActiveEditor()) {
        if (e.code === "Escape") {
          e.preventDefault();
          cancelTextEditing(false, layers, activeLayer, this);
          this.requestRepaint();
        }
        return; // ← P/T/Space/Undo など全部無効
      }

      if (e.code === "Escape") {
        e.preventDefault();
        this.current?.cancel?.();
        this.requestRepaint();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        spaceDown = true;
        base.style.cursor = "grab";
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        e.preventDefault();
        this.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") {
        e.preventDefault();
        this.redo();
      }
      if (e.code === "KeyP") selectTool("pencil");
      if (e.code === "KeyB") selectTool("brush");
      if (e.code === "KeyT") selectTool("text");
      if (e.key === "Enter") {
        e.preventDefault();
        this.current?.onEnter?.(this.ctx, this);
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        spaceDown = false;
        base.style.cursor = this.current?.cursor || "default";
      }
    });

    // DnD open
    area.addEventListener("dragover", (e) => e.preventDefault());
    area.addEventListener("drop", (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) openImageFile(f);
    });
  }
}
