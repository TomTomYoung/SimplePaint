const DEFAULT_SEED = 1337 >>> 0;

const LCG_A = 1664525 >>> 0;
const LCG_C = 1013904223 >>> 0;
const LCG_M = 0x100000000;

/**
 * Creates a reproducible pseudo random number generator using a linear congruential generator.
 * @param {number} [seed=DEFAULT_SEED]
 * @returns {{next: () => number, nextInt: (min: number, max: number) => number, nextFloat: (min: number, max: number) => number, getState: () => number, setState: (state: number) => void}}
 */
export function createSeededRandom(seed = DEFAULT_SEED) {
  let state = (seed >>> 0) || DEFAULT_SEED;

  function step() {
    state = (Math.imul(state, LCG_A) + LCG_C) >>> 0;
    return state;
  }

  return {
    next() {
      return step() / LCG_M;
    },
    nextInt(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new TypeError('min and max must be finite numbers');
      }
      if (max < min) {
        [min, max] = [max, min];
      }
      const span = (max - min) + 1;
      return Math.floor(this.next() * span) + min;
    },
    nextFloat(min = 0, max = 1) {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new TypeError('min and max must be finite numbers');
      }
      if (max < min) {
        [min, max] = [max, min];
      }
      return this.next() * (max - min) + min;
    },
    getState() {
      return state >>> 0;
    },
    setState(value) {
      if (!Number.isInteger(value)) {
        throw new TypeError('state must be an unsigned 32-bit integer');
      }
      state = value >>> 0;
    },
  };
}

const PERMUTATION_SIZE = 256;
const PERMUTATION_MASK = PERMUTATION_SIZE - 1;
const GRADIENTS_2D = new Float32Array([
  1, 1, -1, 1, 1, -1, -1, -1,
  1, 0, -1, 0, 0, 1, 0, -1,
]);

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + t * (b - a);
}

function gradient(hash, x, y) {
  const h = (hash & 7) << 1;
  return GRADIENTS_2D[h] * x + GRADIENTS_2D[h + 1] * y;
}

function buildPermutation(random) {
  const permutation = new Uint8Array(PERMUTATION_SIZE * 2);
  const values = new Uint8Array(PERMUTATION_SIZE);
  for (let i = 0; i < PERMUTATION_SIZE; i += 1) {
    values[i] = i;
  }
  for (let i = PERMUTATION_SIZE - 1; i > 0; i -= 1) {
    const j = random.nextInt(0, i);
    [values[i], values[j]] = [values[j], values[i]];
  }
  for (let i = 0; i < PERMUTATION_SIZE; i += 1) {
    const value = values[i];
    permutation[i] = value;
    permutation[i + PERMUTATION_SIZE] = value;
  }
  return permutation;
}

/**
 * Creates a 2D Perlin noise sampler that returns values in [-1, 1].
 * @param {number} [seed]
 * @returns {(x: number, y: number) => number}
 */
export function createPerlinNoise2D(seed = DEFAULT_SEED) {
  const random = createSeededRandom(seed);
  const permutation = buildPermutation(random);

  return function perlin(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('Perlin noise coordinates must be finite numbers');
    }

    const xf = Math.floor(x);
    const yf = Math.floor(y);

    const x0 = xf & PERMUTATION_MASK;
    const x1 = (x0 + 1) & PERMUTATION_MASK;
    const y0 = yf & PERMUTATION_MASK;
    const y1 = (y0 + 1) & PERMUTATION_MASK;

    const dx = x - xf;
    const dy = y - yf;

    const u = fade(dx);
    const v = fade(dy);

    const aa = permutation[x0 + permutation[y0]];
    const ab = permutation[x0 + permutation[y1]];
    const ba = permutation[x1 + permutation[y0]];
    const bb = permutation[x1 + permutation[y1]];

    const gAA = gradient(aa, dx, dy);
    const gBA = gradient(ba, dx - 1, dy);
    const gAB = gradient(ab, dx, dy - 1);
    const gBB = gradient(bb, dx - 1, dy - 1);

    const lerpX1 = lerp(gAA, gBA, u);
    const lerpX2 = lerp(gAB, gBB, u);
    return lerp(lerpX1, lerpX2, v);
  };
}

/**
 * Creates a fractal Brownian motion noise sampler based on another sampler.
 * @param {(x: number, y: number) => number} sampler
 * @param {object} [options]
 * @param {number} [options.octaves=4]
 * @param {number} [options.lacunarity=2]
 * @param {number} [options.gain=0.5]
 * @returns {(x: number, y: number) => number}
 */
export function createFBM2D(sampler, options = {}) {
  if (typeof sampler !== 'function') {
    throw new TypeError('sampler must be a function');
  }
  const {
    octaves = 4,
    lacunarity = 2,
    gain = 0.5,
  } = options;

  if (!(Number.isInteger(octaves) && octaves > 0)) {
    throw new TypeError('octaves must be a positive integer');
  }
  if (!Number.isFinite(lacunarity) || lacunarity <= 0) {
    throw new TypeError('lacunarity must be a positive number');
  }
  if (!Number.isFinite(gain) || gain <= 0) {
    throw new TypeError('gain must be a positive number');
  }

  const amplitudeNormalization = (() => {
    let amplitude = 1;
    let sum = 0;
    for (let i = 0; i < octaves; i += 1) {
      sum += amplitude;
      amplitude *= gain;
    }
    return sum > 0 ? 1 / sum : 1;
  })();

  return function fbm(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('FBM coordinates must be finite numbers');
    }
    let frequency = 1;
    let amplitude = 1;
    let value = 0;
    for (let i = 0; i < octaves; i += 1) {
      value += sampler(x * frequency, y * frequency) * amplitude;
      frequency *= lacunarity;
      amplitude *= gain;
    }
    return value * amplitudeNormalization;
  };
}

/**
 * Creates seamless tileable 2D noise by wrapping coordinates across a repeat period.
 * @param {(x: number, y: number) => number} sampler
 * @param {number} periodX
 * @param {number} periodY
 * @returns {(x: number, y: number) => number}
 */
export function createTileableNoise2D(sampler, periodX, periodY) {
  if (typeof sampler !== 'function') {
    throw new TypeError('sampler must be a function');
  }
  if (!Number.isFinite(periodX) || periodX <= 0) {
    throw new TypeError('periodX must be a positive number');
  }
  if (!Number.isFinite(periodY) || periodY <= 0) {
    throw new TypeError('periodY must be a positive number');
  }
  return function tileable(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('tileable noise coordinates must be finite numbers');
    }
    const xWrapped = (x % periodX + periodX) % periodX;
    const yWrapped = (y % periodY + periodY) % periodY;
    return sampler(xWrapped, yWrapped);
  };
}
