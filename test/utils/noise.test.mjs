import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSeededRandom,
  createPerlinNoise2D,
  createFBM2D,
  createTileableNoise2D,
} from '../../src/utils/noise.js';

test('createSeededRandom produces deterministic sequences', () => {
  const rngA = createSeededRandom(123);
  const rngB = createSeededRandom(123);

  const sequenceA = Array.from({ length: 5 }, () => rngA.next());
  const sequenceB = Array.from({ length: 5 }, () => rngB.next());

  assert.deepEqual(sequenceA, sequenceB);
  assert.ok(sequenceA.every((value) => value >= 0 && value < 1));
});

test('createSeededRandom supports integer and float ranges', () => {
  const rng = createSeededRandom(42);
  const ints = Array.from({ length: 10 }, () => rng.nextInt(10, 20));
  assert.ok(ints.every((value) => value >= 10 && value <= 20));

  const reversed = Array.from({ length: 10 }, () => rng.nextInt(5, -2));
  assert.ok(reversed.every((value) => value >= -2 && value <= 5));

  const floats = Array.from({ length: 10 }, () => rng.nextFloat(-1, 1));
  assert.ok(floats.every((value) => value >= -1 && value <= 1));

  assert.throws(() => rng.setState(0.5), /unsigned 32-bit integer/);
  rng.setState(100);
  assert.equal(rng.getState(), 100);
});

test('createPerlinNoise2D returns stable results for identical coordinates and seed', () => {
  const sampler1 = createPerlinNoise2D(7);
  const sampler2 = createPerlinNoise2D(7);

  const points = [
    [0.1, 0.2],
    [10.5, 3.25],
    [-4.75, 6.1],
    [100.125, -200.875],
  ];

  for (const [x, y] of points) {
    const a = sampler1(x, y);
    const b = sampler2(x, y);
    assert.equal(a, b);
    assert.ok(Math.abs(a) <= 1.1, `expected |${a}| <= 1.1`);
  }

  assert.notEqual(sampler1(0.5, 0.5), createPerlinNoise2D(8)(0.5, 0.5));
  assert.throws(() => sampler1(Number.NaN, 0));
});

test('createFBM2D combines octaves while remaining normalised', () => {
  const base = createPerlinNoise2D(99);
  const fbm = createFBM2D(base, { octaves: 5, lacunarity: 2, gain: 0.5 });

  const samples = [];
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      const value = fbm(x / 3, y / 3);
      samples.push(value);
      assert.ok(Number.isFinite(value));
      assert.ok(value >= -1.1 && value <= 1.1, `fbm value ${value} out of range`);
    }
  }

  // Ensure the field has variation
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  assert.ok(max - min > 0.1, 'fbm should produce varying output');

  assert.throws(() => createFBM2D(() => 0, { octaves: 0 }));
  assert.throws(() => createFBM2D(() => 0, { lacunarity: 0 }));
  assert.throws(() => createFBM2D(() => 0, { gain: -1 }));
});

test('createTileableNoise2D wraps coordinates for seamless sampling', () => {
  const base = createPerlinNoise2D(321);
  const tileable = createTileableNoise2D(base, 4, 6);

  const origin = tileable(0, 0);
  assert.equal(origin, tileable(4, 0));
  assert.equal(origin, tileable(0, 6));
  assert.equal(origin, tileable(4, 6));

  const shifted = tileable(-2, -3);
  assert.equal(shifted, tileable(2, 3));

  assert.throws(() => createTileableNoise2D(base, 0, 5));
  assert.throws(() => createTileableNoise2D(base, 5, Number.NaN));
});
