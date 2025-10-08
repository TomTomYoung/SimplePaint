import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EventBus } from '../../src/core/event-bus.js';
import { Store, createStore, defaultState, toolDefaults } from '../../src/core/store.js';

test('Store.set merges updates and notifies subscribers with previous state snapshots', () => {
  const bus = new EventBus({ logger: () => {} });
  const store = createStore(defaultState, bus);
  const events = [];
  store.subscribe((next, previous) => {
    events.push({ next, previous });
  });
  const busEvents = [];
  bus.on('store:updated', (payload) => {
    busEvents.push(payload);
  });
  const changed = store.set({ toolId: 'brush', antialias: true });
  assert.equal(changed, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].previous.toolId, 'pencil');
  assert.equal(events[0].next.toolId, 'brush');
  assert.equal(busEvents.length, 1);
  assert.deepEqual(busEvents[0].changes, { toolId: 'brush', antialias: true });
  assert.equal(busEvents[0].oldState.toolId, 'pencil');
  assert.equal(busEvents[0].newState.antialias, true);
});

test('Store.set is a no-op when updates do not change values', () => {
  const store = createStore(defaultState, new EventBus({ logger: () => {} }));
  let called = 0;
  store.subscribe(() => {
    called += 1;
  });
  const changed = store.set({ toolId: 'pencil' });
  assert.equal(changed, false);
  assert.equal(called, 0);
});

test('Store.getToolState returns merged defaults without mutating the store', () => {
  const store = new Store();
  const toolState = store.getToolState('pencil');
  assert.notEqual(toolState, toolDefaults);
  assert.equal(store.getState().tools?.pencil, undefined);
  assert.equal(toolState.primaryColor, '#000000');
});

test('Store.setToolState merges defaults and preserves previous snapshots', () => {
  const bus = new EventBus({ logger: () => {} });
  const store = createStore(defaultState, bus);
  let previousSnapshot;
  store.subscribe((_, previous) => {
    previousSnapshot = previous;
  });
  store.setToolState('pencil', { brushSize: 12, antialias: true });
  const latest = store.getToolState('pencil');
  assert.equal(latest.brushSize, 12);
  assert.equal(latest.antialias, true);
  assert.equal(previousSnapshot.tools?.pencil, undefined);
});

test('Store.setToolState avoids emitting when values are unchanged', () => {
  const store = createStore(defaultState, new EventBus({ logger: () => {} }));
  let count = 0;
  store.subscribe(() => {
    count += 1;
  });
  store.setToolState('pencil', { brushSize: 10 });
  assert.equal(count, 1);
  store.setToolState('pencil', { brushSize: 10 });
  assert.equal(count, 1);
});

test('Store.resetToolState restores defaults even after mutations', () => {
  const store = createStore(defaultState, new EventBus({ logger: () => {} }));
  store.setToolState('pencil', { brushSize: 18, primaryColor: '#ff00ff' });
  const reset = store.resetToolState('pencil');
  assert.equal(reset.brushSize, toolDefaults.brushSize);
  assert.equal(reset.primaryColor, toolDefaults.primaryColor);
});

test('Store.clearToolState removes stored overrides', () => {
  const store = createStore(defaultState, new EventBus({ logger: () => {} }));
  store.setToolState('brush', { brushSize: 20 });
  const cleared = store.clearToolState('brush');
  assert.equal(cleared, true);
  const state = store.getState();
  assert.equal(state.tools.brush, undefined);
  const fallback = store.getToolState('brush');
  assert.equal(fallback.brushSize, toolDefaults.brushSize);
});

test('Store.watch observes derived values with optional immediate emission', () => {
  const store = createStore(defaultState, new EventBus({ logger: () => {} }));
  const values = [];
  store.watch(
    (state) => state.toolId,
    (next, prev) => {
      values.push({ next, prev });
    },
    { immediate: true },
  );
  store.set({ toolId: 'brush' });
  store.set({ toolId: 'brush' });
  store.set({ toolId: 'eraser' });
  assert.deepEqual(values, [
    { next: 'pencil', prev: 'pencil' },
    { next: 'brush', prev: 'pencil' },
    { next: 'eraser', prev: 'brush' },
  ]);
});

test('Store.replaceState swaps the entire snapshot and notifies subscribers', () => {
  const store = createStore(defaultState, new EventBus({ logger: () => {} }));
  let observed;
  store.subscribe((next) => {
    observed = next;
  });
  store.replaceState({ toolId: 'calligraphy', antialias: true });
  assert.equal(observed.toolId, 'calligraphy');
  assert.equal(observed.antialias, true);
  assert.deepEqual(store.getState().tools, {});
});

