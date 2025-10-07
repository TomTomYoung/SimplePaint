import assert from 'node:assert/strict';
import test from 'node:test';

import { HistoryManager } from '../../src/managers/history-manager.js';

test('push, undo, and redo maintain patch order and flags', () => {
  const history = new HistoryManager();
  const firstPatch = { id: 1, layer: 0 };
  const entry = history.pushPatch(firstPatch, { label: 'stroke-1' });

  assert.equal(entry.label, 'stroke-1');
  assert.ok(history.canUndo());
  assert.equal(history.canRedo(), false);

  const undone = history.undo();
  assert.strictEqual(undone, firstPatch);
  assert.equal(history.canUndo(), false);
  assert.ok(history.canRedo());

  const redone = history.redo();
  assert.strictEqual(redone, firstPatch);
  assert.ok(history.canUndo());
  assert.equal(history.canRedo(), false);
});

test('history limit trimming and redo invalidation', () => {
  const capped = new HistoryManager({ limit: 2 });
  capped.pushPatch({ id: 1 });
  capped.pushPatch({ id: 2 });
  capped.pushPatch({ id: 3 });

  assert.strictEqual(capped.length, 2);
  assert.strictEqual(capped.peekUndo().patch.id, 3);

  const undone = capped.undo();
  assert.strictEqual(undone.id, 3);
  assert.strictEqual(capped.peekUndo().patch.id, 2);

  const undoneTwo = capped.undo();
  assert.strictEqual(undoneTwo.id, 2);
  assert.equal(capped.canUndo(), false);
  assert.equal(capped.canRedo(), true);

  const redone = capped.redo();
  assert.strictEqual(redone.id, 2);
  assert.equal(capped.canRedo(), true);

  capped.pushPatch({ id: 4 });
  assert.equal(capped.canRedo(), false);
  assert.strictEqual(capped.peekUndo().patch.id, 4);
  assert.strictEqual(capped.length, 2);
});

test('listeners receive snapshots and can be removed', () => {
  const history = new HistoryManager();
  const events = [];
  const stop = history.onChange((payload) => {
    events.push(payload);
  }, { immediate: true });

  history.pushPatch({ id: 1 }, { label: 'stroke-1' });
  history.updateTopMetadata((meta) => ({
    ...meta,
    metadata: { size: 12 },
  }));
  history.replaceTop({ id: 1, rev: 1 }, { label: 'stroke-merged' });
  history.undo();
  history.redo();
  history.clear();

  stop();
  history.pushPatch({ id: 2 });

  assert.strictEqual(events.length, 7);
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ['snapshot', 'push', 'metadata', 'replace', 'undo', 'redo', 'clear']);

  const pushEvent = events[1];
  assert.equal(pushEvent.undo.label, 'stroke-1');
  assert.equal(pushEvent.undo.metadata, null);

  const metadataEvent = events[2];
  assert.equal(metadataEvent.undo.metadata.size, 12);
  assert.equal(metadataEvent.undo.timestamp, pushEvent.undo.timestamp);

  const replaceEvent = events[3];
  assert.equal(replaceEvent.undo.label, 'stroke-merged');
  assert.equal(replaceEvent.undo.patch.id, 1);
  assert.equal(replaceEvent.undo.patch.rev, 1);

  const undoEvent = events[4];
  assert.equal(undoEvent.changed.patch.id, 1);
  assert.equal(undoEvent.redo.label, 'stroke-merged');

  const redoEvent = events[5];
  assert.equal(redoEvent.changed.patch.id, 1);
  assert.equal(redoEvent.undo.label, 'stroke-merged');

  const clearEvent = events[6];
  assert.equal(clearEvent.size, 0);
  assert.equal(clearEvent.undo, null);
});

test('limit changes notify and respect infinity fallbacks', () => {
  const history = new HistoryManager({ limit: 5 });
  const events = [];
  history.onChange((payload) => events.push(payload));

  for (let i = 0; i < 4; i += 1) {
    history.pushPatch({ id: i + 1 });
  }

  history.setLimit(2);
  assert.strictEqual(history.limit, 2);
  assert.strictEqual(history.length, 2);
  assert.strictEqual(history.peekUndo().patch.id, 4);
  assert.equal(events.at(-1).type, 'limit');

  history.setLimit(0);
  assert.equal(history.limit, Infinity);
});
