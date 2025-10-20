import { applyStrokeStyle } from '../../utils/stroke-style.js';
import { computeAABB } from '../../utils/geometry/index.js';
import {
  appendCurvesToLayer,
  cloneVectorCurve,
  createEmptyVectorLayer,
} from '../../core/vector-layer-state.js';

const HANDLE_SIZE = 6;
const HANDLE_PADDING = 8;
const HIT_RADIUS_SQ = 64; // 8px radius in image space
const DEFAULT_MODIFIER_STATE = Object.freeze({
  shift: false,
  ctrl: false,
  alt: false,
});

const hasCtrlLikeModifier = (mods = null) =>
  !!(
    mods && (
      mods.ctrl === true ||
      mods.ctrlKey === true ||
      mods.meta === true ||
      mods.metaKey === true
    )
  );

const readShiftModifier = (mods = null) =>
  !!(mods && (mods.shift === true || mods.shiftKey === true));

const readAltModifier = (mods = null) =>
  !!(mods && (mods.alt === true || mods.altKey === true));

const isEditModifierActive = (modifierState, ev = null) =>
  !!(modifierState.ctrl || hasCtrlLikeModifier(ev));

const clonePoint = (p) => ({ x: p.x, y: p.y });
const createEmptyCurve = () => ({ points: [], weights: [] });
const cloneCurve = (curve) => ({
  points: curve.points.map(clonePoint),
  weights: [...curve.weights],
});

const helpers = Object.freeze({
  applyStroke(ctx, state) {
    ctx.lineWidth = state.brushSize;
    ctx.strokeStyle = state.primaryColor;
    applyStrokeStyle(ctx, state);
  },
  drawControlPolygon(ctx, points, options = {}) {
    if (!points || points.length < 2) return;
    const { color = 'rgba(0,0,0,0.35)', lineWidth = 1 } = options;
    ctx.save();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(points[0].x + 0.5, points[0].y + 0.5);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x + 0.5, points[i].y + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  },
  drawHandles(ctx, points, activeIndex = -1) {
    if (!points || !points.length) return;
    const half = HANDLE_SIZE / 2;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    points.forEach((pt, index) => {
      const x = pt.x - half;
      const y = pt.y - half;
      ctx.beginPath();
      ctx.rect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, HANDLE_SIZE, HANDLE_SIZE);
      ctx.fill();
      ctx.stroke();
      if (index === activeIndex) {
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, HANDLE_SIZE, HANDLE_SIZE);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      }
    });
    ctx.restore();
  },
  getHandlePadding() {
    return HANDLE_PADDING;
  },
});

/**
 * @typedef {object} EditableContext
 * @property {string} id
 * @property {{x: number, y: number}[]} points
 * @property {{x: number, y: number} | null} hover
 * @property {number[]} weights
 * @property {number} dragIndex
 * @property {boolean} editMode
 * @property {any} state
 */

/**
 * @param {import('../../core/store.js').Store} store
 * @param {object} options
 * @param {string} options.id
 * @param {number} options.minPoints
 * @param {number} [options.maxPoints=Infinity]
 * @param {(state: any) => number} [options.getNewPointWeight]
 * @param {(ctx: CanvasRenderingContext2D, eng: import('../../core/engine.js').Engine, context: EditableContext, helpers: typeof helpers) => import('../../utils/geometry/index.js').AABB | null | undefined} options.finalize
 * @param {(ctx: CanvasRenderingContext2D, context: EditableContext, helpers: typeof helpers) => void} options.drawPreview
 * @param {(context: EditableContext, helpers: typeof helpers) => import('../../utils/geometry/index.js').AABB | null | undefined} [options.computePreviewBounds]
 * @returns {import('../../types/tool.js').Tool}
 */
