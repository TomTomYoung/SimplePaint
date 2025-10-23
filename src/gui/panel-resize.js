import { readJSON, readString, removeItem, writeJSON, writeString } from '../utils/safe-storage.js';

const MIN_WIDTH = 150;
const MAX_WIDTH = 500;
const LEFT_DEFAULT = 200;
const RIGHT_DEFAULT = 250;
const LEGACY_LEFT_KEY = 'ui:leftPanelWidth';
const LEGACY_RIGHT_KEY = 'ui:rightPanelWidth';
const PANEL_STATE_KEY = 'ui:panelState';

let leftPanel = null;
let rightPanel = null;
let leftHandle = null;
let rightHandle = null;

let panelState = {
  leftWidth: LEFT_DEFAULT,
  rightWidth: RIGHT_DEFAULT,
  leftCollapsed: false,
  rightCollapsed: false,
};

const listeners = new Set();

/**
 * 初期化エントリポイント。
 */
export function initPanelResize() {
  if (typeof document === 'undefined') return;
  leftPanel = document.getElementById('leftPanel');
  rightPanel = document.getElementById('layerPanel');
  leftHandle = document.getElementById('leftResizer');
  rightHandle = document.getElementById('rightResizer');

  if (!leftPanel || !rightPanel || !leftHandle || !rightHandle) {
    return;
  }

  panelState = readStoredPanelState();
  applyPanelState(panelState, { persist: false, silent: true });

  setupResizer(leftHandle, leftPanel, 'left', LEFT_DEFAULT, 1);
  setupResizer(rightHandle, rightPanel, 'right', RIGHT_DEFAULT, -1);
}

export function getPanelState() {
  return { ...panelState };
}

export function applyPanelState(nextState, { persist = true, silent = false } = {}) {
  if (!leftPanel || !rightPanel || !leftHandle || !rightHandle) {
    panelState = sanitizePanelState(nextState, panelState);
    return panelState;
  }

  panelState = sanitizePanelState(nextState, panelState);

  updatePanelAppearance(leftPanel, leftHandle, panelState.leftCollapsed, panelState.leftWidth);
  updatePanelAppearance(rightPanel, rightHandle, panelState.rightCollapsed, panelState.rightWidth);

  if (persist) {
    persistPanelState(panelState);
  }

  requestStageMeasure();

  if (!silent) {
    notifyListeners();
  }

  return panelState;
}

export function registerPanelStateListener(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function updatePanelAppearance(panel, handle, collapsed, width) {
  if (!panel || !handle) return;
  const clampedWidth = clamp(width, MIN_WIDTH, MAX_WIDTH);
  if (collapsed) {
    panel.classList.add('is-collapsed');
    panel.setAttribute('aria-hidden', 'true');
    handle.classList.add('is-collapsed');
  } else {
    panel.classList.remove('is-collapsed');
    panel.removeAttribute('aria-hidden');
    handle.classList.remove('is-collapsed');
    panel.style.width = `${clampedWidth}px`;
  }
}

function setupResizer(handle, panel, side, defaultWidth, direction) {
  let pointerId = null;
  let startX = 0;
  let startWidth = 0;
  let frame = null;

  const widthKey = side === 'left' ? 'leftWidth' : 'rightWidth';
  const collapseKey = side === 'left' ? 'leftCollapsed' : 'rightCollapsed';

  const onPointerMove = event => {
    if (event.pointerId !== pointerId) return;
    const delta = (event.clientX - startX) * direction;
    const nextWidth = clamp(startWidth + delta, MIN_WIDTH, MAX_WIDTH);
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      panel.style.width = `${nextWidth}px`;
      frame = null;
    });
  };

  const finishInteraction = event => {
    if (event.pointerId !== pointerId) return;
    handle.releasePointerCapture?.(pointerId);
    pointerId = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', finishInteraction);
    window.removeEventListener('pointercancel', finishInteraction);
    handle.classList.remove('active');
    document.body.classList.remove('panel-resize-active');
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    const width = clamp(parseFloat(panel.style.width) || defaultWidth, MIN_WIDTH, MAX_WIDTH);
    panelState = {
      ...panelState,
      [widthKey]: width,
      [collapseKey]: false,
    };
    applyPanelState(panelState);
  };

  handle.addEventListener('pointerdown', event => {
    if (panelState[collapseKey]) return;
    if (event.button !== 0 || pointerId !== null) return;
    event.preventDefault();
    startX = event.clientX;
    startWidth = panel.getBoundingClientRect().width;
    pointerId = event.pointerId;
    handle.setPointerCapture?.(pointerId);
    handle.classList.add('active');
    document.body.classList.add('panel-resize-active');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finishInteraction);
    window.addEventListener('pointercancel', finishInteraction);
  });

  handle.addEventListener('dblclick', () => {
    panelState = {
      ...panelState,
      [widthKey]: defaultWidth,
      [collapseKey]: false,
    };
    applyPanelState(panelState);
  });
}

