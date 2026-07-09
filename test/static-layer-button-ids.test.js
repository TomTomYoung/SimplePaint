import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function countId(id) {
  const pattern = new RegExp(`\\bid=["']${id}["']`, 'g');
  return [...html.matchAll(pattern)].length;
}

test('layer toolbar and panel buttons have stable static IDs', () => {
  assert.equal(countId('toolbarAddLayerBtn'), 1);
  assert.equal(countId('toolbarAddVectorLayerBtn'), 1);
  assert.equal(countId('addLayerBtn'), 1);
  assert.equal(countId('addVectorLayerBtn'), 1);
});

test('layer toolbar and panel buttons expose action roles', () => {
  assert.match(html, /id="toolbarAddLayerBtn"[^>]*data-action="add-layer"[^>]*data-action-role="toolbar"/);
  assert.match(html, /id="toolbarAddVectorLayerBtn"[^>]*data-action="add-vector-layer"[^>]*data-action-role="toolbar"/);
  assert.match(html, /id="addLayerBtn"[^>]*data-action="add-layer"[^>]*data-action-role="panel"/);
  assert.match(html, /id="addVectorLayerBtn"[^>]*data-action="add-vector-layer"[^>]*data-action-role="panel"/);
});
