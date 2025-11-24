import { readJSON, writeJSON } from '../utils/safe-storage.js';

const STORAGE_KEY = 'ui:toolPanelSplit';
const MIN_SELECTOR_HEIGHT = 0;
const MIN_PROP_HEIGHT = 220;
const FALLBACK_HEIGHT = 320;

let leftPanel = null;
let selectorSection = null;
let propSection = null;
let divider = null;
let selectorHeight = FALLBACK_HEIGHT;

const isNumber = value => typeof value === 'number' && Number.isFinite(value);

const clampSelectorHeight = value => {
  if (!leftPanel) return value;
  const panelRect = leftPanel.getBoundingClientRect();
  const dividerHeight = divider?.getBoundingClientRect().height ?? 0;
  const available = Math.max(0, panelRect.height - dividerHeight);
  const maxHeight = Math.max(MIN_SELECTOR_HEIGHT, available - MIN_PROP_HEIGHT);
  const clamped = Math.min(Math.max(value, MIN_SELECTOR_HEIGHT), maxHeight || value);
  return clamped;
};

const applySelectorHeight = (height, { persist = true } = {}) => {
  if (!leftPanel) return;
  selectorHeight = clampSelectorHeight(height ?? selectorHeight);
  leftPanel.style.setProperty('--tool-selector-height', `${selectorHeight}px`);
  if (persist) {
    writeJSON(STORAGE_KEY, { selectorHeight });
  }
};

const restoreSelectorHeight = () => {
  const stored = readJSON(STORAGE_KEY, null);
  if (stored && isNumber(stored.selectorHeight)) {
    applySelectorHeight(stored.selectorHeight, { persist: false });
  } else {
    const initialHeight = selectorSection?.getBoundingClientRect().height;
    applySelectorHeight(isNumber(initialHeight) ? initialHeight : FALLBACK_HEIGHT, { persist: false });
  }
};

export function initToolPanelResize() {
  if (typeof document === 'undefined') return;

  leftPanel = document.getElementById('leftPanel');
  selectorSection = leftPanel?.querySelector('.tool-selector-panel');
  propSection = leftPanel?.querySelector('.tool-prop-panel');
  divider = document.getElementById('toolPanelDivider');

  if (!leftPanel || !selectorSection || !propSection || !divider) return;

  restoreSelectorHeight();

  let pointerId = null;
  let startY = 0;
  let startHeight = selectorHeight;
  let frame = null;

  const onPointerMove = event => {
    if (event.pointerId !== pointerId) return;
    const delta = event.clientY - startY;
    const nextHeight = clampSelectorHeight(startHeight + delta);
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      leftPanel.style.setProperty('--tool-selector-height', `${nextHeight}px`);
      frame = null;
    });
  };

  const finishInteraction = event => {
    if (event.pointerId !== pointerId) return;
    divider.releasePointerCapture?.(pointerId);
    pointerId = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', finishInteraction);
    window.removeEventListener('pointercancel', finishInteraction);
    divider.classList.remove('active');
    document.body.classList.remove('tool-panel-resize-active');
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    const currentHeight = parseFloat(leftPanel.style.getPropertyValue('--tool-selector-height'));
    applySelectorHeight(isNumber(currentHeight) ? currentHeight : selectorHeight);
  };

  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointerId !== null) return;
    event.preventDefault();
    startY = event.clientY;
    startHeight = selectorSection.getBoundingClientRect().height;
    pointerId = event.pointerId;
    divider.setPointerCapture?.(pointerId);
    divider.classList.add('active');
    document.body.classList.add('tool-panel-resize-active');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finishInteraction);
    window.addEventListener('pointercancel', finishInteraction);
  });

  divider.addEventListener('dblclick', () => {
    applySelectorHeight(FALLBACK_HEIGHT);
  });

  window.addEventListener('resize', () => {
    applySelectorHeight(selectorHeight, { persist: false });
  });
}

window.initToolPanelResize = initToolPanelResize;
