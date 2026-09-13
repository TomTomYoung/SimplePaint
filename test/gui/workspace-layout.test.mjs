import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../../styles.css', import.meta.url), 'utf8');

test('header, workspace and status bar share the viewport-height container', () => {
  const { document } = new JSDOM(html).window;
  assert.deepEqual(
    [...document.getElementById('app').children].map(element => element.tagName),
    ['HEADER', 'MAIN', 'FOOTER'],
  );
  for (const id of ['canvasArea', 'leftPanel', 'layerPanel']) {
    assert.equal(document.getElementById(id).parentElement.id, 'stage');
  }
  assert.equal(document.getElementById('shortcutToolTable').closest('header'), null);
  for (const dialog of document.querySelectorAll('[role=dialog], dialog')) {
    assert.equal(dialog.closest('#app'), null);
  }
});

test('only the drawing surfaces are positioned over the workspace', () => {
  const { window } = new JSDOM(html);
  const style = window.document.createElement('style');
  style.textContent = css;
  window.document.head.append(style);
  const sample = window.document.createElement('canvas');
  sample.className = 'brush-sample';
  window.document.getElementById('toolPropContainer').append(sample);
  assert.equal(window.getComputedStyle(window.document.getElementById('base')).position, 'absolute');
  assert.equal(window.getComputedStyle(window.document.getElementById('overlay')).position, 'absolute');
  assert.ok(['', 'static'].includes(window.getComputedStyle(sample).position));
  assert.equal(window.getComputedStyle(sample).display, 'block');
});
