import test from 'node:test';
import assert from 'node:assert/strict';

import { createAutosaveController } from '../../src/io/autosave.js';
import { EventBus } from '../../src/core/event-bus.js';

function createFakeTimers() {
  let now = 0;
  let idCounter = 1;
  const timeouts = new Map();
  const intervals = new Map();

  const schedule = (collection, callback, delay) => {
    const id = idCounter++;
    const due = now + Math.max(0, delay ?? 0);
    collection.set(id, { callback, delay: Math.max(0, delay ?? 0), due });
    return id;
  };

  return {
    setTimeout(callback, delay) {
      return schedule(timeouts, callback, delay);
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(callback, delay) {
      return schedule(intervals, callback, delay);
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    advance(ms) {
      now += ms;
      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const [id, entry] of [...timeouts]) {
          if (entry.due <= now) {
            timeouts.delete(id);
            entry.callback();
            progressed = true;
          }
        }
        for (const entry of intervals.values()) {
          if (entry.due <= now) {
            entry.due = now + entry.delay;
            entry.callback();
            progressed = true;
          }
        }
      }
    },
  };
}

async function settleMicrotasks(timers) {
  await Promise.resolve();
  await Promise.resolve();
  if (timers) {
    timers.advance(0);
    await Promise.resolve();
    await Promise.resolve();
  }
}

test('debounced saves coalesce rapid requests', async () => {
  const timers = createFakeTimers();
  const events = [];
  let counter = 0;
  const saves = [];
  const controller = createAutosaveController({
    sessionManager: {
      async save(snapshot) {
        saves.push(snapshot);
      },
      async load() {
        return null;
      },
    },
    snapshotDocument: async () => ({ id: ++counter }),
    applySnapshot: async () => {},
    onStatus: (event) => events.push(event.type),
    timers,
    autosaveInterval: 1000,
    debounceDelay: 200,
  });

  controller.scheduleSave();
  controller.scheduleSave();
  timers.advance(199);
  await settleMicrotasks(timers);
  assert.equal(saves.length, 0);

  timers.advance(1);
  await settleMicrotasks(timers);
  assert.equal(saves.length, 1);
  assert(events.includes('saving'));
  assert(events.includes('saved'));
});

test('interval driven saves run while started', async () => {
  const timers = createFakeTimers();
  const saves = [];
  const controller = createAutosaveController({
    sessionManager: {
      async save(snapshot) {
        saves.push(snapshot);
      },
      async load() {
        return null;
      },
    },
    snapshotDocument: async () => ({ ts: Date.now() }),
    applySnapshot: async () => {},
    timers,
    autosaveInterval: 250,
    debounceDelay: 0,
  });

  controller.start();
  timers.advance(250);
  await settleMicrotasks(timers);
  assert.equal(saves.length, 1);

  timers.advance(250);
  await settleMicrotasks(timers);
  assert.equal(saves.length, 2);

  controller.stop();
  timers.advance(500);
  await settleMicrotasks(timers);
  assert.equal(saves.length, 2);
});

test('pause halts saves until resume flushes pending work', async () => {
  const timers = createFakeTimers();
  const saves = [];
  const events = [];
  const controller = createAutosaveController({
    sessionManager: {
      async save(snapshot) {
        saves.push(snapshot);
      },
      async load() {
        return null;
      },
    },
    snapshotDocument: async () => ({ ts: saves.length }),
    applySnapshot: async () => {},
    timers,
    autosaveInterval: 500,
    debounceDelay: 100,
    onStatus: (event) => events.push(event.type),
  });

  controller.start();
  await controller.pause();
  assert(controller.isPaused);
  assert(events.includes('paused'));

  controller.scheduleSave();
  timers.advance(200);
  await settleMicrotasks(timers);
  assert.equal(saves.length, 0);

  await controller.resume({ immediate: true });
  await settleMicrotasks(timers);
  assert.equal(saves.length, 1);
  assert(events.includes('resumed'));
  assert(!controller.isPaused);
});

test('event bus bindings trigger debounced saves', async () => {
  const timers = createFakeTimers();
  const bus = new EventBus();
  const saves = [];
  const controller = createAutosaveController({
    sessionManager: {
      async save(snapshot) {
        saves.push(snapshot);
      },
      async load() {
        return null;
      },
    },
    snapshotDocument: async () => ({ id: saves.length }),
    applySnapshot: async () => {},
    timers,
    debounceDelay: 50,
  });

  controller.bindToEventBus(bus, ['store:updated']);
  assert.equal(bus.listenerCount('store:updated'), 1);

  bus.emit('store:updated');
  timers.advance(49);
  await settleMicrotasks(timers);
  assert.equal(saves.length, 0);

  timers.advance(1);
  await settleMicrotasks(timers);
  assert.equal(saves.length, 1);

  await controller.dispose();
  assert.equal(bus.listenerCount('store:updated'), 0);
});

test('dispose can flush pending saves', async () => {
  const timers = createFakeTimers();
  const saves = [];
  const controller = createAutosaveController({
    sessionManager: {
      async save(snapshot) {
        saves.push(snapshot);
      },
      async load() {
        return null;
      },
    },
    snapshotDocument: async () => ({ flushed: true }),
    applySnapshot: async () => {},
    timers,
    debounceDelay: 10,
  });

  controller.scheduleSave();
  await controller.dispose({ flush: true });
  await settleMicrotasks(timers);
  assert.equal(saves.length, 1);
  assert.equal(controller.hasPendingSave(), false);
});
