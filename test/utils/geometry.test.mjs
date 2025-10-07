import test from 'node:test';
import assert from 'node:assert/strict';

import {
  polylineLength,
  polygonArea,
  polygonCentroid,
} from '../../src/utils/geometry.js';

const approxEqual = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const assertPointAlmostEqual = (actual, expected, eps = 1e-6) => {
  assert.ok(actual, 'expected point to be defined');
  assert.ok(approxEqual(actual.x, expected.x, eps), `x expected ${expected.x} but got ${actual.x}`);
  assert.ok(approxEqual(actual.y, expected.y, eps), `y expected ${expected.y} but got ${actual.y}`);
};

test('polylineLength adds up all segment lengths', () => {
  const length = polylineLength([
    { x: 0, y: 0 },
    { x: 3, y: 4 },
    { x: 6, y: 4 },
  ]);
  assert.equal(length, 5 + 3);
  assert.equal(polylineLength([{ x: 1, y: 1 }]), 0);
});

test('polygonArea returns the absolute area regardless of winding order', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  assert.equal(polygonArea(square), 16);
  assert.equal(polygonArea([...square].reverse()), 16);
  assert.equal(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }]), 0);
});

test('polygonCentroid computes the geometric centre for non-degenerate polygons', () => {
  const triangle = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 0, y: 6 },
  ];
  const centroid = polygonCentroid(triangle);
  assertPointAlmostEqual(centroid, { x: 2, y: 2 });
});

test('polygonCentroid falls back to vertex average when area is negligible', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 2, y: 2 },
    { x: 4, y: 4 },
  ];
  const centroid = polygonCentroid(points);
  assertPointAlmostEqual(centroid, { x: 2, y: 2 });
});
