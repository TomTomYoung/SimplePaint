import test from 'node:test';
import assert from 'node:assert/strict';

import { toHex, hexToRgb, rgbaToString } from '../../src/utils/color.js';

test('toHex clamps, rounds and formats rgb components', () => {
  assert.equal(toHex(255, 0, 0), '#ff0000');
  assert.equal(toHex(15.6, 128.2, 512), '#1080ff');
  assert.equal(toHex(-20, -1, 254.4), '#0000fe');
});

test('hexToRgb parses both short and long hex strings', () => {
  assert.deepEqual(hexToRgb('#ff00ff'), { r: 255, g: 0, b: 255 });
  assert.deepEqual(hexToRgb('#0f8'), { r: 0x00, g: 0xff, b: 0x88 });
});

test('hexToRgb throws on invalid hex strings', () => {
  assert.throws(() => hexToRgb('#12'), /Invalid hex color/);
  assert.throws(() => hexToRgb('#abcd1'), /Invalid hex color/);
});

test('rgbaToString formats rgba values as css string', () => {
  assert.equal(rgbaToString(255, 128, 0, 0.5), 'rgba(255, 128, 0, 0.5)');
  assert.equal(rgbaToString(0, 0, 0), 'rgba(0, 0, 0, 1)');
});
