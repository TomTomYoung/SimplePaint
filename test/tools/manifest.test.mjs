import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockDomEnvironment } from '../helpers/mock-dom.js';

const importEnv = installMockDomEnvironment();
const manifestModule = await import('../../src/tools/_base/manifest.js');
const registryModule = await import('../../src/tools/_base/registry.js');
const storeModule = await import('../../src/core/store.js');
importEnv.restore();

const { DEFAULT_TOOL_IDS, DEFAULT_TOOL_MANIFEST, collectToolIds } = manifestModule;
const { createDefaultTools, registerDefaultTools } = registryModule;
const { createStore } = storeModule;

function withMockEnvironment(callback) {
  const env = installMockDomEnvironment();
  try {
    return callback(env);
  } finally {
    env.restore();
  }
}

test('default tool manifest is frozen and unique', () => {
  const seenCategories = new Set();
  const seenTools = new Set();

  DEFAULT_TOOL_MANIFEST.forEach((category) => {
    assert.ok(Object.isFrozen(category));
    assert.ok(Object.isFrozen(category.tools));
    assert.equal(typeof category.id, 'string');
    assert.equal(typeof category.label, 'string');
    assert.ok(!seenCategories.has(category.id), `duplicate category id ${category.id}`);
    seenCategories.add(category.id);

    category.tools.forEach((entry) => {
      assert.ok(Object.isFrozen(entry));
      assert.equal(entry.categoryId, category.id);
      assert.equal(typeof entry.id, 'string');
      assert.equal(typeof entry.factory, 'function');
      const key = entry.id;
      assert.ok(!seenTools.has(key), `duplicate tool id ${key}`);
      seenTools.add(key);
    });
  });

  assert.deepEqual(Array.from(seenTools), collectToolIds());
  assert.deepEqual(Array.from(seenTools), DEFAULT_TOOL_IDS);
});

test('registerDefaultTools registers every manifest entry exactly once', () => {
  withMockEnvironment(() => {
    const store = createStore();
    const registered = [];
    const engine = {
      register(tool) {
        registered.push(tool);
      },
    };

    registerDefaultTools(engine, store);

    const manifestIds = collectToolIds();
    const registeredIds = registered.map((tool) => tool.id);
    assert.deepEqual(registeredIds, manifestIds);
  });
});

test('createDefaultTools yields tool objects that align with the manifest ordering', () => {
  withMockEnvironment(() => {
    const store = createStore();
    const tools = createDefaultTools(store);
    const ids = tools.map((tool) => tool.id);
    assert.deepEqual(ids, DEFAULT_TOOL_IDS);
  });
});
