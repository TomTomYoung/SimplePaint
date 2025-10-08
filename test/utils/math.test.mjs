import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clamp,
  clamp01,
  lerp,
  inverseLerp,
  remap,
  distance,
  degToRad,
  radToDeg,
  wrap,
  smoothstep,
} from '../../src/utils/math.js';

test('clamp constrains values to the provided range', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-10, 0, 10), 0);
  assert.equal(clamp(42, 0, 10), 10);
});

test('clamp01 normalises arbitrary values to 0..1', () => {
  assert.equal(clamp01(0.25), 0.25);
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(4), 1);
});

test('lerp performs linear interpolation', () => {
  assert.equal(lerp(0, 10, 0.5), 5);
  assert.equal(lerp(-10, 10, 0.25), -5);
});

test('inverseLerp returns the proportional position between two bounds', () => {
  assert.equal(inverseLerp(0, 10, 5), 0.5);
  assert.equal(inverseLerp(-5, 5, 0), 0.5);
  assert.equal(inverseLerp(10, 20, 30), 2);
  assert.equal(inverseLerp(5, 5, 100), 0);
});

test('remap converts a value from one range into another', () => {
  assert.equal(remap(5, 0, 10, 0, 100), 50);
  assert.equal(remap(0.5, 0, 1, -1, 1), 0);
});

test('distance measures euclidean distance between two points', () => {
  assert.equal(distance(0, 0, 3, 4), 5);
  assert.equal(distance(-2, -3, 4, 1), Math.hypot(6, 4));
});

test('degToRad and radToDeg convert between angle units', () => {
  assert.equal(degToRad(180), Math.PI);
  assert.equal(degToRad(90), Math.PI / 2);
  assert.equal(radToDeg(Math.PI), 180);
  assert.equal(radToDeg(Math.PI / 4), 45);
});

test('wrap folds values back into the provided range', () => {
  assert.equal(wrap(370, 0, 360), 10);
  assert.equal(wrap(-45, 0, 360), 315);
  assert.equal(wrap(5, -1, 1), -1);
  assert.equal(wrap(10, 10, 10), 10);
});

test('smoothstep eases values between two edges', () => {
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 0), 0);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
  assert.equal(smoothstep(0, 1, 1), 1);
  assert.equal(smoothstep(0, 1, 2), 1);
  assert.equal(smoothstep(1, 1, 5), 1);
});
