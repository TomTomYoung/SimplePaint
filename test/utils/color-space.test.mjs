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
  rgbToXyz,
  xyzToRgb,
  xyzToLab,
  labToXyz,
  rgbToLab,
  labToRgb,
  labToLch,
  lchToLab,
  rgbToLch,
  lchToRgb,
} from '../../src/utils/color/space.js';

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

test('rgbToXyz maps sRGB primaries into the D65 XYZ space', () => {
  const red = rgbToXyz(1, 0, 0);
  approx(red.x, 0.4124564, 1e-6);
  approx(red.y, 0.2126729, 1e-6);
  approx(red.z, 0.0193339, 1e-6);

  const green = rgbToXyz(0, 1, 0);
  approx(green.x, 0.3575761, 1e-6);
  approx(green.y, 0.7151522, 1e-6);
  approx(green.z, 0.119192, 1e-6);
});

test('xyzToRgb approximately recovers the source colour', () => {
  const source = { r: 0.25, g: 0.5, b: 0.75 };
  const xyz = rgbToXyz(source.r, source.g, source.b);
  const rgb = xyzToRgb(xyz.x, xyz.y, xyz.z);
  approx(rgb.r, source.r, 5e-5);
  approx(rgb.g, source.g, 5e-5);
  approx(rgb.b, source.b, 5e-5);
});

test('rgbToLab converts sRGB colours to perceptual L*a*b* coordinates', () => {
  const white = rgbToLab(1, 1, 1);
  approx(white.l, 100, 5e-5);
  approx(white.a, 0, 5e-5);
  approx(white.b, 0, 5e-5);

  const black = rgbToLab(0, 0, 0);
  approx(black.l, 0, 5e-5);
  approx(black.a, 0, 5e-5);
  approx(black.b, 0, 5e-5);

  const red = rgbToLab(1, 0, 0);
  approx(red.l, 53.240794, 1e-6);
  approx(red.a, 80.09246, 1e-5);
  approx(red.b, 67.203197, 1e-5);
});

test('labToRgb converts Lab back to sRGB with gamut clipping', () => {
  const labGray = rgbToLab(0.5, 0.5, 0.5);
  const rgbGray = labToRgb(labGray.l, labGray.a, labGray.b);
  approx(rgbGray.r, 0.5, 5e-4);
  approx(rgbGray.g, 0.5, 5e-4);
  approx(rgbGray.b, 0.5, 5e-4);

  const labBright = { l: 90, a: 100, b: 100 };
  const rgbBright = labToRgb(labBright.l, labBright.a, labBright.b);
  assert.ok(rgbBright.r <= 1 && rgbBright.r >= 0);
  assert.ok(rgbBright.g <= 1 && rgbBright.g >= 0);
  assert.ok(rgbBright.b <= 1 && rgbBright.b >= 0);
});

test('xyzToLab and labToXyz are inverse operations', () => {
  const xyz = { x: 0.2, y: 0.4, z: 0.3 };
  const lab = xyzToLab(xyz.x, xyz.y, xyz.z);
  const recon = labToXyz(lab.l, lab.a, lab.b);
  approx(recon.x, xyz.x, 5e-5);
  approx(recon.y, xyz.y, 5e-5);
  approx(recon.z, xyz.z, 5e-5);
});

test('labToLch converts to cylindrical coordinates and back', () => {
  const lab = { l: 70, a: 40, b: 20 };
  const lch = labToLch(lab.l, lab.a, lab.b);
  assert.equal(lch.l, lab.l);
  approx(lch.c, Math.sqrt(lab.a ** 2 + lab.b ** 2));
  const recon = lchToLab(lch.l, lch.c, lch.h);
  approx(recon.a, lab.a, 1e-10);
  approx(recon.b, lab.b, 1e-10);
});

test('rgbToLch and lchToRgb provide approximate round trips', () => {
  const rgb = { r: 0.3, g: 0.6, b: 0.9 };
  const lch = rgbToLch(rgb.r, rgb.g, rgb.b);
  const recon = lchToRgb(lch.l, lch.c, lch.h);
  approx(recon.r, rgb.r, 5e-3);
  approx(recon.g, rgb.g, 5e-3);
  approx(recon.b, rgb.b, 5e-3);
});

