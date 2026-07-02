import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutosaveController } from '../src/io/autosave.js';

function makeController(snapshot) {
  const statuses = [];
  const applied = [];
  const controller = createAutosaveController({
    sessionManager: {
      async save() {},
      async load() { return snapshot; },
    },
    async snapshotDocument() { return snapshot; },
    async applySnapshot(value) { applied.push(value); },
    onStatus(event) { statuses.push(event); },
    autosaveInterval: 0,
  });
  return { controller, statuses, applied };
}

test('autosave check treats v2 layered snapshots as available', async () => {
  const snapshot = {
    version: 2,
    width: 32,
    height: 32,
    layers: [
      { type: 'raster', dataURL: 'data:image/png;base64,abc' },
    ],
  };
  const { controller, statuses } = makeController(snapshot);

  await controller.check();

  assert.equal(statuses.at(-1).type, 'available');
  assert.equal(statuses.at(-1).snapshot, snapshot);
});

test('autosave restore applies v2 layered snapshots', async () => {
  const snapshot = {
    version: 2,
    width: 32,
    height: 32,
    layers: [
      { type: 'raster', dataURL: 'data:image/png;base64,abc' },
    ],
  };
  const { controller, statuses, applied } = makeController(snapshot);

  await controller.restore();

  assert.deepEqual(applied, [snapshot]);
  assert.equal(statuses.at(-1).type, 'restored');
});

test('autosave check treats empty or unsupported snapshots as missing', async () => {
  const { controller, statuses } = makeController({ version: 2, layers: null });

  await controller.check();

  assert.equal(statuses.at(-1).type, 'missing');
});
