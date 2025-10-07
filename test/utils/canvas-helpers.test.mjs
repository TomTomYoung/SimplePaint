import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  getDevicePixelRatio,
  normaliseDevicePixelRatio,
  ensureCanvasSize,
  resizeCanvasToDisplaySize,
  scaleContextForDPR,
  createHiDPICanvas,
  computeContainFit,
  computeCoverFit,
  clearCanvas,
} from '../../src/utils/canvas-helpers.js';

test('getDevicePixelRatio falls back to 1 when window is unavailable', () => {
  delete globalThis.window;
  assert.equal(getDevicePixelRatio(), 1);
});

test('getDevicePixelRatio prefers window.devicePixelRatio when available', () => {
  globalThis.window = { devicePixelRatio: 2.5 };
  assert.equal(getDevicePixelRatio(), 2.5);
  delete globalThis.window;
});

test('normaliseDevicePixelRatio clamps to the provided range', () => {
  assert.equal(normaliseDevicePixelRatio(0.1), 1);
  assert.equal(normaliseDevicePixelRatio(0.25, 0.5, 3), 0.5);
  assert.equal(normaliseDevicePixelRatio(10, 0.5, 3), 3);
});

test('ensureCanvasSize updates backing store dimensions only when necessary', () => {
  const canvas = { width: 10, height: 20 };
  const changed = ensureCanvasSize(canvas, 100, 200);
  assert.equal(changed, true);
  assert.equal(canvas.width, 100);
  assert.equal(canvas.height, 200);

  const unchanged = ensureCanvasSize(canvas, 100, 200);
  assert.equal(unchanged, false);
});

test('resizeCanvasToDisplaySize scales by the provided DPR and updates CSS size', () => {
  const canvas = { width: 0, height: 0, style: {} };
  const result = resizeCanvasToDisplaySize(canvas, 320, 200, { devicePixelRatio: 2 });
  assert.equal(result.width, 640);
  assert.equal(result.height, 400);
  assert.equal(result.ratio, 2);
  assert.equal(result.changed, true);
  assert.equal(canvas.style.width, '320px');
  assert.equal(canvas.style.height, '200px');

  const second = resizeCanvasToDisplaySize(canvas, 320, 200, { devicePixelRatio: 2 });
  assert.equal(second.changed, false);
});

test('resizeCanvasToDisplaySize uses client metrics when css size is omitted', () => {
  const canvas = { width: 50, height: 25, clientWidth: 150, clientHeight: 75, style: {} };
  const result = resizeCanvasToDisplaySize(canvas, undefined, undefined, { devicePixelRatio: 1.5, round: Math.ceil });
  assert.equal(result.width, 225);
  assert.equal(result.height, 113);
  assert.equal(canvas.style.width, '150px');
  assert.equal(canvas.style.height, '75px');
});

test('scaleContextForDPR prefers setTransform when resetting the matrix', () => {
  const calls = [];
  const ctx = {
    setTransform: (...args) => calls.push(args),
  };
  const ratio = scaleContextForDPR(ctx, 2, { reset: true });
  assert.equal(ratio, 2);
  assert.deepEqual(calls, [[2, 0, 0, 2, 0, 0]]);
});

test('scaleContextForDPR falls back to scale when setTransform is unavailable', () => {
  const calls = [];
  const ctx = {
    scale: (...args) => calls.push(args),
  };
  const ratio = scaleContextForDPR(ctx, 3);
  assert.equal(ratio, 3);
  assert.deepEqual(calls, [[3, 3]]);
});

test('createHiDPICanvas uses the supplied factory and scales the context', () => {
  const captured = { setTransform: [], scale: [] };
  const context = {
    setTransform: (...args) => captured.setTransform.push(args),
    scale: (...args) => captured.scale.push(args),
  };
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: (type) => {
      assert.equal(type, '2d');
      return context;
    },
  };

  const result = createHiDPICanvas(100, 50, {
    devicePixelRatio: 2,
    createCanvas: () => canvas,
  });

  assert.equal(result.canvas, canvas);
  assert.equal(result.ratio, 2);
  assert.equal(result.width, 200);
  assert.equal(result.height, 100);
  assert.equal(canvas.width, 200);
  assert.equal(canvas.height, 100);
  assert.equal(canvas.style.width, '100px');
  assert.equal(canvas.style.height, '50px');
  assert.deepEqual(captured.setTransform, [[2, 0, 0, 2, 0, 0]]);
  assert.deepEqual(captured.scale, []);
});

test('computeContainFit maintains aspect ratio within bounds', () => {
  const result = computeContainFit(400, 200, 300, 150);
  assert.equal(result.width, 300);
  assert.equal(result.height, 150);
  assert.equal(result.scale, 0.75);
});

test('computeCoverFit expands to cover the target area', () => {
  const result = computeCoverFit(400, 200, 300, 150);
  assert.equal(result.width, 300);
  assert.equal(result.height, 150);
  assert.equal(result.scale, 0.75);

  const wide = computeCoverFit(400, 200, 100, 400);
  assert.equal(Math.round(wide.width), 800);
  assert.equal(Math.round(wide.height), 400);
});

test('clearCanvas clears using the canvas dimensions', () => {
  const calls = [];
  const canvas = { width: 256, height: 128 };
  const ctx = {
    clearRect: (...args) => calls.push(args),
  };
  clearCanvas(ctx, canvas);
  assert.deepEqual(calls, [[0, 0, 256, 128]]);
});
