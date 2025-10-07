import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rgbToHsv,
  hsvToRgb,
  rgbToHsl,
  hslToRgb,
  normalizeRgb,
  denormalizeRgb,
  normalizeAlpha,
  denormalizeAlpha,
  srgbToLinear,
  linearToSrgb,
} from '../../src/utils/color-space.js';

const approx = (actual, expected, epsilon = 1e-6) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`,
  );
};

test('rgbToHsv converts RGB values into HSV', () => {
  const red = rgbToHsv(1, 0, 0);
  approx(red.h, 0);
  approx(red.s, 1);
  approx(red.v, 1);

  const green = rgbToHsv(0, 1, 0);
  approx(green.h, 1 / 3);
  approx(green.s, 1);
  approx(green.v, 1);

  const blue = rgbToHsv(0, 0, 1);
  approx(blue.h, 2 / 3);
  approx(blue.s, 1);
  approx(blue.v, 1);
});

test('hsvToRgb recovers the original RGB values', () => {
  const source = { r: 0.25, g: 0.5, b: 0.75 };
  const hsv = rgbToHsv(source.r, source.g, source.b);
  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  approx(rgb.r, source.r);
  approx(rgb.g, source.g);
  approx(rgb.b, source.b);
});

test('rgbToHsl calculates hue, saturation, and lightness', () => {
  const white = rgbToHsl(1, 1, 1);
  approx(white.h, 0);
  approx(white.s, 0);
  approx(white.l, 1);

  const black = rgbToHsl(0, 0, 0);
  approx(black.h, 0);
  approx(black.s, 0);
  approx(black.l, 0);

  const red = rgbToHsl(1, 0, 0);
  approx(red.h, 0);
  approx(red.s, 1);
  approx(red.l, 0.5);
});

test('hslToRgb converts back to the original RGB colour', () => {
  const source = { r: 0.1, g: 0.3, b: 0.9 };
  const hsl = rgbToHsl(source.r, source.g, source.b);
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  approx(rgb.r, source.r);
  approx(rgb.g, source.g);
  approx(rgb.b, source.b);
});

test('normalizeRgb and denormalizeRgb clamp values into valid ranges', () => {
  const normalised = normalizeRgb(-0.5, 0.5, 2);
  assert.deepEqual(normalised, [0, 0.5, 1]);

  const denormalised = denormalizeRgb(-1, 0.5, 2);
  assert.deepEqual(denormalised, [0, 128, 255]);
});

test('normalizeAlpha and denormalizeAlpha operate on single channel values', () => {
  assert.equal(normalizeAlpha(-0.5), 0);
  assert.equal(normalizeAlpha(0.25), 0.25);
  assert.equal(normalizeAlpha(4), 1);

  assert.equal(denormalizeAlpha(-1), 0);
  assert.equal(denormalizeAlpha(0.5), 128);
  assert.equal(denormalizeAlpha(4), 255);
});

test('srgbToLinear converts gamma corrected values into linear space', () => {
  approx(srgbToLinear(0), 0);
  approx(srgbToLinear(1), 1);
  approx(srgbToLinear(0.5), 0.21404114048223255);
});

test('linearToSrgb converts linear values back into sRGB space', () => {
  approx(linearToSrgb(0), 0);
  approx(linearToSrgb(1), 1);
  approx(linearToSrgb(0.21404114048223255), 0.5);
});

