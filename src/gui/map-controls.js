import { clamp } from '../utils/helpers.js';

let callbacks = {
  onZoomChange: null,
  onModeChange: null,
};

let sliderEl = null;
let zoomValueEl = null;
let zoomOutBtn = null;
let zoomInBtn = null;
let modeRadios = [];

function updateZoomValue(percent) {
  if (zoomValueEl) {
    zoomValueEl.textContent = `${Math.round(percent)}%`;
  }
}

function emitZoomFromSlider() {
  if (!sliderEl) return;
  const percent = Number(sliderEl.value);
  updateZoomValue(percent);
  callbacks.onZoomChange?.(percent / 100);
}

function adjustZoomByStep(step) {
  if (!sliderEl) return;
  const min = sliderEl.min ? Number(sliderEl.min) : 0;
  const max = sliderEl.max ? Number(sliderEl.max) : 100;
  const current = Number(sliderEl.value);
  const next = clamp(current + step, min, max);
  if (next === current) return;
  sliderEl.value = String(next);
  updateZoomValue(next);
  callbacks.onZoomChange?.(next / 100);
}

export function initMapControls() {
  sliderEl = document.getElementById('mapZoomSlider');
  zoomValueEl = document.getElementById('mapZoomValue');
  zoomOutBtn = document.getElementById('mapZoomOut');
  zoomInBtn = document.getElementById('mapZoomIn');
  modeRadios = Array.from(document.querySelectorAll("input[name='editScope']"));

  sliderEl?.addEventListener('input', () => emitZoomFromSlider());
  sliderEl?.addEventListener('change', () => emitZoomFromSlider());

  const step = sliderEl?.step ? Number(sliderEl.step) : 10;
  zoomOutBtn?.addEventListener('click', () => adjustZoomByStep(-step));
  zoomInBtn?.addEventListener('click', () => adjustZoomByStep(step));

  modeRadios.forEach((radio) =>
    radio.addEventListener('change', () => {
      if (radio.checked) {
        callbacks.onModeChange?.(radio.value);
      }
    }),
  );
}

export function setMapControlCallbacks(newCallbacks = {}) {
  callbacks = { ...callbacks, ...newCallbacks };
}

export function updateZoomControls(percent) {
  if (sliderEl) {
    const min = sliderEl.min ? Number(sliderEl.min) : 0;
    const max = sliderEl.max ? Number(sliderEl.max) : 100;
    const clamped = clamp(percent, min, max);
    if (Number(sliderEl.value) !== clamped) {
      sliderEl.value = String(clamped);
    }
    updateZoomValue(clamped);
  } else {
    updateZoomValue(percent);
  }
}

export function updateEditModeControls(mode) {
  modeRadios.forEach((radio) => {
    radio.checked = radio.value === mode;
  });
}

export function getCurrentMode() {
  const active = modeRadios.find((radio) => radio.checked);
  return active?.value ?? 'map';
}
