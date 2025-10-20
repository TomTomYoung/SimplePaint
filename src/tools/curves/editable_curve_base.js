import { applyStrokeStyle } from '../../utils/stroke-style.js';
import { computeAABB } from '../../utils/geometry/index.js';

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

  /** @type {{x: number, y: number}[]} */
  let controlPoints = [];
  /** @type {number[]} */
  let weights = [];
  /** @type {{x: number, y: number} | null} */
  let hoverPoint = null;
  let dragIndex = -1;
  let editMode = false;
  let modifierState = { ...DEFAULT_MODIFIER_STATE };
  let snapshotStarted = false;

  const getState = () => store.getToolState(id);

  const getContext = (state = getState()) => ({
    id,
    points: controlPoints,
    hover: hoverPoint,
    weights,
    dragIndex,
    editMode,
    state,
  });

  const getClonedContext = (state = getState()) => ({
    id,
    points: controlPoints.map(clonePoint),
    hover: hoverPoint ? clonePoint(hoverPoint) : null,
    weights: [...weights],
    dragIndex,
    editMode,
    state,
  });

  const reset = () => {
    controlPoints = [];
    weights = [];
    hoverPoint = null;
    dragIndex = -1;
    editMode = false;
    modifierState = { ...DEFAULT_MODIFIER_STATE };
    snapshotStarted = false;
    tool.previewRect = null;
  };

  const beginSnapshot = (eng) => {
    if (!snapshotStarted) {
      eng.beginStrokeSnapshot?.();
      snapshotStarted = true;
    }
  };

  const updatePreviewRect = () => {
    if (!controlPoints.length && !hoverPoint) {
      tool.previewRect = null;
      return;
    }
    const state = getState();
    const bounds =
      computePreviewBounds?.(getContext(state), helpers) ??
      computeAABB([
        ...controlPoints.map(clonePoint),
        ...(hoverPoint ? [clonePoint(hoverPoint)] : []),
      ]);
    if (!bounds) {
      tool.previewRect = null;
      return;
    }
    const pad = Math.max(
      Math.ceil(state.brushSize || 1),
      helpers.getHandlePadding(),
    );
    tool.previewRect = {
      x: Math.floor(bounds.minX) - pad,
      y: Math.floor(bounds.minY) - pad,
      w: Math.ceil(bounds.maxX - bounds.minX) + pad * 2,
      h: Math.ceil(bounds.maxY - bounds.minY) + pad * 2,
    };
  };

  const findHandleIndex = (point) => {
    for (let i = 0; i < controlPoints.length; i++) {
      const cp = controlPoints[i];
      const dx = cp.x - point.x;
      const dy = cp.y - point.y;
      if (dx * dx + dy * dy <= HIT_RADIUS_SQ) {
        return i;
      }
    }
    return -1;
  };

  const refreshEditMode = (eng, { forceUpdateRect = false } = {}) => {
    const shouldEdit = modifierState.ctrl || dragIndex >= 0;
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
    let forceUpdate = false;
    if (next.ctrl && hoverPoint) {
      hoverPoint = null;
      forceUpdate = true;
    }
    if (changed || forceUpdate) {
      refreshEditMode(eng, { forceUpdateRect: forceUpdate });
    } else {
      refreshEditMode(eng);
    }
  };

  const finalizeStroke = (ctx, eng) => {
    if (!controlPoints.length || controlPoints.length < minPoints) {
      reset();
      eng.requestRepaint?.();
      return;
    }
    const state = getState();
    const context = getClonedContext(state);
    const bounds = finalize(ctx, eng, context, helpers) ?? null;
    if (bounds) {
      const pad = Math.ceil(state.brushSize || 1);
      eng.expandPendingRectByRect(
        bounds.minX - pad,
        bounds.minY - pad,
        bounds.maxX - bounds.minX + pad * 2,
        bounds.maxY - bounds.minY + pad * 2,
      );
    }
    if (snapshotStarted) {
      eng.finishStrokeToHistory?.();
    }
    reset();
    eng.requestRepaint?.();
  };

  const tool = {
    id,
    cursor: 'crosshair',
    previewRect: null,
    cancel() {
      reset();
    },
    onEnter(ctx, eng) {
      finalizeStroke(ctx, eng);
    },
    onPointerDown(ctx, ev, eng) {
      setModifierState(ev, eng);
      if (ev.button !== 0) return;

      if (isEditModifierActive(modifierState, ev)) {
        if (controlPoints.length) {
          const index = findHandleIndex(ev.img);
          if (index >= 0) {
            dragIndex = index;
            refreshEditMode(eng, { forceUpdateRect: true });
            return;
          }
          dragIndex = -1;
        }
        refreshEditMode(eng, { forceUpdateRect: true });
        return;
      }

      if (ev.detail === 2) {
        finalizeStroke(ctx, eng);
        return;
      }

      if (controlPoints.length >= maxPoints) {
        finalizeStroke(ctx, eng);
        return;
      }

      beginSnapshot(eng);
      const state = getState();
      controlPoints.push(clonePoint(ev.img));
      if (getNewPointWeight) {
        const w = getNewPointWeight(state);
        weights.push(Number.isFinite(w) && w > 0 ? w : 1);
      }
      hoverPoint = null;
      updatePreviewRect();
      eng.requestRepaint?.();
    },
    onPointerMove(_ctx, ev, eng) {
      setModifierState(ev, eng);
      refreshEditMode(eng);

      if (dragIndex >= 0) {
        controlPoints[dragIndex] = clonePoint(ev.img);
        updatePreviewRect();
        eng.requestRepaint?.();
        return;
      }

      if (!editMode && controlPoints.length && controlPoints.length < maxPoints) {
        hoverPoint = clonePoint(ev.img);
      } else {
        hoverPoint = null;
      }
      updatePreviewRect();
    },
    onPointerUp(_ctx, ev, eng) {
      setModifierState(ev, eng);
      if (dragIndex >= 0) {
        dragIndex = -1;
        refreshEditMode(eng, { forceUpdateRect: true });
      } else {
        refreshEditMode(eng);
      }
    },
    drawPreview(octx) {
      if (!controlPoints.length && !hoverPoint) return;
      const state = getState();
      drawPreview(octx, getContext(state), helpers);
    },
    onModifiersChanged(modifiers, eng) {
      setModifierState(modifiers, eng);
    },
  };

  return tool;
}
