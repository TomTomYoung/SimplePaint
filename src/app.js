import { initToolbar, setToolCallbacks } from './gui/toolbar.js';
import { initToolPropsPanel } from './gui/tool-props.js';
import { initShortcutOverlay } from './gui/shortcuts-overlay.js';
import { initToolSearchOverlay } from './gui/tool-search-overlay.js';
import { initToolDropdowns } from './gui/tool-dropdowns.js';
import {
  initAdjustPanel,
  initLayerPanel,
  setAdjustCallbacks,
  setLayerCallbacks,
  initPanelHeaders,
  setLayerPropertiesCallbacks,
  updateLayerProperties,
} from './gui/panels.js';
import { initWorkspaceLayoutControls } from './gui/workspace-layout.js';

import { Engine } from './core/engine.js';
import {
  layers,
  activeLayer,
  bmp,
  clipCanvas,
  renderLayers,
  addLayer,
  deleteLayer,
  addVectorLayer,
  markLayerPreviewDirty,
} from './core/layer.js';
import { initIO, initDocument, openImageFile, triggerSave, doCopy, doCut, handleClipboardItems, restoreSession, checkSession, saveSessionDebounced } from './io/index.js';
import { DOMManager } from './managers/dom-manager.js';
import { Viewport } from './core/viewport.js';
import { createStore, defaultState } from './core/store.js';
import { EventBus } from './core/event-bus.js';
import { registerDefaultTools } from './tools/base/registry.js';
import { AdjustmentManager } from './managers/adjustment-manager.js';
import { cancelTextEditing, getActiveEditor } from './managers/text-editor.js';
import { applyDefaultStyleToCurves, cloneVectorLayer, updateLayerDefaultStyle } from './core/vector-layer-state.js';

export class PaintApp {
  constructor() {
    this.domManager = new DOMManager();
    window.getCanvasArea = () => this.domManager.getCanvasArea();
    this.eventBus = new EventBus();
    this.store = createStore(defaultState, this.eventBus);
    this.viewport = new Viewport();
    this.engine = new Engine(this.store, this.viewport, this.eventBus);
    this.adjustmentManager = null;
    this.selectionScope = 'layer';
    this.init();
  }

  init() {
    this.domManager.initEventListeners();
    initIO(this.engine, () => this.fitToScreen());
    this.registerTools();
    this.initUI();
    this.adjustmentManager = new AdjustmentManager(this.engine, layers);
    this.setupVectorLayerSync();
  }

  registerTools() {
    registerDefaultTools(this.engine, this.store);
    this.store.setToolState('smudge', {
      radius: 16,
      strength: 0.5,
      dirMode: 'tangent',
      angle: 0,
      spacingRatio: 0.5,
    });
  }

  initUI() {
    this.setupToolbarCallbacks();
    this.setupLayerCallbacks();
    this.setupAdjustmentCallbacks();
  }

  setupToolbarCallbacks() {
    setToolCallbacks({
      onToolChange: id => this.selectTool(id),
      onOpenFile: file => openImageFile(file),
      onSave: format => triggerSave(format),
      onNewDocument: () => initDocument(1280, 720, '#ffffff'),
      onUndo: () => this.engine.undo(),
      onRedo: () => this.engine.redo(),
      onClear: () => this.clear(),
      onClearAll: () => this.clearAllLayers(),
      onResizeCanvas: () => this.resizeCanvasPrompt(),
      onFlipCanvas: dir => this.flipCanvas(dir),
      onCropSelection: scope => this.cropSelection(scope),
      onAffineSelection: (scope, mode) => this.affineSelection(scope, mode),
      onSelectionScopeChange: scope => { this.selectionScope = scope; },
      onAddLayer: () => addLayer(this.engine),
      onAddVectorLayer: () => addVectorLayer(this.engine),
      onDeleteLayer: () => deleteLayer(this.engine),
      onFitToScreen: () => this.fitToScreen(),
      onActualSize: () => {
        this.viewport.resetView();
        this.engine.requestRepaint();
      },
      onCopy: () => this.copySelection(),
      onCut: () => this.cutSelection(),
      onPaste: () => navigator.clipboard?.read?.().then(handleClipboardItems).catch(() => {}),
      onRestore: () => restoreSession(),
      isTextEditing: () => getActiveEditor() !== null,
      onCancelText: () => {
        cancelTextEditing(false, layers, activeLayer, this.engine);
        this.engine.requestRepaint();
      },
      onCancel: () => this.engine.current?.cancel?.(),
      onEnter: () => this.engine.current?.onEnter?.(this.engine.ctx, this.engine),
      onSpaceDown: () => base.style.cursor = 'grab',
      onSpaceUp: () => base.style.cursor = this.engine.current?.cursor || 'default',
    });
  }

