import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDuplicateIds, installLayerToolbarProxies } from '../src/gui/dom-id-normalizer.js';

function makeButton(id) {
  const listeners = new Map();
  return {
    id,
    dataset: {},
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    click() {
      listeners.get('click')?.();
    },
  };
}

function makeRoot(buttons) {
  return {
    querySelectorAll(selector) {
      if (!selector.startsWith('#')) return [];
      const id = selector.slice(1);
      return buttons.filter(button => button.id === id);
    },
    getElementById(id) {
      return buttons.find(button => button.id === id) ?? null;
    },
  };
}

test('normalizes duplicated layer button ids at runtime', () => {
  const toolbarAdd = makeButton('addLayerBtn');
  const panelAdd = makeButton('addLayerBtn');
  const toolbarVector = makeButton('addVectorLayerBtn');
  const panelVector = makeButton('addVectorLayerBtn');
  const root = makeRoot([toolbarAdd, panelAdd, toolbarVector, panelVector]);

  normalizeDuplicateIds(root);

  assert.equal(toolbarAdd.id, 'toolbarAddLayerBtn');
  assert.equal(panelAdd.id, 'addLayerBtn');
  assert.equal(toolbarVector.id, 'toolbarAddVectorLayerBtn');
  assert.equal(panelVector.id, 'addVectorLayerBtn');
  assert.equal(toolbarAdd.dataset.action, 'add-layer');
  assert.equal(panelAdd.dataset.actionRole, 'panel');
});

test('does not rewrite a single legacy panel id after static cleanup', () => {
  const toolbarAdd = makeButton('toolbarAddLayerBtn');
  const panelAdd = makeButton('addLayerBtn');
  const root = makeRoot([toolbarAdd, panelAdd]);

  normalizeDuplicateIds(root);

  assert.equal(toolbarAdd.id, 'toolbarAddLayerBtn');
  assert.equal(panelAdd.id, 'addLayerBtn');
  assert.equal(toolbarAdd.dataset.actionRole, 'toolbar');
  assert.equal(panelAdd.dataset.actionRole, 'panel');
});

test('proxies toolbar layer buttons to panel buttons after normalization', () => {
  const toolbarAdd = makeButton('addLayerBtn');
  const panelAdd = makeButton('addLayerBtn');
  const root = makeRoot([toolbarAdd, panelAdd]);
  let panelClicks = 0;

  normalizeDuplicateIds(root);
  panelAdd.addEventListener('click', () => { panelClicks += 1; });
  installLayerToolbarProxies(root);

  toolbarAdd.click();

  assert.equal(panelClicks, 1);
});
