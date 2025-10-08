import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generatePoissonDiskSamples,
  generateBestCandidateSamples,
} from '../../src/utils/sampling.js';
import { createSeededRandom } from '../../src/utils/noise.js';

function minDistance(points) {
  let min = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const dist = Math.hypot(dx, dy);
      if (dist < min) {
        min = dist;
      }
    }
  }
  return min;
}

function boundsCheck(points, width, height) {
  return points.every((point) => point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height);
}

test('generatePoissonDiskSamples produces evenly spaced deterministic samples', () => {
  const rngA = createSeededRandom(2024);
  const samplesA = generatePoissonDiskSamples(50, 30, 4, { rng: rngA });

  const rngB = createSeededRandom(2024);
  const samplesB = generatePoissonDiskSamples(50, 30, 4, { rng: rngB });

  assert.equal(samplesA.length, samplesB.length);
  assert.deepEqual(samplesA, samplesB);
  assert.ok(samplesA.length > 20, 'expected a reasonable number of samples for the area');
  assert.ok(boundsCheck(samplesA, 50, 30));

  const minimumSpacing = minDistance(samplesA);
  assert.ok(minimumSpacing >= 4 - 1e-6, `samples are closer than radius (${minimumSpacing})`);
});

test('generatePoissonDiskSamples validates arguments', () => {
  assert.throws(() => generatePoissonDiskSamples(0, 10, 3), /width must be a positive finite number/);
  assert.throws(() => generatePoissonDiskSamples(10, 0, 3), /height must be a positive finite number/);
  assert.throws(() => generatePoissonDiskSamples(10, 10, 0), /radius must be a positive finite number/);
  assert.throws(() => generatePoissonDiskSamples(10, 10, 3, { maxAttempts: 0 }), /maxAttempts must be a positive integer/);
});

test('generateBestCandidateSamples spreads points apart deterministically', () => {
  const rng = createSeededRandom(88);
  const samples = generateBestCandidateSamples(15, 120, 60, { candidates: 12, rng });

  assert.equal(samples.length, 15);
  assert.ok(boundsCheck(samples, 120, 60));

  const minSpacing = minDistance(samples);
  assert.ok(minSpacing > 5, `expected samples to be spaced further apart, got ${minSpacing}`);

  const rng2 = createSeededRandom(88);
  const samples2 = generateBestCandidateSamples(15, 120, 60, { candidates: 12, rng: rng2 });
  assert.deepEqual(samples, samples2);
});

test('generateBestCandidateSamples validates arguments', () => {
  assert.throws(() => generateBestCandidateSamples(0, 10, 10), /count must be a positive integer/);
  assert.throws(() => generateBestCandidateSamples(10, -5, 10), /width must be a positive finite number/);
  assert.throws(() => generateBestCandidateSamples(10, 5, NaN), /height must be a positive finite number/);
  assert.throws(() => generateBestCandidateSamples(5, 5, 5, { candidates: 0 }), /candidates must be a positive integer/);
});