  // パラメータコントロールは左パネルで管理するため不要
  setupParameterControls() {}

  setupLayerCallbacks() {
    setLayerCallbacks({
      onAdd: () => addLayer(this.engine),
      onAddVector: () => addVectorLayer(this.engine),
      onDelete: () => deleteLayer(this.engine)
    });

    setLayerPropertiesCallbacks({
      onStyleChange: style => this.updateVectorLayerStyle(style),
      onApplyStyle: () => this.applyVectorStyleToAll(),
    });
  }

  setupAdjustmentCallbacks() {
    setAdjustCallbacks({
      onOpen: () => this.adjustmentManager.startPreview(),
      onClose: () => this.adjustmentManager.clearPreview(),
      onUpdate: () => this.adjustmentManager.updatePreview(),
      onCancel: () => this.adjustmentManager.clearPreview(),
      onApply: () => {
        this.adjustmentManager.applyFilter();
        this.adjustmentManager.resetToDefaults();
        saveSessionDebounced();
      }
    });
  }


  selectTool(id) {
    cancelTextEditing(false, layers, activeLayer, this.engine);
    this.store.set({ toolId: id });
    document
      .querySelectorAll('.tool')
      .forEach(b => b.classList.toggle('active', b.dataset.tool === id));
    this.engine.setTool(id);
  }

  fitToScreen() {
    const area = this.domManager.getCanvasArea();
    if (!area) return;
    const rect = area.getBoundingClientRect();
    this.viewport.fitToScreen(bmp.width, bmp.height, rect);
    this.engine.requestRepaint();
  }

