import { captureDocumentState, restoreDocumentState } from './document-state.js';
import { layers, activeLayer, bmp, renderLayers, markLayerPreviewDirty } from './layer.js';
import { getDevicePixelRatio, resizeCanvasToDisplaySize } from '../utils/canvas/index.js';
import { getActiveEditor } from '../managers/text-editor.js';
import { openImageFile } from '../io/index.js';
import { updateStatus, updateZoom } from '../gui/statusbar.js';

import { HistoryManager } from '../managers/history-manager.js';

/* ===== engine ===== */
export class Engine {
  constructor(store, vp, eventBus) {
    this.store = store;
    this.vp = vp;
    this.eventBus = eventBus;
    this.history = new HistoryManager();
    this.history.onChange(event => {
      const patch = event.changed?.patch;
      if (event.type === 'push' && patch && Number.isInteger(patch.layer)) {
        patch.layerId ??= layers[patch.layer]?._id;
      }
      for (const [id, enabled] of [['undo', event.canUndo], ['redo', event.canRedo]]) {
        const button = document.getElementById(id);
        if (button) button.disabled = !enabled;
      }
      this.eventBus?.emit('document:changed', event);
    }, { immediate: true });
    this.tools = new Map();
    this.current = null;
    this.selection = null;
    this._antsPhase = 0;
    this._preStrokeCanvas = null;
    this._pendingRect = null;
    this.filterPreview = null; // {canvas, x, y}
    this._modifiers = { shift: false, ctrl: false, alt: false };
    
    this._bindEvents();
    this.requestRepaint = this.requestRepaint.bind(this);


    this.isPanning=false;
    this.lastS=false;

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
    if (this.current?.onModifiersChanged) {
      this.current.onModifiersChanged(this._modifiers, this);
    }
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
  updateBrushCursor(pos) {
    const cursor = document.getElementById('brushCursor');
    if (!cursor) return;
    const state = this.store.getState();
    const size = this.store.getToolState(state.toolId).brushSize;
    const visible = pos && !this.isPanning && ['pencil', 'brush', 'eraser'].includes(state.toolId);
    cursor.hidden = !visible;
    if (!visible) return;
    const diameter = Math.max(1, size * this.vp.zoom);
    Object.assign(cursor.style, { width: `${diameter}px`, height: `${diameter}px`, left: `${pos.sx}px`, top: `${pos.sy}px` });
  }
  updateCursorInfo(pos) {
    this._cursorPosition = pos;
    this.updateBrushCursor(pos);
    const tid = this.store.getState().toolId;
    const ts = this.store.getToolState(tid);
    updateStatus(`x:${Math.floor(pos.img.x)}, y:${Math.floor(pos.img.y)}  線:${ts.primaryColor} 塗:${ts.secondaryColor}  幅:${ts.brushSize}`);
  }

  updateModifierState(mods = {}) {
    const next = {
      shift: !!mods.shift,
      ctrl: !!mods.ctrl,
      alt: !!mods.alt,
    };
    if (
      next.shift === this._modifiers.shift &&
      next.ctrl === this._modifiers.ctrl &&
      next.alt === this._modifiers.alt
    ) {
      return;
    }
    this._modifiers = next;
    this.current?.onModifiersChanged?.(this._modifiers, this);
  }


  performDocumentEdit(label, edit) {
    if (this._documentEdit) return edit();
    const before = captureDocumentState();
    this._documentEdit = true;
    try {
      const result = edit();
      this.history.pushPatch({ type: 'document', before, after: captureDocumentState() }, { label });
      return result;
    } catch (error) {
      restoreDocumentState(before, this);
      throw error;
    } finally {
      this._documentEdit = false;
    }
  }

  beginStrokeSnapshot() {
    if (this._preStrokeCanvas) return;
    this._preStrokeCanvas = document.createElement("canvas");
    const layer = layers[activeLayer];
    this._preStrokeCanvas.width = layer.width;
    this._preStrokeCanvas.height = layer.height;
    this._preStrokeCanvas.getContext("2d").drawImage(layer, 0, 0);
    this._strokeLayer = activeLayer;
    this._pendingRect = null;
  }
  expandPendingRectByRect(x, y, w, h) {
    const minX = Math.min(bmp.width, Math.max(0, Math.floor(x))),
      minY = Math.min(bmp.height, Math.max(0, Math.floor(y))),
      maxX = Math.max(0, Math.min(bmp.width, Math.ceil(x + w))),
      maxY = Math.max(0, Math.min(bmp.height, Math.ceil(y + h)));
    if (maxX <= minX || maxY <= minY) return;
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
      layerId: layer._id,
      rect,
      before: pre,
      after: aft,
    });
    this._preStrokeCanvas = null;
    this._pendingRect = null;
    renderLayers();
    markLayerPreviewDirty(this._strokeLayer);
  }

  requestRepaint() {
    renderLayers();
    const area = getCanvasArea();
    if (!area) return;
    const css = area.getBoundingClientRect();
    resizeCanvasToDisplaySize(base, css.width, css.height);
    resizeCanvasToDisplaySize(overlay, css.width, css.height);
    const ratio = getDevicePixelRatio();
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
    this.updateBrushCursor(this._cursorPosition);
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

  applyHistoryPatch(patch, direction) {
    if (!patch) return;
    this.current?.cancel?.();
    this.clearSelection();
    this._preStrokeCanvas = null;
    this._pendingRect = null;
    if (patch.type === 'document') {
      restoreDocumentState(patch[direction], this);
    } else {
      const target = patch.layerId
        ? layers.find(layer => layer._id === patch.layerId)
        : layers[patch.layer ?? activeLayer];
      if (!target) return;
      target.getContext('2d').putImageData(patch[direction], patch.rect.x, patch.rect.y);
      markLayerPreviewDirty(target);
    }
    this.requestRepaint();
    this.eventBus?.emit('document:changed');
  }
  undo() { this.applyHistoryPatch(this.history.undo(), 'before'); }
  redo() { this.applyHistoryPatch(this.history.redo(), 'after'); }

  _bindEvents() {
    let lastClickTS = 0,
      lastClickX = 0,
      lastClickY = 0,
      lastClickCount = 0;
    const DC_TIME = 350; // 350ms以内なら連続クリック扱い
    const DC_DIST = 4; // 4px以内なら同じ位置とみなす
    let spaceDown = false;

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
      this.updateModifierState(p);

      if (e.button === 1 || (spaceDown && e.button === 0)) {
        this.isPanning = true;
        this.lastS = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
        base.style.cursor = "grabbing";
        return;
      }
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      this.beginStrokeSnapshot();
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
      this.updateModifierState(p);
      if (this.isPanning && this.lastS) {
        const dx = e.clientX - this.lastS.x,
          dy = e.clientY - this.lastS.y;
        this.vp.panBy(dx, dy);
        this.lastS = { x: e.clientX, y: e.clientY };
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
      if (this.isPanning) {
        this.isPanning = false;
        base.style.cursor = spaceDown
          ? "grab"
          : this.current?.cursor || "default";
        return;
      }
      const p = pointer(e);
      this.updateModifierState(p);
      this.current?.onPointerUp(this.ctx, p, this);
      if (!getActiveEditor()) this.finishStrokeToHistory();
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
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.vp.zoomAt(sx, sy, factor);
        this.requestRepaint();
      },
      { passive: false }
    );

    window.addEventListener("keydown", (e) => {
      this.updateModifierState({
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
      });
      if (getActiveEditor()) return;
      if (e.defaultPrevented || e.isComposing ||
          e.target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], dialog')) return;
      if (e.code === "Space") {
        e.preventDefault();
        spaceDown = true;
        base.style.cursor = "grab";
      }
    });

    window.addEventListener("keyup", (e) => {
      this.updateModifierState({
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
      });
      if (e.code === "Space") {
        spaceDown = false;
        base.style.cursor = this.current?.cursor || "default";
      }
    });

    area.addEventListener('pointerleave', () => {
      this._cursorPosition = null;
      this.updateBrushCursor(null);
    });
    area.addEventListener('pointercancel', e => {
      this.current?.onPointerUp?.(this.ctx, pointer(e), this);
      if (this._preStrokeCanvas && layers[this._strokeLayer]) {
        const ctx = layers[this._strokeLayer].getContext('2d');
        ctx.clearRect(0, 0, bmp.width, bmp.height);
        ctx.drawImage(this._preStrokeCanvas, 0, 0);
      }
      this._preStrokeCanvas = null;
      this._pendingRect = null;
      this.isPanning = false;
      this.clearSelection();
      this.requestRepaint();
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
