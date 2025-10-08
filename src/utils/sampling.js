import { createSeededRandom } from './noise.js';

const TAU = Math.PI * 2;

function resolveRandom(options = {}) {
  if (options.rng) {
    const { rng } = options;
    if (typeof rng === 'function') {
      return () => {
        const value = rng();
        if (!(value >= 0 && value < 1)) {
          throw new RangeError('rng() must return a value in [0, 1).');
        }
        return value;
      };
    }
    if (typeof rng.next === 'function') {
      return () => {
        const value = rng.next();
        if (!(value >= 0 && value < 1)) {
          throw new RangeError('rng.next() must return a value in [0, 1).');
        }
        return value;
      };
    }
    throw new TypeError('rng must be a function or expose a next() method.');
  }
  if (options.seed !== undefined) {
    const seeded = createSeededRandom(options.seed);
    return () => seeded.next();
  }
  return Math.random;
}

function validateDimensions(width, height) {
  if (!Number.isFinite(width) || width <= 0) {
    throw new TypeError('width must be a positive finite number.');
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new TypeError('height must be a positive finite number.');
  }
}

/**
 * Generates Poisson disk samples within a rectangle using Bridson's algorithm.
 * @param {number} width
 * @param {number} height
 * @param {number} radius minimum distance between points
 * @param {{maxAttempts?: number, seed?: number, rng?: {next: () => number} | (() => number)}} [options]
 * @returns {{x: number, y: number}[]}
 */
export function generatePoissonDiskSamples(width, height, radius, options = {}) {
  validateDimensions(width, height);
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new TypeError('radius must be a positive finite number.');
  }

  const maxAttempts = options.maxAttempts ?? 30;
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new TypeError('maxAttempts must be a positive integer.');
  }

  const random = resolveRandom(options);
  const cellSize = radius / Math.SQRT2;
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);
  const grid = new Int32Array(gridWidth * gridHeight).fill(-1);
  const samples = [];
  const active = [];
  const radiusSquared = radius * radius;

  function cellIndex(x, y) {
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    return gy * gridWidth + gx;
  }

  function isValidCandidate(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return false;
    }

    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);

    const minX = Math.max(0, gx - 2);
    const maxX = Math.min(gridWidth - 1, gx + 2);
    const minY = Math.max(0, gy - 2);
    const maxY = Math.min(gridHeight - 1, gy + 2);

    for (let yy = minY; yy <= maxY; yy += 1) {
      for (let xx = minX; xx <= maxX; xx += 1) {
        const index = grid[yy * gridWidth + xx];
        if (index !== -1) {
          const point = samples[index];
          const dx = point.x - x;
          const dy = point.y - y;
          if ((dx * dx) + (dy * dy) < radiusSquared) {
            return false;
          }
        }
      }
    }

    return true;
  }

  function insertSample(x, y) {
    const point = { x, y };
    const index = samples.length;
    samples.push(point);
    active.push(point);
    grid[cellIndex(x, y)] = index;
  }

  insertSample(random() * width, random() * height);

  while (active.length > 0) {
    const activeIndex = Math.floor(random() * active.length);
    const origin = active[activeIndex];
    let found = false;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const angle = random() * TAU;
      const distance = radius * Math.sqrt((random() * 3) + 1);
      const x = origin.x + Math.cos(angle) * distance;
      const y = origin.y + Math.sin(angle) * distance;

      if (isValidCandidate(x, y)) {
        insertSample(x, y);
        found = true;
        break;
      }
    }

    if (!found) {
      const last = active.pop();
      if (activeIndex < active.length) {
        active[activeIndex] = last;
      }
    }
  }

  return samples;
}

/**
 * Generates points using Mitchell's best-candidate algorithm.
 * @param {number} count number of samples to generate
 * @param {number} width
 * @param {number} height
 * @param {{candidates?: number, seed?: number, rng?: {next: () => number} | (() => number)}} [options]
 * @returns {{x: number, y: number}[]}
 */
export function generateBestCandidateSamples(count, width, height, options = {}) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new TypeError('count must be a positive integer.');
  }
  validateDimensions(width, height);

  const candidateCount = options.candidates ?? 10;
  if (!Number.isInteger(candidateCount) || candidateCount <= 0) {
    throw new TypeError('candidates must be a positive integer.');
  }

  const random = resolveRandom(options);
  const samples = [];

  function randomPoint() {
    return {
      x: random() * width,
      y: random() * height,
    };
  }

  function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return (dx * dx) + (dy * dy);
  }

  samples.push(randomPoint());

  while (samples.length < count) {
    let bestCandidate = null;
    let bestScore = -Infinity;

    for (let i = 0; i < candidateCount; i += 1) {
      const candidate = randomPoint();
      let closest = Infinity;

      for (let j = 0; j < samples.length; j += 1) {
        const score = distanceSquared(candidate, samples[j]);
        if (score < closest) {
          closest = score;
          if (closest === 0) {
            break;
          }
        }
      }

      if (closest > bestScore) {
        bestScore = closest;
        bestCandidate = candidate;
      }
    }

    samples.push(bestCandidate);
  }

  return samples;
}
