import { initToolbar, setToolCallbacks } from './gui/toolbar.js';
import { initToolPropsPanel } from './gui/tool-props.js';
import { initAdjustPanel, initLayerPanel, setAdjustCallbacks, setLayerCallbacks, initPanelHeaders } from './gui/panels.js';
import { initMapControls, setMapControlCallbacks, updateEditModeControls, updateZoomControls } from './gui/map-controls.js';
import { Engine } from './engine.js';
import { layers, activeLayer, bmp, renderLayers, addLayer, deleteLayer } from './layer.js';
import { initIO, initDocument, openImageFile, triggerSave, doCopy, doCut, handleClipboardItems, restoreSession, checkSession, saveSessionDebounced } from './io.js';
import { DOMManager } from './managers/dom-manager.js';
import { Viewport } from './core/viewport.js';
import { createStore, defaultState } from './core/store.js';
import { EventBus } from './core/event-bus.js';
import { AdjustmentManager } from './managers/adjustment-manager.js';
import { cancelTextEditing, getActiveEditor } from './managers/text-editor.js';
import { makeEyedropper } from './tools/eyedropper.js';
import { makeBucket } from './tools/bucket.js';
import { makeShape } from './tools/shape.js';
import { makeTextTool } from './tools/text-tool.js';
import { makeCatmull } from './tools/catmull.js';
import { makeBSpline } from './tools/bspline.js';
import { makeNURBS } from './tools/nurbs.js';

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
    this.engine.register(makeSelectRect());
    this.engine.register(makePencil(this.store));
    this.engine.register(makePencilClick(this.store));
    this.engine.register(makeBrush(this.store));
    this.engine.register(makeMinimal(this.store));
    this.engine.register(makeSmooth(this.store));
    this.engine.register(makeTextureBrush(this.store));
    this.engine.register(makeTessellatedStroke(this.store));
    this.engine.register(makeSdfStroke(this.store));
    this.engine.register(makeWatercolor(this.store));
    this.engine.register(makePreviewRefine(this.store));
    this.engine.register(makeVectorKeep(this.store));
    this.engine.register(makeCalligraphy(this.store));
    this.engine.register(makeRibbon(this.store));
    this.engine.register(makeBristle(this.store));
    this.engine.register(makeAirbrush(this.store));
    this.engine.register(makeScatter(this.store));
    this.engine.register(makeSmudge(this.store));
    this.store.setToolState('smudge', {
      radius: 16,
      strength: 0.5,
      dirMode: 'tangent',
      angle: 0,
      spacingRatio: 0.5,
    });
    this.engine.register(makeAaLineBrush(this.store));
    this.engine.register(makePixelBrush(this.store));
    this.engine.register(makeBlurBrush(this.store));
    this.engine.register(makeEdgeAwarePaint(this.store));
    this.engine.register(makeNoiseDisplaced(this.store));
    this.engine.register(makeChalkPastel(this.store));
    this.engine.register(makeCurvatureAdaptiveBrush(this.store));
    this.engine.register(makeDepthAwareBrush(this.store));
    this.engine.register(makeDistanceStampedBrush(this.store));
    this.engine.register(makeDripGravityBrush(this.store));
    this.engine.register(makeFlowGuidedBrush(this.store));
    this.engine.register(makeGlyphBrush(this.store));
    this.engine.register(makeGpuInstancedStampBrush(this.store));
    this.engine.register(makeGradientBrush(this.store));
    this.engine.register(makeGranulationBrush(this.store));
    this.engine.register(makeHalftoneDitherBrush(this.store));
    this.engine.register(makeHatching(this.store));
    this.engine.register(makeHdrLinearPipelineBrush(this.store));
    this.engine.register(makeHeightNormalAwareBrush(this.store));
    this.engine.register(makeMaskDrivenBrush(this.store));
    this.engine.register(makeMetaBrush(this.store));
    this.engine.register(makeOnImageWarp(this.store));
    this.engine.register(makeOutlineStrokeToFill(this.store));
    this.engine.register(makePaletteMappedBrush(this.store));
    this.engine.register(makePatternArtBrush(this.store));
    this.engine.register(makePredictiveBrush(this.store));
    this.engine.register(makePressureVelocityMapBrush(this.store));
    this.engine.register(makeSnapGridBrush(this.store));
    this.engine.register(makeStampBlendModesBrush(this.store));
    this.engine.register(makeStrokeBoilBrush(this.store));
    this.engine.register(makeSymmetryMirror(this.store));
    this.engine.register(makeTimeAwareBrush(this.store));
    this.engine.register(makeVectorizationBrush(this.store));
    this.engine.register(makeEraser(this.store));
    this.engine.register(makeEraserClick(this.store));
    this.engine.register(makeEyedropper(this.store));
    this.engine.register(makeBucket(this.store));
    this.engine.register(makeShape("line", this.store));
    this.engine.register(makeShape("rect", this.store));
    this.engine.register(makeShape("ellipse", this.store));
    this.engine.register(makeQuadratic(this.store));
    this.engine.register(makeCubic(this.store));
    this.engine.register(makeArc(this.store));
    this.engine.register(makeSector(this.store));
    this.engine.register(makeCatmull(this.store));
    this.engine.register(makeBSpline(this.store));
    this.engine.register(makeNURBS(this.store));
    this.engine.register(makeEllipse2(this.store));
    this.engine.register(makeFreehand(this.store));
    this.engine.register(makeFreehandClick(this.store));
    this.engine.register(makeTextTool(this.store));
  }

  initUI() {
    this.setupToolbarCallbacks();
    this.setupLayerCallbacks();
    this.setupAdjustmentCallbacks();
    this.setupMapControls();
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

  setupMapControls() {
    initMapControls();
    updateZoomControls(Math.round(this.viewport.zoom * 100));
    updateEditModeControls(this.engine.editMode);
    setMapControlCallbacks({
      onZoomChange: zoom => {
        const rect = window.base?.getBoundingClientRect?.();
        if (rect) {
          this.engine.zoomTo(zoom, { sx: rect.width / 2, sy: rect.height / 2 });
        } else {
          this.engine.zoomTo(zoom);
        }
      },
      onModeChange: mode => {
        this.engine.setEditMode(mode);
      },
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
