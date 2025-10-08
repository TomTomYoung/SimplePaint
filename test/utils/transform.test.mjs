import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IDENTITY,
  identity,
  clone,
  determinant,
  isIdentity,
  multiply,
  compose,
  translate,
  scale,
  rotate,
  skew,
  invert,
  applyToPoint,
  applyToPoints,
  transformRect,
  decompose,
  composeFromComponents,
} from '../../src/utils/transform.js';

const approxEqual = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const assertMatrixAlmostEqual = (actual, expected, eps = 1e-9) => {
  assert.equal(actual.length, expected.length, 'matrix length mismatch');
  for (let i = 0; i < actual.length; i++) {
    assert.ok(
      approxEqual(actual[i], expected[i], eps),
      `matrix entry ${i} expected ${expected[i]} but got ${actual[i]}`
    );
  }
};

test('identity helpers create independent matrices', () => {
  const id = identity();
  assertMatrixAlmostEqual(id, IDENTITY);
  id[4] = 10;
  assertMatrixAlmostEqual(IDENTITY, [1, 0, 0, 1, 0, 0], 0);
  const cloned = clone(id);
  assertMatrixAlmostEqual(cloned, id);
  assert.notStrictEqual(cloned, id);
  assert.equal(determinant(IDENTITY), 1);
  assert.equal(isIdentity(IDENTITY), true);
});

test('compose and multiply apply transforms in the expected order', () => {
  const move = translate(10, -5);
  const spin = rotate(Math.PI / 2);
  const combined = compose(move, spin);
  const point = applyToPoint(combined, { x: 2, y: 3 });
  const spun = applyToPoint(spin, { x: 2, y: 3 });
  const moved = applyToPoint(move, spun);
  assert.deepEqual(point, moved);
});

test('scale and rotate respect pivots and maintain anchor points', () => {
  const pivot = { x: 5, y: -2 };
  const scaled = scale(2, 3, pivot.x, pivot.y);
  const rotated = rotate(Math.PI / 2, pivot.x, pivot.y);

  const anchored = applyToPoint(scaled, pivot);
  assert.deepEqual(anchored, pivot, 'scaled pivot should remain fixed');
  const rotatedPoint = applyToPoint(rotated, pivot);
  assert.deepEqual(rotatedPoint, pivot, 'rotated pivot should remain fixed');
});

test('skew applies shear in both axes', () => {
  const matrix = skew(Math.PI / 4, Math.PI / 6);
  const point = applyToPoint(matrix, { x: 1, y: 1 });
  const expected = {
    x: 1 + Math.tan(Math.PI / 4) * 1,
    y: Math.tan(Math.PI / 6) * 1 + 1,
  };
  assert.ok(approxEqual(point.x, expected.x));
  assert.ok(approxEqual(point.y, expected.y));
});

test('invert returns the inverse matrix when possible', () => {
  const m = compose(translate(10, 5), rotate(Math.PI / 4), scale(2, 1.5));
  const inv = invert(m);
  assert.ok(inv, 'expected matrix to be invertible');
  const roundTrip = multiply(inv, m);
  assert.ok(isIdentity(roundTrip, 1e-6));
  assert.equal(invert([1, 0, 0, 0, 0, 0]), null, 'singular matrices return null');
});

test('applyToPoints transforms every point in the collection', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
  ];
  const transformed = applyToPoints(translate(5, -3), pts);
  assert.deepEqual(transformed, [
    { x: 5, y: -3 },
    { x: 7, y: -3 },
  ]);
});

test('transformRect returns the bounding box of transformed corners', () => {
  const rect = { x: 0, y: 0, width: 10, height: 5 };
  const m = compose(translate(2, 3), rotate(Math.PI / 2));
  const bounds = transformRect(m, rect);
  assert.ok(bounds.width > 0 && bounds.height > 0);
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ].map((pt) => applyToPoint(m, pt));
  const minX = Math.min(...corners.map((p) => p.x));
  const maxX = Math.max(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxY = Math.max(...corners.map((p) => p.y));
  assert.ok(approxEqual(bounds.minX, minX));
  assert.ok(approxEqual(bounds.maxX, maxX));
  assert.ok(approxEqual(bounds.minY, minY));
  assert.ok(approxEqual(bounds.maxY, maxY));
});

test('decompose extracts translation, rotation, scale, and shear', () => {
  const original = compose(
    translate(3, -4),
    rotate(Math.PI / 6),
    skew(0.2, 0),
    scale(2, -1.5)
  );
  const parts = decompose(original);
  const expectedShear = Math.tan(0.2);
  assert.ok(approxEqual(parts.translation.x, 3));
  assert.ok(approxEqual(parts.translation.y, -4));
  assert.ok(approxEqual(parts.rotation, Math.PI / 6, 1e-6));
  assert.ok(approxEqual(parts.scale.x, 2));
  assert.ok(approxEqual(parts.scale.y, -1.5));
  assert.ok(approxEqual(parts.shear, expectedShear, 1e-6));
});

test('composeFromComponents rebuilds the matrix from decomposed parts', () => {
  const matrix = compose(
    translate(-8, 12),
    rotate(-Math.PI / 3),
    skew(0.1, -0.05),
    scale(0.5, 2)
  );
  const parts = decompose(matrix);
  const rebuilt = composeFromComponents(parts);
  const diff = multiply(invert(rebuilt), matrix);
  assert.ok(isIdentity(diff, 1e-6));
});