export function createEditableCurveTool(store, options) {
  const {
    id,
    minPoints,
    maxPoints = Infinity,
    getNewPointWeight,
    finalize,
    drawPreview,
    computePreviewBounds,
  } = options;

  if (!id) {
    throw new TypeError('Editable curve tool requires an id');
  }
  if (typeof minPoints !== 'number' || !Number.isFinite(minPoints)) {
    throw new TypeError('Editable curve tool requires a finite minPoints value');
  }
  if (typeof finalize !== 'function') {
    throw new TypeError('Editable curve tool requires a finalize callback');
  }
  if (typeof drawPreview !== 'function') {
    throw new TypeError('Editable curve tool requires a drawPreview callback');
  }

  /** @type {{ points: {x:number,y:number}[], weights: number[] }[]} */
  let committedCurves = [];
  let draftCurve = createEmptyCurve();
  /** @type {{x: number, y: number} | null} */
  let hoverPoint = null;
  /** @type {{ type: 'committed' | 'draft', curveIndex: number, pointIndex: number } | null} */
  let dragHandle = null;
  let editMode = false;
  let modifierState = { ...DEFAULT_MODIFIER_STATE };
  let snapshotStarted = false;
  let ignoreVectorLayerSync = false;

  const getState = () => store.getToolState(id);

  const buildContext = (
    curve,
    state,
    {
      type,
      curveIndex,
      includeHover = false,
    } = {},
  ) => {
    const isDraft = type === 'draft';
    const useHover = includeHover && isDraft ? hoverPoint : null;
    const dragIndex =
      dragHandle &&
      dragHandle.type === (type === 'committed' ? 'committed' : 'draft') &&
      dragHandle.curveIndex === curveIndex
        ? dragHandle.pointIndex
        : -1;
    return {
      id,
      points: curve.points.map(clonePoint),
      hover: useHover ? clonePoint(useHover) : null,
      weights: [...curve.weights],
      dragIndex,
      editMode,
      state,
      curveType: type,
      curveIndex,
    };
  };

  const getContexts = (state = getState()) => {
    const contexts = committedCurves.map((curve, index) =>
      buildContext(curve, state, { type: 'committed', curveIndex: index, includeHover: false }),
    );
    if (draftCurve.points.length || hoverPoint) {
      contexts.push(
        buildContext(draftCurve, state, { type: 'draft', curveIndex: -1, includeHover: true }),
      );
    }
    return contexts;
  };

  const reset = () => {
    committedCurves = [];
    draftCurve = createEmptyCurve();
    hoverPoint = null;
    dragHandle = null;
    editMode = false;
    modifierState = { ...DEFAULT_MODIFIER_STATE };
    snapshotStarted = false;
    tool.previewRect = null;
  };

  const gatherTransferCurves = () => {
    const curves = committedCurves.map((curve) => cloneVectorCurve(curve));
    if (draftCurve.points.length) {
      curves.push(cloneVectorCurve(draftCurve));
    }
    return curves;
  };

  const transferCurvesToVectorLayer = ({ clearToolCurves = false, engine: eng } = {}) => {
    const curves = gatherTransferCurves();
    if (!curves.length) {
      return false;
    }
    const currentLayer = store.getState().vectorLayer ?? createEmptyVectorLayer();
    const nextLayer = appendCurvesToLayer(currentLayer, curves);
    ignoreVectorLayerSync = true;
    const updated = store.set({ vectorLayer: nextLayer });
    if (!updated) {
      ignoreVectorLayerSync = false;
    }
    if (clearToolCurves) {
      reset();
    }
    updatePreviewRect();
    eng?.requestRepaint?.();
    return true;
  };

  const beginSnapshot = (eng) => {
    if (!snapshotStarted) {
      eng.beginStrokeSnapshot?.();
      snapshotStarted = true;
    }
  };

  const updatePreviewRect = () => {
    const state = getState();
    const contexts = getContexts(state);
    if (!contexts.length) {
      tool.previewRect = null;
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    contexts.forEach((context) => {
      const bounds =
        computePreviewBounds?.(context, helpers) ??
        computeAABB([
          ...context.points.map(clonePoint),
          ...(context.hover ? [clonePoint(context.hover)] : []),
        ]);
      if (!bounds) return;
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      tool.previewRect = null;
      return;
    }
    const pad = Math.max(
      Math.ceil(state.brushSize || 1),
      helpers.getHandlePadding(),
    );
    tool.previewRect = {
      x: Math.floor(minX) - pad,
      y: Math.floor(minY) - pad,
      w: Math.ceil(maxX - minX) + pad * 2,
      h: Math.ceil(maxY - minY) + pad * 2,
    };
  };

  const findHandleRef = (point) => {
    for (let curveIndex = 0; curveIndex < committedCurves.length; curveIndex++) {
      const curve = committedCurves[curveIndex];
      for (let i = 0; i < curve.points.length; i++) {
        const cp = curve.points[i];
        const dx = cp.x - point.x;
        const dy = cp.y - point.y;
        if (dx * dx + dy * dy <= HIT_RADIUS_SQ) {
          return { type: 'committed', curveIndex, pointIndex: i };
        }
      }
    }
    for (let i = 0; i < draftCurve.points.length; i++) {
      const cp = draftCurve.points[i];
      const dx = cp.x - point.x;
      const dy = cp.y - point.y;
      if (dx * dx + dy * dy <= HIT_RADIUS_SQ) {
        return { type: 'draft', curveIndex: -1, pointIndex: i };
      }
    }
    return null;
  };

  const refreshEditMode = (eng, { forceUpdateRect = false } = {}) => {
    const shouldEdit = modifierState.ctrl || !!dragHandle;
    const modeChanged = editMode !== shouldEdit;
    if (modeChanged) {
      editMode = shouldEdit;
    }
    if (modeChanged || forceUpdateRect) {
      updatePreviewRect();
      eng?.requestRepaint?.();
    }
  };

  const setModifierState = (mods, eng) => {
    const next = {
      shift: readShiftModifier(mods),
      ctrl: hasCtrlLikeModifier(mods),
      alt: readAltModifier(mods),
    };
    const changed =
      next.shift !== modifierState.shift ||
      next.ctrl !== modifierState.ctrl ||
      next.alt !== modifierState.alt;
    modifierState = next;
    if (next.ctrl) {
      hoverPoint = null;
    }
    refreshEditMode(eng, { forceUpdateRect: changed || next.ctrl });
  };

  const commitDraft = (eng) => {
    if (draftCurve.points.length < minPoints) {
      return false;
    }
    committedCurves.push(cloneCurve(draftCurve));
    draftCurve = createEmptyCurve();
    hoverPoint = null;
    dragHandle = null;
    updatePreviewRect();
    eng?.requestRepaint?.();
    return true;
  };

  const eachCommittedContext = (state, callback) => {
    committedCurves.forEach((curve, index) => {
      const context = buildContext(curve, state, {
        type: 'committed',
        curveIndex: index,
        includeHover: false,
      });
      callback(context, curve, index);
    });
  };

  const finalizeStroke = (ctx, eng, { keepCurves = false } = {}) => {
    if (draftCurve.points.length >= minPoints) {
      commitDraft(eng);
    }

    if (!committedCurves.length) {
      if (!keepCurves) {
        reset();
      } else {
        updatePreviewRect();
      }
      eng.requestRepaint?.();
      return;
    }

    if (!snapshotStarted) {
      eng.beginStrokeSnapshot?.();
      snapshotStarted = true;
    }

    const state = getState();
    const boundsList = [];
    eachCommittedContext(state, (context) => {
      const bounds = finalize(ctx, eng, context, helpers) ?? null;
      if (bounds) {
        boundsList.push(bounds);
      }
    });

    if (boundsList.length) {
      const pad = Math.ceil(state.brushSize || 1);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      boundsList.forEach((bounds) => {
        minX = Math.min(minX, bounds.minX);
        minY = Math.min(minY, bounds.minY);
        maxX = Math.max(maxX, bounds.maxX);
        maxY = Math.max(maxY, bounds.maxY);
      });
      if (
        Number.isFinite(minX) &&
        Number.isFinite(minY) &&
        Number.isFinite(maxX) &&
        Number.isFinite(maxY)
      ) {
        eng.expandPendingRectByRect(
          minX - pad,
          minY - pad,
          maxX - minX + pad * 2,
          maxY - minY + pad * 2,
        );
      }
    }

    eng.finishStrokeToHistory?.();
    snapshotStarted = false;

    if (!keepCurves) {
      reset();
    } else {
      updatePreviewRect();
    }
    eng.requestRepaint?.();
  };

  const tool = {
    id,
    cursor: 'crosshair',
    previewRect: null,
    cancel(_ctx, eng) {
      hoverPoint = null;
      dragHandle = null;
      editMode = false;
      modifierState = { ...DEFAULT_MODIFIER_STATE };
      snapshotStarted = false;
      updatePreviewRect();
      eng?.requestRepaint?.();
    },
    onEnter(_ctx, eng) {
      updatePreviewRect();
      eng.requestRepaint?.();
    },
    onPointerDown(ctx, ev, eng) {
      setModifierState(ev, eng);
      if (ev.button !== 0) return;

      if (isEditModifierActive(modifierState, ev)) {
        const ref = findHandleRef(ev.img);
        if (ref) {
          beginSnapshot(eng);
          dragHandle = ref;
          refreshEditMode(eng, { forceUpdateRect: true });
          return;
        }
        dragHandle = null;
        refreshEditMode(eng, { forceUpdateRect: true });
        return;
      }

      beginSnapshot(eng);
      const state = getState();
      if (draftCurve.points.length >= maxPoints) {
        commitDraft(eng);
      }

      const isDoubleClick = ev.detail === 2;
      draftCurve.points.push(clonePoint(ev.img));
      if (getNewPointWeight) {
        const w = getNewPointWeight(state);
        draftCurve.weights.push(Number.isFinite(w) && w > 0 ? w : 1);
      } else {
        draftCurve.weights.push(1);
      }
      hoverPoint = null;
      updatePreviewRect();
      eng.requestRepaint?.();
      if (
        draftCurve.points.length >= maxPoints ||
        (isDoubleClick && draftCurve.points.length >= minPoints)
      ) {
        commitDraft(eng);
      }
    },
    onPointerMove(_ctx, ev, eng) {
      setModifierState(ev, eng);
      refreshEditMode(eng);

      if (dragHandle) {
        const targetCurve =
          dragHandle.type === 'committed'
            ? committedCurves[dragHandle.curveIndex]
            : draftCurve;
        if (targetCurve && targetCurve.points[dragHandle.pointIndex]) {
          targetCurve.points[dragHandle.pointIndex] = clonePoint(ev.img);
        }
        updatePreviewRect();
        eng.requestRepaint?.();
        return;
      }

      if (!editMode && draftCurve.points.length && draftCurve.points.length < maxPoints) {
        hoverPoint = clonePoint(ev.img);
      } else {
        hoverPoint = null;
      }
      updatePreviewRect();
    },
    onPointerUp(_ctx, ev, eng) {
      setModifierState(ev, eng);
      if (dragHandle) {
        dragHandle = null;
        refreshEditMode(eng, { forceUpdateRect: true });
      } else {
        refreshEditMode(eng);
      }
    },
    drawPreview(octx) {
      const state = getState();
      const contexts = getContexts(state);
      if (!contexts.length) return;
      contexts.forEach((context) => {
        drawPreview(octx, context, helpers);
      });
    },
    onModifiersChanged(modifiers, eng) {
      setModifierState(modifiers, eng);
    },
    finalizePending(ctx, eng) {
      finalizeStroke(ctx, eng, { keepCurves: false });
    },
    burnPending(ctx, eng) {
      finalizeStroke(ctx, eng, { keepCurves: true });
    },
    transferCurvesToVectorLayer(options = {}) {
      return transferCurvesToVectorLayer({ ...options });
    },
  };

  const syncCurvesFromVectorLayer = (layer) => {
    const curves = Array.isArray(layer?.curves) ? layer.curves : [];
    committedCurves = curves.map((curve) => cloneVectorCurve(curve));
    draftCurve = createEmptyCurve();
    hoverPoint = null;
    dragHandle = null;
    editMode = false;
    snapshotStarted = false;
    updatePreviewRect();
  };

  store.watch(
    (state) => state.vectorLayer,
    (nextLayer) => {
      if (ignoreVectorLayerSync) {
        ignoreVectorLayerSync = false;
        return;
      }
      syncCurvesFromVectorLayer(nextLayer);
    },
    { immediate: true },
  );

  return tool;
}
