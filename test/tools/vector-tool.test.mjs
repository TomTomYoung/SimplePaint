import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../../src/core/store.js';
import { makeVectorTool } from '../../src/tools/vector/vector-tool.js';

const noopCtx = /** @type {CanvasRenderingContext2D} */ ({});
const noopEngine = {
  clearSelection() {},
  beginStrokeSnapshot() {},
  endStrokeSnapshot() {},
  commitStrokeSnapshot() { return false; },
  requestRepaint() {},
  expandPendingRectByRect() {},
  finishStrokeToHistory() {},
};

test('vector tool rehydrates persisted vectors with sane defaults', () => {
  const store = createStore({
    tools: {
      'vector-tool': {
        snapToGrid: true,
        vectors: [
          {
            id: 2,
            color: '#123456',
            width: 5,
            points: [
              { x: 1, y: 2 },
              { x: 3, y: 4 },
            ],
          },
          {
            color: '#abcdef',
            width: 0,
            points: [{ x: 10, y: 10 }],
          },
          {
            id: 2,
            points: [
              { x: 7, y: 8 },
            ],
          },
          {
            id: 0,
            points: [],
          },
        ],
      },
    },
  });

  const tool = makeVectorTool(store);
  const snapshot = tool.getVectorsSnapshot();

  assert.equal(snapshot.length, 3);
  const ids = new Set(snapshot.map((path) => path.id));
  assert.equal(ids.size, snapshot.length);
  assert(snapshot.some((path) => path.id === 2));
  const fallback = snapshot.find((path) => path.id !== 2 && path.points.length === 1);
  assert(fallback);
  assert.equal(fallback.width, 1);
  assert.equal(typeof fallback.color, 'string');
  assert.notEqual(fallback.color.length, 0);
});


test('vector tool persists new paths without clobbering stored configuration', () => {
  const store = createStore({
    tools: {
      'vector-tool': {
        snapToGrid: true,
        gridSize: 4,
      },
    },
  });

  const tool = makeVectorTool(store);

  const start = { img: { x: 5, y: 6 } };
  tool.onPointerDown(noopCtx, start, noopEngine);
  tool.onPointerUp(noopCtx, start, noopEngine);

  const state = store.getToolState('vector-tool');
  assert.equal(state.snapToGrid, true);
  assert.equal(state.gridSize, 4);
  assert(Array.isArray(state.vectors));
  assert.equal(state.vectors.length, 1);
  const stored = state.vectors[0];
  assert.equal(typeof stored.id, 'number');
  assert.equal(stored.points.length, 1);
});

test('vector tool allows moving existing anchors without creating new paths', () => {
  const store = createStore({
    tools: {
      'vector-tool': {
        snapToExisting: false,
        vectors: [
          {
            id: 12,
            color: '#00ff00',
            width: 2,
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
          },
        ],
      },
    },
  });

  const tool = makeVectorTool(store);

  tool.onPointerDown(noopCtx, { img: { x: 0, y: 0 } }, noopEngine);
  tool.onPointerMove(noopCtx, { img: { x: 5, y: 6 } }, noopEngine);
  tool.onPointerUp(noopCtx, { img: { x: 5, y: 6 } }, noopEngine);

  const state = store.getToolState('vector-tool');
  assert.equal(state.vectors.length, 1);
  const [path] = state.vectors;
  assert.equal(path.id, 12);
  assert.equal(path.points.length, 2);
  assert.equal(path.points[0].x, 5);
  assert.equal(path.points[0].y, 6);
});

test('vector tool removes anchors with alt-click and drops empty paths', () => {
  const store = createStore({
    tools: {
      'vector-tool': {
        snapToExisting: false,
        vectors: [
          {
            id: 21,
            color: '#ff0000',
            width: 2,
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
          },
        ],
      },
    },
  });

  const tool = makeVectorTool(store);
  tool.onPointerDown(noopCtx, { img: { x: 0, y: 0 }, alt: true }, noopEngine);

  let state = store.getToolState('vector-tool');
  assert.equal(state.vectors.length, 1);
  assert.equal(state.vectors[0].points.length, 1);
  assert.equal(state.vectors[0].points[0].x, 10);
  assert.equal(state.vectors[0].points[0].y, 0);

  tool.onPointerDown(noopCtx, { img: { x: 10, y: 0 }, alt: true }, noopEngine);

  state = store.getToolState('vector-tool');
  assert.equal(state.vectors.length, 0);
});

test('vector tool inserts new anchors on shift-clicked segments', () => {
  const store = createStore({
    tools: {
      'vector-tool': {
        snapToExisting: false,
        vectors: [
          {
            id: 9,
            color: '#00ffff',
            width: 2,
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
          },
        ],
      },
    },
  });

  const tool = makeVectorTool(store);

  tool.onPointerDown(noopCtx, { img: { x: 5, y: 0 }, shift: true }, noopEngine);
  let snapshot = tool.getVectorsSnapshot();
  assert.equal(snapshot[0].points.length, 3);
  tool.onPointerUp(noopCtx, { img: { x: 5, y: 0 } }, noopEngine);

  const state = store.getToolState('vector-tool');
  assert.equal(state.vectors.length, 1);
  const [path] = state.vectors;
  assert.equal(path.points.length, 3);
  const mid = path.points[1];
  assert.equal(mid.x, 5);
  assert.equal(mid.y, 0);
});
