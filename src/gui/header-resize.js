import { readString, removeItem, writeString } from '../utils/safe-storage.js';

const STORAGE_KEY = 'ui:headerHeight';
const MIN_HEIGHT = 72;
const MAX_HEIGHT = 280;

let header = null;
let handle = null;
let defaultHeight = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseStoredHeight(value) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return clamp(n, MIN_HEIGHT, MAX_HEIGHT);
}

function applyHeaderHeight(height, { persist = true } = {}) {
  if (!header) return;
  const next = clamp(height, MIN_HEIGHT, MAX_HEIGHT);
  header.style.height = `${next}px`;
  header.style.minHeight = `${MIN_HEIGHT}px`;
  if (persist) {
    writeString(STORAGE_KEY, next);
  }
  window.dispatchEvent(new Event('resize'));
}

function resetHeaderHeight() {
  if (!header) return;
  header.style.height = '';
  removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('resize'));
}

export function initHeaderResize() {
  if (typeof document === 'undefined') return;
  header = document.querySelector('header');
  handle = document.getElementById('headerResizer');

  if (!header || !handle) return;

  defaultHeight = Math.ceil(header.getBoundingClientRect().height);
  const storedHeight = parseStoredHeight(readString(STORAGE_KEY, null));
  if (storedHeight !== null) {
    applyHeaderHeight(storedHeight, { persist: false });
  }

  let pointerId = null;
  let startY = 0;
  let startHeight = defaultHeight;
  let frame = null;

  const onPointerMove = event => {
    if (event.pointerId !== pointerId) return;
    const delta = event.clientY - startY;
    const next = clamp(startHeight + delta, MIN_HEIGHT, MAX_HEIGHT);
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      header.style.height = `${next}px`;
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
    document.body.classList.remove('header-resize-active');
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    const nextHeight = clamp(parseFloat(header.style.height) || defaultHeight, MIN_HEIGHT, MAX_HEIGHT);
    applyHeaderHeight(nextHeight);
  };

  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointerId !== null) return;
    event.preventDefault();
    startY = event.clientY;
    startHeight = header.getBoundingClientRect().height;
    pointerId = event.pointerId;
    handle.setPointerCapture?.(pointerId);
    handle.classList.add('active');
    document.body.classList.add('header-resize-active');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finishInteraction);
    window.addEventListener('pointercancel', finishInteraction);
  });

  handle.addEventListener('dblclick', () => {
    resetHeaderHeight();
  });
}
