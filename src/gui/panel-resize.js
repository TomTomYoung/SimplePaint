const MIN_WIDTH = 150;
const MAX_WIDTH = 500;
const LEFT_DEFAULT = 200;
const RIGHT_DEFAULT = 250;
const LEFT_KEY = 'ui:leftPanelWidth';
const RIGHT_KEY = 'ui:rightPanelWidth';

/**
 * 初期化エントリポイント。
 */
export function initPanelResize() {
  if (typeof document === 'undefined') return;
  const leftPanel = document.getElementById('leftPanel');
  const rightPanel = document.getElementById('layerPanel');
  const leftHandle = document.getElementById('leftResizer');
  const rightHandle = document.getElementById('rightResizer');

  if (!leftPanel || !rightPanel || !leftHandle || !rightHandle) {
    return;
  }

  applyStoredWidth(leftPanel, LEFT_KEY, LEFT_DEFAULT);
  applyStoredWidth(rightPanel, RIGHT_KEY, RIGHT_DEFAULT);

  setupResizer(leftHandle, leftPanel, LEFT_KEY, LEFT_DEFAULT, 1);
  setupResizer(rightHandle, rightPanel, RIGHT_KEY, RIGHT_DEFAULT, -1);
}

function applyStoredWidth(panel, key, fallback) {
  const width = readWidth(key, fallback);
  panel.style.width = `${width}px`;
}

function setupResizer(handle, panel, storageKey, defaultWidth, direction) {
  let pointerId = null;
  let startX = 0;
  let startWidth = 0;
  let frame = null;

  const onPointerMove = (event) => {
    if (event.pointerId !== pointerId) return;
    const delta = (event.clientX - startX) * direction;
    const nextWidth = clamp(startWidth + delta, MIN_WIDTH, MAX_WIDTH);
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      panel.style.width = `${nextWidth}px`;
      frame = null;
    });
  };

  const finishInteraction = (event) => {
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
    writeWidth(storageKey, width);
    requestStageMeasure();
  };

  handle.addEventListener('pointerdown', (event) => {
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
    panel.style.width = `${defaultWidth}px`;
    writeWidth(storageKey, defaultWidth);
    requestStageMeasure();
  });
}

function requestStageMeasure() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('resize'));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readWidth(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    const parsed = stored == null ? NaN : Number.parseFloat(stored);
    if (Number.isFinite(parsed)) {
      return clamp(parsed, MIN_WIDTH, MAX_WIDTH);
    }
  } catch {
    // localStorage が利用できない環境では無視
  }
  return clamp(fallback, MIN_WIDTH, MAX_WIDTH);
}

function writeWidth(key, value) {
  try {
    localStorage.setItem(key, String(clamp(value, MIN_WIDTH, MAX_WIDTH)));
  } catch {
    // localStorage が利用できない場合は静かに失敗
  }
}
