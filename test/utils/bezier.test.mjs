import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateQuadraticBezier,
  evaluateCubicBezier,
  subdivideQuadraticBezier,
  subdivideCubicBezier,
  quadraticBezierBounds,
  cubicBezierBounds,
  quadraticBezierLength,
  cubicBezierLength,
} from '../../src/utils/bezier.js';

function almostEqual(a, b, epsilon = 1e-6) {
  assert.ok(Math.abs(a - b) <= epsilon, `expected ${a} ≈ ${b}`);
}

test('quadratic evaluation matches known values', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 10, y: 20 };
  const p2 = { x: 20, y: 0 };
  const mid = evaluateQuadraticBezier(p0, p1, p2, 0.5);
  almostEqual(mid.x, 10);
  almostEqual(mid.y, 10);
});

test('cubic evaluation returns start and end points at the extremes', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 10, y: 0 };
  const p2 = { x: 10, y: 10 };
  const p3 = { x: 0, y: 10 };
  const start = evaluateCubicBezier(p0, p1, p2, p3, 0);
  const end = evaluateCubicBezier(p0, p1, p2, p3, 1);
  assert.deepEqual(start, p0);
  assert.deepEqual(end, p3);
});

test('quadratic subdivision yields matching endpoints', () => {
  const points = subdivideQuadraticBezier({ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }, 0.3);
  assert.deepEqual(points[0], { x: 0, y: 0 });
  assert.deepEqual(points[4], { x: 10, y: 0 });
  const mid = evaluateQuadraticBezier({ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }, 0.3);
  assert.deepEqual(points[2], mid);
});

test('cubic subdivision matches de Casteljau midpoint', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 5, y: 15 };
  const p2 = { x: 15, y: 15 };
  const p3 = { x: 20, y: 0 };
  const points = subdivideCubicBezier(p0, p1, p2, p3, 0.4);
  const mid = evaluateCubicBezier(p0, p1, p2, p3, 0.4);
  almostEqual(points[3].x, mid.x);
  almostEqual(points[3].y, mid.y);
  assert.deepEqual(points[0], p0);
  assert.deepEqual(points[6], p3);
});

test('quadratic bounds capture interior extrema', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 5, y: 20 };
  const p2 = { x: 10, y: 0 };
  const bounds = quadraticBezierBounds(p0, p1, p2);
  assert.equal(bounds.minX, 0);
  assert.equal(bounds.maxX, 10);
  almostEqual(bounds.maxY, 10);
});

test('cubic bounds enclose the evaluated curve', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 12, y: 30 };
  const p2 = { x: -8, y: 24 };
  const p3 = { x: 6, y: -6 };
  const bounds = cubicBezierBounds(p0, p1, p2, p3);
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    const pt = evaluateCubicBezier(p0, p1, p2, p3, t);
    assert.ok(pt.x >= bounds.minX - 1e-6 && pt.x <= bounds.maxX + 1e-6);
    assert.ok(pt.y >= bounds.minY - 1e-6 && pt.y <= bounds.maxY + 1e-6);
  }
});

test('quadratic length approximates straight line when control is collinear', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 5, y: 5 };
  const p2 = { x: 10, y: 10 };
  const length = quadraticBezierLength(p0, p1, p2);
  almostEqual(length, Math.hypot(10, 10));
});

test('cubic length resolves curved shapes with adaptive refinement', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 10, y: 0 };
  const p2 = { x: 10, y: 10 };
  const p3 = { x: 0, y: 10 };
  const length = cubicBezierLength(p0, p1, p2, p3);
  assert.ok(length > 20);
  assert.ok(length < 40);
});