function notifyListeners() {
  const snapshot = getPanelState();
  listeners.forEach(listener => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('Failed to notify panel state listener', error);
    }
  });
}

function requestStageMeasure() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('resize'));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizePanelState(state, fallback) {
  const base = { ...fallback };
  if (!state || typeof state !== 'object') {
    return base;
  }
  if (typeof state.leftWidth === 'number' && Number.isFinite(state.leftWidth)) {
    base.leftWidth = clamp(state.leftWidth, MIN_WIDTH, MAX_WIDTH);
  }
  if (typeof state.rightWidth === 'number' && Number.isFinite(state.rightWidth)) {
    base.rightWidth = clamp(state.rightWidth, MIN_WIDTH, MAX_WIDTH);
  }
  base.leftCollapsed = Boolean(state.leftCollapsed);
  base.rightCollapsed = Boolean(state.rightCollapsed);
  return base;
}

function readStoredPanelState() {
  const stored = readJSON(PANEL_STATE_KEY, null);
  if (isValidStoredState(stored)) {
    return sanitizePanelState(stored, panelState);
  }

  const legacyLeft = readLegacyWidth(LEGACY_LEFT_KEY, LEFT_DEFAULT);
  const legacyRight = readLegacyWidth(LEGACY_RIGHT_KEY, RIGHT_DEFAULT);
  removeItem(LEGACY_LEFT_KEY);
  removeItem(LEGACY_RIGHT_KEY);
  return sanitizePanelState(
    {
      leftWidth: legacyLeft,
      rightWidth: legacyRight,
      leftCollapsed: false,
      rightCollapsed: false,
    },
    panelState,
  );
}

function isValidStoredState(value) {
  if (!value || typeof value !== 'object') return false;
  const hasWidths =
    typeof value.leftWidth === 'number' &&
    typeof value.rightWidth === 'number' &&
    Number.isFinite(value.leftWidth) &&
    Number.isFinite(value.rightWidth);
  const hasFlags = 'leftCollapsed' in value && 'rightCollapsed' in value;
  return hasWidths && hasFlags;
}

function persistPanelState(state) {
  writeJSON(PANEL_STATE_KEY, {
    leftWidth: clamp(state.leftWidth, MIN_WIDTH, MAX_WIDTH),
    rightWidth: clamp(state.rightWidth, MIN_WIDTH, MAX_WIDTH),
    leftCollapsed: Boolean(state.leftCollapsed),
    rightCollapsed: Boolean(state.rightCollapsed),
  });
}

function readLegacyWidth(key, fallback) {
  const raw = readString(key, null);
  const parsed = raw == null ? NaN : Number.parseFloat(raw);
  if (Number.isFinite(parsed)) {
    return clamp(parsed, MIN_WIDTH, MAX_WIDTH);
  }
  return clamp(fallback, MIN_WIDTH, MAX_WIDTH);
}
