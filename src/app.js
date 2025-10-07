import { initToolbar, setToolCallbacks } from './gui/toolbar.js';
import { initToolPropsPanel } from './gui/tool-props.js';
import { initAdjustPanel, initLayerPanel, setAdjustCallbacks, setLayerCallbacks, initPanelHeaders } from './gui/panels.js';

import { Engine } from './core/engine.js';
import { layers, activeLayer, bmp, renderLayers, addLayer, deleteLayer } from './core/layer.js';
import { initIO, initDocument, openImageFile, triggerSave, doCopy, doCut, handleClipboardItems, restoreSession, checkSession, saveSessionDebounced } from './io/index.js';
import { DOMManager } from './managers/dom-manager.js';
import { Viewport } from './core/viewport.js';
import { createStore, defaultState } from './core/store.js';
import { EventBus } from './core/event-bus.js';
import { registerDefaultTools } from './tools/registry.js';
import { AdjustmentManager } from './managers/adjustment-manager.js';
import { cancelTextEditing, getActiveEditor } from './managers/text-editor.js';

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
      onDelete: () => deleteLayer(this.engine)
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
    initToolPropsPanel(this.store, this.engine);
    initDocument(1280, 720, '#ffffff');
    this.engine.requestRepaint();
    checkSession();
  }
}