  clear() {
    cancelTextEditing(false, layers, activeLayer, this.engine);
    const ctx = layers[activeLayer].getContext('2d');
    const before = ctx.getImageData(0, 0, bmp.width, bmp.height);
    ctx.clearRect(0, 0, bmp.width, bmp.height);
    if (activeLayer === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, bmp.width, bmp.height);
    }
    const after = ctx.getImageData(0, 0, bmp.width, bmp.height);
    this.engine.history.pushPatch({
      layer: activeLayer,
      rect: { x: 0, y: 0, w: bmp.width, h: bmp.height },
      before,
      after,
    });
    renderLayers();
    markLayerPreviewDirty(activeLayer);
    this.engine.requestRepaint();
  }

  clearAllLayers() {
    cancelTextEditing(false, layers, activeLayer, this.engine);
    layers.forEach((layer, idx) => {
      const ctx = layer.getContext('2d');
      ctx.clearRect(0, 0, bmp.width, bmp.height);
      if (idx === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, bmp.width, bmp.height);
      }
      markLayerPreviewDirty(idx);
    });
    this.engine.clearSelection();
    renderLayers();
    this.engine.requestRepaint();
  }

  resizeCanvasPrompt() {
    const width = parseInt(prompt('キャンバス幅(px)', bmp.width) || '', 10);
    const height = parseInt(prompt('キャンバス高さ(px)', bmp.height) || '', 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    this.resizeCanvas(width, height);
  }

  resizeCanvas(width, height) {
    if (width === bmp.width && height === bmp.height) return;
    layers.forEach(layer => {
      const snapshot = document.createElement('canvas');
      snapshot.width = layer.width;
      snapshot.height = layer.height;
      snapshot.getContext('2d').drawImage(layer, 0, 0);

      layer.width = width;
      layer.height = height;
      const ctx = layer.getContext('2d');
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, width, height);
    });

    bmp.width = width;
    bmp.height = height;
    clipCanvas.width = width;
    clipCanvas.height = height;
    this.engine.clearSelection();
    renderLayers();
    markLayerPreviewDirty(activeLayer);
    this.fitToScreen();
    saveSessionDebounced();
  }

  cropSelection(scope = 'layer') {
    const sel = this.engine.selection;
    if (!sel) return;
    const { x, y, w, h } = sel.rect;
    const targets = scope === 'canvas' ? layers : [layers[activeLayer]];
    targets.forEach(layer => {
      if (!layer) return;
      const ctx = layer.getContext('2d');
      const image = ctx.getImageData(x, y, w, h);
      if (scope === 'canvas') {
        layer.width = w;
        layer.height = h;
        ctx.putImageData(image, 0, 0);
      } else {
        ctx.clearRect(0, 0, layer.width, layer.height);
        ctx.putImageData(image, x, y);
      }
      markLayerPreviewDirty(layer);
    });

    if (scope === 'canvas') {
      bmp.width = w;
      bmp.height = h;
      clipCanvas.width = w;
      clipCanvas.height = h;
    }

    this.engine.clearSelection();
    renderLayers();
    this.engine.requestRepaint();
    saveSessionDebounced();
  }

  affineSelection(scope = 'layer', mode = 'hflip') {
    const sel = this.engine.selection;
    if (!sel) return;
    const { x, y, w, h } = sel.rect;
    const targets = scope === 'canvas' ? layers : [layers[activeLayer]];
    targets.forEach(layer => {
      if (!layer) return;
      const ctx = layer.getContext('2d');
      const snapshot = document.createElement('canvas');
      snapshot.width = w;
      snapshot.height = h;
      snapshot.getContext('2d').drawImage(layer, -x, -y);

      const transformed = document.createElement('canvas');
      transformed.width = w;
      transformed.height = h;
      const tctx = transformed.getContext('2d');
      if (mode === 'vflip') {
        tctx.translate(0, h);
        tctx.scale(1, -1);
      } else {
        tctx.translate(w, 0);
        tctx.scale(-1, 1);
      }
      tctx.drawImage(snapshot, 0, 0);

      ctx.clearRect(x, y, w, h);
      ctx.drawImage(transformed, x, y);
      markLayerPreviewDirty(layer);
    });
    renderLayers();
    this.engine.requestRepaint();
    saveSessionDebounced();
  }

  copySelection(scope) {
    const targetScope = scope ?? this.selectionScope;
    return doCopy(targetScope);
  }

  cutSelection(scope) {
    const targetScope = scope ?? this.selectionScope;
    return doCut(targetScope);
  }

  flipCanvas(direction = 'h') {
    const { width, height } = bmp;
    layers.forEach(layer => {
      if (!layer) return;
      const snapshot = document.createElement('canvas');
      snapshot.width = width;
      snapshot.height = height;
      snapshot.getContext('2d').drawImage(layer, 0, 0);

      const ctx = layer.getContext('2d');
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (direction === 'v') {
        ctx.translate(0, height);
        ctx.scale(1, -1);
      } else {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(snapshot, 0, 0);
      ctx.restore();
      markLayerPreviewDirty(layer);
    });
    renderLayers();
    this.engine.requestRepaint();
    saveSessionDebounced();
  }

  boot() {
    this.bootOnceAreaReady();
  }

  bootOnceAreaReady(tryLeft = 10) {
    const area = this.domManager.getCanvasArea();
    if (!area) {
      if (tryLeft > 0) setTimeout(() => this.bootOnceAreaReady(tryLeft - 1), 100);
      return;
    }
    const ro = new ResizeObserver(() => this.engine.requestRepaint());
    ro.observe(area);
    initToolDropdowns();
    initToolbar();
    initAdjustPanel();
    initLayerPanel();
    initPanelHeaders();
    initWorkspaceLayoutControls();
    initShortcutOverlay();
    initToolSearchOverlay();
    initToolPropsPanel(this.store, this.engine);
    initDocument(1280, 720, '#ffffff');
    this.engine.requestRepaint();
    checkSession();
  }

  setupVectorLayerSync() {
    this._vectorLayerGuard = false;

    this.store.watch(
      state => state.vectorLayer,
      nextLayer => {
        if (this._vectorLayerGuard) {
          this._vectorLayerGuard = false;
          return;
        }
        const layer = layers[activeLayer];
        if (!layer || layer.layerType !== 'vector') {
          updateLayerProperties(layer ?? null);
          return;
        }
        layer.vectorData = cloneVectorLayer(nextLayer);
        updateLayerProperties(layer);
        this.engine.requestRepaint();
      },
      { immediate: true },
    );

    this.eventBus.on('layer:activeChanged', ({ layer }) => {
      if (!layer || layer.layerType !== 'vector') {
        updateLayerProperties(layer ?? null);
        return;
      }
      const snapshot = cloneVectorLayer(layer.vectorData ?? null);
      this._vectorLayerGuard = true;
      this.store.set({ vectorLayer: snapshot });
      updateLayerProperties(layer);
    });
  }

  updateVectorLayerStyle(style = {}) {
    const layer = layers[activeLayer];
    if (!layer || layer.layerType !== 'vector') return;
    const next = updateLayerDefaultStyle(layer.vectorData ?? null, style);
    layer.vectorData = next;
    this._vectorLayerGuard = true;
    this.store.set({ vectorLayer: cloneVectorLayer(next) });
    updateLayerProperties(layer);
    this.engine.requestRepaint();
  }

  applyVectorStyleToAll() {
    const layer = layers[activeLayer];
    if (!layer || layer.layerType !== 'vector') return;
    const next = applyDefaultStyleToCurves(layer.vectorData ?? null);
    layer.vectorData = next;
    this._vectorLayerGuard = true;
    this.store.set({ vectorLayer: cloneVectorLayer(next) });
    updateLayerProperties(layer);
    this.engine.requestRepaint();
  }
}
