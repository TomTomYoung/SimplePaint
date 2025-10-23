import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockDomEnvironment } from '../helpers/mock-dom.js';

const importEnv = installMockDomEnvironment();
const manifestModule = await import('../../src/tools/base/manifest.js');
const registryModule = await import('../../src/tools/base/registry.js');
const storeModule = await import('../../src/core/store.js');
importEnv.restore();

const {
  DEFAULT_TOOL_IDS,
  DEFAULT_TOOL_MANIFEST,
  collectToolIds,
  createToolIndex,
  getToolEntryById,
  getToolCategoryForId,
} = manifestModule;
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

test('createToolIndex builds a map keyed by tool ids and exposes manifest metadata', () => {
  const index = createToolIndex();
  assert.equal(index.size, DEFAULT_TOOL_IDS.length);

  DEFAULT_TOOL_MANIFEST.forEach((category) => {
    category.tools.forEach((entry) => {
      const indexed = index.get(entry.id);
      assert.ok(indexed, `expected tool ${entry.id} to be present`);
      assert.equal(indexed, entry);
      assert.equal(indexed.categoryId, category.id);
    });
  });
});

test('getToolEntryById returns manifest entries or null', () => {
  const sampleId = DEFAULT_TOOL_IDS[0];
  const entry = getToolEntryById(sampleId);
  assert.ok(entry);
  assert.equal(entry.id, sampleId);

  assert.equal(getToolEntryById('does-not-exist'), null);
  assert.equal(getToolEntryById(''), null);
});

test('getToolCategoryForId resolves the category that contains the tool', () => {
  const sampleId = DEFAULT_TOOL_IDS[DEFAULT_TOOL_IDS.length - 1];
  const category = getToolCategoryForId(sampleId);
  assert.ok(category);
  assert.ok(category.tools.some((entry) => entry.id === sampleId));

  assert.equal(getToolCategoryForId('missing'), null);
});

test('createToolIndex throws if duplicate tool ids exist in a manifest', () => {
  const duplicateEntry = Object.freeze({
    id: 'duplicate',
    categoryId: 'example',
    factory: () => ({}),
  });
  const duplicateManifest = Object.freeze([
    Object.freeze({
      id: 'example',
      label: 'Example tools',
      tools: Object.freeze([duplicateEntry, duplicateEntry]),
    }),
  ]);

  assert.throws(() => createToolIndex(duplicateManifest), /Duplicate tool id/);
});
