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
  sampleCatmullRom,
  evaluateCatmullRom,
  catmullRomToBezierSegments,
  evaluateUniformCubicBSpline,
  uniformCubicBSplineTangent,
  sampleUniformBSpline,
  uniformBSplineToBezierSegments,
} from '../../src/utils/path.js';

import { evaluateCubicBezier } from '../../src/utils/bezier.js';

const approxEqual = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const assertPointAlmostEqual = (actual, expected, eps = 1e-6) => {
  assert.ok(approxEqual(actual.x, expected.x, eps), `expected x≈${expected.x} but got ${actual.x}`);
  assert.ok(approxEqual(actual.y, expected.y, eps), `expected y≈${expected.y} but got ${actual.y}`);
};

const uniformCatmullRom = (p0, p1, p2, p3, t) => {
  const tt = t * t;
  const ttt = tt * t;
  return {
    x:
      0.5 *
      ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt),
    y:
      0.5 *
      ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt),
  };
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

const uniformBSplineBasis = (p0, p1, p2, p3, t) => {
  const tt = t * t;
  const ttt = tt * t;
  const b0 = (-ttt + 3 * tt - 3 * t + 1) / 6;
  const b1 = (3 * ttt - 6 * tt + 4) / 6;
  const b2 = (-3 * ttt + 3 * tt + 3 * t + 1) / 6;
  const b3 = ttt / 6;
  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
  };
};

test('evaluateUniformCubicBSpline matches the analytic basis evaluation', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 1, y: 2 };
  const p2 = { x: 3, y: 3 };
  const p3 = { x: 4, y: 0 };

  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const expected = uniformBSplineBasis(p0, p1, p2, p3, t);
    const actual = evaluateUniformCubicBSpline(p0, p1, p2, p3, t);
    assertPointAlmostEqual(actual, expected);
  }
});

test('uniformCubicBSplineTangent aligns with finite difference estimates', () => {
  const control = [
    { x: 0, y: 0 },
    { x: 1, y: 2 },
    { x: 2, y: 3 },
    { x: 4, y: 1 },
  ];
  const delta = 1e-3;

  for (const t of [0.1, 0.4, 0.8]) {
    const tangent = uniformCubicBSplineTangent(...control, t);
    const prev = evaluateUniformCubicBSpline(...control, Math.max(0, t - delta));
    const next = evaluateUniformCubicBSpline(...control, Math.min(1, t + delta));
    const vx = next.x - prev.x;
    const vy = next.y - prev.y;
    const length = Math.hypot(vx, vy);
    const approx = length > 0 ? { x: vx / length, y: vy / length } : { x: 0, y: 0 };
    assertPointAlmostEqual(tangent, approx, 5e-3);
  }
});

test('sampleUniformBSpline returns smooth samples for open and closed curves', () => {
  const open = [
    { x: 0, y: 0 },
    { x: 1, y: 2 },
    { x: 3, y: 3 },
    { x: 4, y: 1 },
    { x: 6, y: 0 },
  ];
  const openSamples = sampleUniformBSpline(open, 4);
  const expectedOpen = (open.length - 3) * 4 + 1;
  assert.equal(openSamples.length, expectedOpen);
  assertPointAlmostEqual(openSamples[0], evaluateUniformCubicBSpline(open[0], open[1], open[2], open[3], 0));
  assertPointAlmostEqual(
    openSamples.at(-1),
    evaluateUniformCubicBSpline(open.at(-4), open.at(-3), open.at(-2), open.at(-1), 1),
  );

  const closed = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 2 },
    { x: 0, y: 2 },
  ];
  const closedSamples = sampleUniformBSpline(closed, 3, { closed: true });
  const expectedClosed = closed.length * 3 + 1;
  assert.equal(closedSamples.length, expectedClosed);
  assertPointAlmostEqual(closedSamples[0], closedSamples.at(-1));
});

test('uniformBSplineToBezierSegments matches B-spline evaluation per segment', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 2 },
    { x: 3, y: 3 },
    { x: 4, y: 1 },
    { x: 5, y: -1 },
    { x: 7, y: 0 },
  ];

  const segments = uniformBSplineToBezierSegments(points);
  assert.equal(segments.length, points.length - 3);

  for (let i = 0; i < segments.length; i++) {
    const bez = segments[i];
    const p0 = points[i];
    const p1 = points[i + 1];
    const p2 = points[i + 2];
    const p3 = points[i + 3];
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const splinePoint = evaluateUniformCubicBSpline(p0, p1, p2, p3, t);
      const bezPoint = evaluateCubicBezier(...bez, t);
      assertPointAlmostEqual(bezPoint, splinePoint, 1e-6);
    }
  }
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

test('evaluateCatmullRom matches the uniform formulation when alpha is zero', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 0 },
  ];
  const samples = [0, 0.25, 0.5, 0.75, 1];
  for (const t of samples) {
    const expected = uniformCatmullRom(points[0], points[1], points[2], points[3], t);
    const actual = evaluateCatmullRom(points[0], points[1], points[2], points[3], t, { alpha: 0 });
    assertPointAlmostEqual(actual, expected, 1e-6);
  }
});

test('sampleCatmullRom densifies open and closed paths', () => {
  const open = [
    { x: 0, y: 0 },
    { x: 2, y: 1 },
    { x: 4, y: 0 },
    { x: 6, y: -1 },
  ];
  const samples = sampleCatmullRom(open, 4, { alpha: 0 });
  assert.equal(samples.length, 1 + (open.length - 1) * 4);
  assertPointAlmostEqual(samples[0], open[0]);
  assertPointAlmostEqual(samples.at(-1), open.at(-1));

  const expectedMid = uniformCatmullRom(open[0], open[0], open[1], open[2], 0.5);
  assertPointAlmostEqual(samples[2], expectedMid, 1e-6);

  const closed = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 2 },
    { x: 0, y: 2 },
  ];
  const loop = sampleCatmullRom(closed, 3, { closed: true });
  assert.equal(loop.length, 1 + closed.length * 3);
  assertPointAlmostEqual(loop[0], closed[0]);
  assertPointAlmostEqual(loop.at(-1), loop[0]);
});

test('catmullRomToBezierSegments reproduces Catmull–Rom samples', () => {
  const control = [
    { x: 0, y: 0 },
    { x: 1, y: 2 },
    { x: 4, y: 3 },
    { x: 6, y: 0 },
    { x: 7, y: -1 },
  ];
  const alpha = 0.5;
  const segments = catmullRomToBezierSegments(control, { alpha });
  assert.equal(segments.length, control.length - 1);

  const getPoint = (idx) => {
    if (idx < 0) return control[0];
    if (idx >= control.length) return control.at(-1);
    return control[idx];
  };

  segments.forEach((segment, index) => {
    const p0 = getPoint(index - 1);
    const p1 = getPoint(index);
    const p2 = getPoint(index + 1);
    const p3 = getPoint(index + 2);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const expected = evaluateCatmullRom(p0, p1, p2, p3, t, { alpha });
      const actual = evaluateCubicBezier(segment.p0, segment.p1, segment.p2, segment.p3, t);
      assertPointAlmostEqual(actual, expected, 1e-3);
    }
  });

  const closed = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
  ];
  const closedSegments = catmullRomToBezierSegments(closed, { closed: true });
  assert.equal(closedSegments.length, closed.length);
  assertPointAlmostEqual(closedSegments[0].p0, closed[0]);
  assertPointAlmostEqual(closedSegments.at(-1).p3, closed[0]);
});
