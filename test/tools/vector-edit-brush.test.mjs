import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../../src/core/store.js';
import { makeVectorEditBrush } from '../../src/tools/vector/vector_edit_brush.js';

function createVectorState() {
  return {
    vectors: [
      {
        type: 'bezierPath',
        color: '#123456',
        width: 4,
        join: 'round',
        cap: 'round',
        segments: [
          {
            p0: { x: 0, y: 0 },
            c1: { x: 10, y: 0 },
            c2: { x: 20, y: 0 },
            p3: { x: 30, y: 0 },
          },
          {
            p0: { x: 30, y: 0 },
            c1: { x: 40, y: 0 },
            c2: { x: 50, y: 0 },
            p3: { x: 60, y: 0 },
          },
        ],
      },
    ],
  };
}

function createMockCtx() {
  const putCalls = [];
  const strokeCalls = [];
  const ctx = {
    canvas: { width: 512, height: 512 },
    lineWidth: 0,
    lineCap: 'round',
    lineJoin: 'round',
    strokeStyle: '#000',
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    bezierCurveTo() {},
    stroke() {
      strokeCalls.push({});
    },
    putImageData(data, x, y) {
      putCalls.push({ data, x, y });
    },
    getImageData(x, y, w, h) {
      return {
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      };
    },
  };
  Object.defineProperties(ctx, {
    putCalls: { value: putCalls },
    strokeCalls: { value: strokeCalls },
  });
  return ctx;
}

function createMockEngine() {
  return {
    repaintCalls: 0,
    beginSnapshots: 0,
    commitSnapshots: 0,
    endSnapshots: 0,
    expandedRects: [],
    beginStrokeSnapshot() {
      this.beginSnapshots += 1;
    },
    commitStrokeSnapshot() {
      this.commitSnapshots += 1;
      return false;
    },
    endStrokeSnapshot() {
      this.endSnapshots += 1;
    },
    requestRepaint() {
      this.repaintCalls += 1;
    },
    expandPendingRectByRect(x, y, w, h) {
      this.expandedRects.push({ x, y, w, h });
    },
  };
}

test('vector edit brush drags shared anchors and updates store continuity', () => {
  const store = createStore({
    tools: {
      vectorization: createVectorState(),
    },
  });

  const brush = makeVectorEditBrush(store);
  const ctx = createMockCtx();
  const engine = createMockEngine();

  brush.onPointerDown(
    ctx,
    { pointerId: 1, img: { x: 30, y: 0 } },
    engine,
  );
  brush.onPointerMove(
    ctx,
    { pointerId: 1, img: { x: 42, y: 12 } },
    engine,
  );
  brush.onPointerUp(
    ctx,
    { pointerId: 1, img: { x: 42, y: 12 } },
    engine,
  );

  const state = store.getToolState('vectorization');
  assert.equal(state.vectors.length, 1);
  const [vector] = state.vectors;
  assert.equal(vector.segments.length, 2);
  assert.deepEqual(vector.segments[0].p3, { x: 42, y: 12 });
  assert.deepEqual(vector.segments[1].p0, { x: 42, y: 12 });

  assert.equal(engine.beginSnapshots, 1);
  assert.equal(engine.commitSnapshots, 1);
  assert.equal(engine.endSnapshots, 1);
  assert.equal(engine.expandedRects.length, 1);
  const rect = engine.expandedRects[0];
  assert(Number.isFinite(rect.x));
  assert(Number.isFinite(rect.y));
  assert(rect.w > 0);
  assert(rect.h > 0);

  assert.equal(ctx.putCalls.length, 1);
  assert.equal(ctx.strokeCalls.length, 1);
  assert(engine.repaintCalls >= 2);
});

test('vector edit brush adjusts control handles without disturbing anchors', () => {
  const store = createStore({
    tools: {
      vectorization: createVectorState(),
    },
  });

  const brush = makeVectorEditBrush(store);
  const ctx = createMockCtx();
  const engine = createMockEngine();

  brush.onPointerDown(
    ctx,
    { pointerId: 2, img: { x: 10, y: 0 } },
    engine,
  );
  brush.onPointerMove(
    ctx,
    { pointerId: 2, img: { x: 16, y: 6 } },
    engine,
  );
  brush.onPointerUp(
    ctx,
    { pointerId: 2, img: { x: 16, y: 6 } },
    engine,
  );

  const state = store.getToolState('vectorization');
  const [vector] = state.vectors;
  assert.deepEqual(vector.segments[0].c1, { x: 16, y: 6 });
  assert.deepEqual(vector.segments[0].p0, { x: 0, y: 0 });
  assert.deepEqual(vector.segments[0].p3, { x: 30, y: 0 });
  assert.equal(engine.beginSnapshots, 1);
  assert.equal(engine.endSnapshots, 1);
  assert(engine.repaintCalls >= 2);
});

test('vector edit brush ignores clicks that miss control points', () => {
  const store = createStore({
    tools: {
      vectorization: createVectorState(),
    },
  });

  const brush = makeVectorEditBrush(store);
  const ctx = createMockCtx();
  const engine = createMockEngine();

  brush.onPointerDown(
    ctx,
    { pointerId: 3, img: { x: 200, y: 200 } },
    engine,
  );

  const state = store.getToolState('vectorization');
  const [vector] = state.vectors;
  assert.deepEqual(vector.segments[0].p0, { x: 0, y: 0 });
  assert.equal(engine.beginSnapshots, 0);
  assert.equal(engine.commitSnapshots, 0);
  assert.equal(engine.endSnapshots, 0);
  assert(engine.repaintCalls >= 1);
});
