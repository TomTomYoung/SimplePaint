import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EventBus } from '../../src/core/event-bus.js';

test('EventBus emits events to registered listeners and supports unsubscription', () => {
  const bus = new EventBus({ logger: () => {} });
  let count = 0;
  const off = bus.on('draw', () => {
    count += 1;
  });
  bus.emit('draw');
  assert.equal(count, 1);
  off();
  bus.emit('draw');
  assert.equal(count, 1);
});

test('EventBus.once removes the listener after the first invocation', () => {
  const bus = new EventBus({ logger: () => {} });
  let count = 0;
  bus.once('stroke', () => {
    count += 1;
  });
  bus.emit('stroke');
  bus.emit('stroke');
  assert.equal(count, 1);
  assert.equal(bus.listenerCount('stroke'), 0);
});

test('EventBus.emitAsync awaits listeners and records handler errors', async () => {
  const captured = [];
  const bus = new EventBus({
    logger(event, error) {
      captured.push({ event, error });
    },
  });
  bus.on('task', async (value) => value * 2);
  bus.on('task', async () => {
    throw new Error('boom');
  });
  const results = await bus.emitAsync('task', 3);
  assert.deepEqual(results, [6, undefined]);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].event, 'task');
  assert.equal(captured[0].error.message, 'boom');
});

test('EventBus.clear removes listeners', () => {
  const bus = new EventBus({ logger: () => {} });
  bus.on('alpha', () => {});
  bus.on('beta', () => {});
  assert.equal(bus.has('alpha'), true);
  bus.clear('alpha');
  assert.equal(bus.has('alpha'), false);
  bus.clear();
  assert.equal(bus.has('beta'), false);
});

test('EventBus unsubscribes listeners when an abort signal is triggered', () => {
  const bus = new EventBus({ logger: () => {} });
  const controller = new AbortController();
  let count = 0;
  bus.on(
    'sample',
    () => {
      count += 1;
    },
    { signal: controller.signal },
  );
  controller.abort();
  bus.emit('sample');
  assert.equal(count, 0);
  assert.equal(bus.listenerCount('sample'), 0);
});

test('EventBus.off removes specific handlers', () => {
  const bus = new EventBus({ logger: () => {} });
  const handler = () => {};
  bus.on('gamma', handler);
  assert.equal(bus.listenerCount('gamma'), 1);
  assert.equal(bus.off('gamma', handler), true);
  assert.equal(bus.listenerCount('gamma'), 0);
});

