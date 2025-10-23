import { initToolbar, setToolCallbacks } from './gui/toolbar.js';
import { initToolPropsPanel } from './gui/tool-props.js';
import { initShortcutOverlay } from './gui/shortcuts-overlay.js';
import {
  initAdjustPanel,
  initLayerPanel,
  setAdjustCallbacks,
  setLayerCallbacks,
  initPanelHeaders,
  setLayerPropertiesCallbacks,
  updateLayerProperties,
} from './gui/panels.js';

import { Engine } from './core/engine.js';
import {
  layers,
  activeLayer,
  bmp,
  renderLayers,
  addLayer,
  deleteLayer,
  addVectorLayer,
} from './core/layer.js';
import { initIO, initDocument, openImageFile, triggerSave, doCopy, doCut, handleClipboardItems, restoreSession, checkSession, saveSessionDebounced } from './io/index.js';
import { DOMManager } from './managers/dom-manager.js';
import { Viewport } from './core/viewport.js';
import { createStore, defaultState } from './core/store.js';
import { EventBus } from './core/event-bus.js';
import { registerDefaultTools } from './tools/_base/registry.js';
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
    this.init();
  }

  init() {
    this.domManager.initEventListeners();
    initIO(this.engine, () => this.fitToScreen());
    this.registerTools();
    this.initUI();
    this.adjustmentManager = new AdjustmentManager(this.engine, layers, activeLayer);
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
      onUndo: () => this.engine.undo(),
      onRedo: () => this.engine.redo(),
      onClear: () => this.clear(),
      onFitToScreen: () => this.fitToScreen(),
      onActualSize: () => {
        this.viewport.resetView();
        this.engine.requestRepaint();
      },
      onCopy: () => doCopy(),
      onCut: () => doCut(),
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
    this.engine.requestRepaint();
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
    initToolbar();
    initAdjustPanel();
    initLayerPanel();
    initPanelHeaders();
    initShortcutOverlay();
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
