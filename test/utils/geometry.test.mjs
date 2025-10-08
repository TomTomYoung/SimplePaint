import test from 'node:test';
import assert from 'node:assert/strict';

import {
  polylineLength,
  polygonArea,
  polygonCentroid,
  isPointOnSegment,
  closestPointOnSegment,
  distanceToSegment,
  segmentIntersection,
  pointInPolygon,
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

test('isPointOnSegment recognises points on and off the segment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 4, y: 0 };
  assert.equal(isPointOnSegment({ x: 2, y: 0 }, a, b), true);
  assert.equal(isPointOnSegment({ x: 4, y: 0 }, a, b), true);
  assert.equal(isPointOnSegment({ x: 5, y: 0 }, a, b), false);
  assert.equal(isPointOnSegment({ x: 2, y: 1 }, a, b), false);
});

test('closestPointOnSegment projects a point onto the segment bounds', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 4, y: 0 };
  const point = { x: 2, y: 2 };
  const closest = closestPointOnSegment(point, a, b);
  assertPointAlmostEqual(closest, { x: 2, y: 0 });
  assert.equal(closest.t, 0.5);

  const outside = closestPointOnSegment({ x: -3, y: 1 }, a, b);
  assertPointAlmostEqual(outside, { x: 0, y: 0 });
  assert.equal(outside.t, 0);
});

test('distanceToSegment returns the shortest distance between point and segment', () => {
  const segmentStart = { x: 0, y: 0 };
  const segmentEnd = { x: 4, y: 0 };
  assert.equal(distanceToSegment({ x: 2, y: 3 }, segmentStart, segmentEnd), 3);
  assert.equal(distanceToSegment({ x: -2, y: 0 }, segmentStart, segmentEnd), 2);
});

test('segmentIntersection returns the intersection point when segments cross', () => {
  const intersection = segmentIntersection(
    { x: 0, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
    { x: 4, y: 0 }
  );
  assertPointAlmostEqual(intersection, { x: 2, y: 2 });
  assert.ok(intersection.t >= 0 && intersection.t <= 1);
  assert.ok(intersection.u >= 0 && intersection.u <= 1);

  const parallel = segmentIntersection(
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 0, y: 2 },
    { x: 4, y: 2 }
  );
  assert.equal(parallel, null);
});

test('pointInPolygon checks inclusion including boundary points', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 5 },
    { x: 0, y: 5 },
  ];
  assert.equal(pointInPolygon({ x: 2.5, y: 2.5 }, square), true);
  assert.equal(pointInPolygon({ x: 5, y: 2.5 }, square), true);
  assert.equal(pointInPolygon({ x: -1, y: -1 }, square), false);
});
