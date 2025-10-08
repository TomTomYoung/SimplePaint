import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeArcLengthTable,
  pointAtDistance,
  tangentAtDistance,
  resampleBySpacing,
  resampleByCount,
  closestPointOnPath,
  chaikinSmooth,
  simplifyDouglasPeucker,
  computePathNormals,
} from '../../src/utils/path.js';

const approxEqual = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const assertPointAlmostEqual = (actual, expected, eps = 1e-6) => {
  assert.ok(approxEqual(actual.x, expected.x, eps), `expected x≈${expected.x} but got ${actual.x}`);
  assert.ok(approxEqual(actual.y, expected.y, eps), `expected y≈${expected.y} but got ${actual.y}`);
};

test('computeArcLengthTable returns cumulative distances for open and closed paths', () => {
  const open = [
    { x: 0, y: 0 },
    { x: 3, y: 4 },
    { x: 3, y: 0 },
  ];
  const openTable = computeArcLengthTable(open);
  assert.deepEqual(openTable.lengths.map((v) => Math.round(v * 1000) / 1000), [0, 5, 9]);
  assert.equal(openTable.total, 9);

  const closed = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 3, y: 4 },
  ];
  const closedTable = computeArcLengthTable(closed, { closed: true });
  assert.equal(closedTable.lengths.length, 4);
  assert.ok(approxEqual(closedTable.total, 12));
});

test('pointAtDistance interpolates along open and closed paths', () => {
  const open = [
    { x: 0, y: 0 },
    { x: 3, y: 4 },
    { x: 3, y: 0 },
  ];
  const mid = pointAtDistance(open, 2);
  assertPointAlmostEqual(mid.point, { x: 1.2, y: 1.6 });
  assert.equal(mid.index, 0);
  assert.ok(approxEqual(mid.t, 0.4));

  const beyond = pointAtDistance(open, 20);
  assertPointAlmostEqual(beyond.point, { x: 3, y: 0 });
  assert.equal(beyond.index, 1);
  assert.ok(approxEqual(beyond.t, 1));

  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  const wrapped = pointAtDistance(square, 5, { closed: true });
  assertPointAlmostEqual(wrapped.point, { x: 4, y: 1 });
  assert.equal(wrapped.index, 1);
});

test('tangentAtDistance returns unit direction vectors along the path', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
  ];
  const tan = tangentAtDistance(line, 1);
  assertPointAlmostEqual(tan, { x: 1, y: 0 });

  const closed = [
    { x: 0, y: 0 },
    { x: 0, y: 4 },
    { x: -3, y: 4 },
    { x: -3, y: 0 },
  ];
  const tanClosed = tangentAtDistance(closed, 5, { closed: true });
  assert.ok(approxEqual(Math.hypot(tanClosed.x, tanClosed.y), 1));
  assert.ok(tanClosed.x < 0);
});

test('resampleBySpacing returns evenly spaced samples and respects closure', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ];
  const samples = resampleBySpacing(line, 2.5);
  assert.equal(samples.length, 5);
  assertPointAlmostEqual(samples[0], { x: 0, y: 0 });
  assertPointAlmostEqual(samples.at(-1), { x: 10, y: 0 });

  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  const loop = resampleBySpacing(square, 5, { closed: true });
  assert.ok(approxEqual(loop.length, 5));
  assertPointAlmostEqual(loop[0], { x: 0, y: 0 });
  assertPointAlmostEqual(loop.at(-1), loop[0]);
});

test('resampleByCount produces the requested number of samples', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ];
  const samples = resampleByCount(line, 5);
  assert.equal(samples.length, 5);
  assertPointAlmostEqual(samples[2], { x: 5, y: 0 });
  assertPointAlmostEqual(samples.at(-1), { x: 10, y: 0 });

  const closed = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  const loop = resampleByCount(closed, 4, { closed: true, includeLast: true });
  assert.equal(loop.length, 5);
  assertPointAlmostEqual(loop.at(-1), loop[0]);
});

test('closestPointOnPath returns the nearest point with arc-length metadata', () => {
  const polyline = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];
  const projected = closestPointOnPath({ x: 4, y: 3 }, polyline);
  assertPointAlmostEqual(projected.point, { x: 4, y: 0 });
  assert.ok(approxEqual(projected.arcLength, 4));
  assert.equal(projected.index, 0);

  const loop = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  const projectedLoop = closestPointOnPath({ x: 2, y: -1 }, loop, { closed: true });
  assertPointAlmostEqual(projectedLoop.point, { x: 2, y: 0 });
  assert.equal(projectedLoop.index, 0);
});

test('chaikinSmooth preserves endpoints when requested and supports multiple iterations', () => {
  const zigzag = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: -1 },
    { x: 3, y: 0 },
  ];
  const once = chaikinSmooth(zigzag);
  assertPointAlmostEqual(once[0], zigzag[0]);
  assertPointAlmostEqual(once.at(-1), zigzag.at(-1));
  assert.equal(once.length, 2 * (zigzag.length - 1) + 2);

  const twice = chaikinSmooth(zigzag, 2);
  assertPointAlmostEqual(twice[0], zigzag[0]);
  assertPointAlmostEqual(twice.at(-1), zigzag.at(-1));
  assert.ok(twice.length > once.length);
});

test('chaikinSmooth handles closed paths without duplicating the start point', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const smoothed = chaikinSmooth(square, 1, { closed: true });
  assert.ok(smoothed.length === square.length * 2);
  assert.notDeepEqual(smoothed[0], smoothed.at(-1));
});

test('simplifyDouglasPeucker reduces redundant points for open and closed paths', () => {
  const peakLine = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 1 },
    { x: 3, y: 0 },
    { x: 4, y: 0 },
  ];
  const simplified = simplifyDouglasPeucker(peakLine, 0.5);
  assert.equal(simplified.length, 3);
  assertPointAlmostEqual(simplified[0], peakLine[0]);
  assertPointAlmostEqual(simplified.at(-1), peakLine.at(-1));
  assertPointAlmostEqual(simplified[1], { x: 2, y: 1 });

  const polygon = [
    { x: 0, y: 0 },
    { x: 2, y: 0.1 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  const simplifiedClosed = simplifyDouglasPeucker(polygon, 0.25, { closed: true });
  assert.ok(simplifiedClosed.length < polygon.length);
  assert.notDeepEqual(simplifiedClosed[0], simplifiedClosed.at(-1));
});

test('computePathNormals returns unit tangents and normals with consistent orientation', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
  ];
  const normals = computePathNormals(line);
  assert.equal(normals.length, line.length);
  normals.forEach(({ tangent, normal }) => {
    assert.ok(approxEqual(Math.hypot(tangent.x, tangent.y), 1));
    assert.ok(approxEqual(Math.hypot(normal.x, normal.y), 1));
    assert.ok(approxEqual(tangent.x * normal.x + tangent.y * normal.y, 0));
  });
  assertPointAlmostEqual(normals[0].normal, { x: 0, y: 1 });

  const square = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 2 },
    { x: 0, y: 2 },
  ];
  const closedNormals = computePathNormals(square, { closed: true });
  assert.equal(closedNormals.length, square.length);
  closedNormals.forEach(({ tangent, normal }) => {
    assert.ok(approxEqual(Math.hypot(tangent.x, tangent.y), 1));
    assert.ok(approxEqual(Math.hypot(normal.x, normal.y), 1));
  });
  assert.ok(closedNormals[1].normal.x < 0); // outward facing for CCW square
});
