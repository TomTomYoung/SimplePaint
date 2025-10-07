import test from 'node:test';
import assert from 'node:assert/strict';

import {
  convolveImageData,
  applyBoxBlur,
  applyGaussianBlur,
  applyUnsharpMask,
} from '../../src/utils/image-processing.js';

if (typeof ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(dataOrWidth, width, height) {
      if (typeof dataOrWidth === 'number' && typeof width === 'number') {
        this.width = dataOrWidth;
        this.height = width;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else if (dataOrWidth instanceof Uint8ClampedArray && typeof width === 'number' && typeof height === 'number') {
        this.data = dataOrWidth;
        this.width = width;
        this.height = height;
      } else {
        throw new TypeError('Invalid arguments for ImageData polyfill');
      }
    }
  };
}

const createImageData = (width, height, values) => {
  if (values.length !== width * height) {
    throw new Error('Value count must match width * height.');
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < values.length; i += 1) {
    const baseIndex = i * 4;
    const value = values[i];
    data[baseIndex] = value;
    data[baseIndex + 1] = value;
    data[baseIndex + 2] = value;
    data[baseIndex + 3] = 255;
  }

  return new ImageData(data, width, height);
};

const toGrayArray = (imageData) => {
  const { data } = imageData;
  const result = new Array(data.length / 4);
  for (let i = 0; i < result.length; i += 1) {
    result[i] = data[i * 4];
  }
  return result;
};

const approx = (actual, expected, epsilon = 1) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`,
  );
};

test('convolveImageData applies an arbitrary kernel to the source pixels', () => {
  const source = createImageData(3, 3, [10, 20, 30, 40, 50, 60, 70, 80, 90]);
  const identityKernel = [0, 0, 0, 0, 1, 0, 0, 0, 0];

  const output = convolveImageData(source, identityKernel);
  assert.deepEqual(toGrayArray(output), toGrayArray(source));
});

test('convolveImageData supports high-pass kernels for edge detection', () => {
  const source = createImageData(3, 3, [0, 0, 0, 0, 255, 0, 0, 0, 0]);
  const edgeKernel = [-1, -1, -1, -1, 8, -1, -1, -1, -1];

  const output = convolveImageData(source, edgeKernel, { divisor: 1 });
  const values = toGrayArray(output);

  assert.equal(values[4], 255);
  assert.equal(Math.max(...values.filter((_, index) => index !== 4)), 0);
});

test('applyBoxBlur returns a clone when the radius is zero', () => {
  const source = createImageData(2, 2, [25, 50, 75, 100]);
  const blurred = applyBoxBlur(source, 0);

  assert.notEqual(blurred.data, source.data);
  assert.deepEqual(toGrayArray(blurred), toGrayArray(source));
});

test('applyGaussianBlur distributes the impulse uniformly across neighbours', () => {
  const size = 7;
  const impulse = new Array(size * size).fill(0);
  const centreIndex = Math.floor(size / 2) * size + Math.floor(size / 2);
  impulse[centreIndex] = 255;
  const source = createImageData(size, size, impulse);
  const blurred = applyGaussianBlur(source, 1);
  const values = toGrayArray(blurred);

  const total = values.reduce((acc, value) => acc + value, 0);
  approx(total, 255, 10);

  const centre = values[centreIndex];
  const neighbours = values.filter((_, index) => index !== centreIndex);
  assert(values.every((value) => value >= 0));
  assert(centre < 255);
  assert(centre > Math.max(...neighbours));
});

test('applyUnsharpMask sharpens contrast while respecting the threshold', () => {
  const source = createImageData(3, 3, [64, 64, 64, 64, 128, 64, 64, 64, 64]);
  const sharpened = applyUnsharpMask(source, { amount: 1, radius: 1, threshold: 32 });
  const values = toGrayArray(sharpened);

  assert.equal(values[0], 64);
  assert.equal(values[1], 64);
  assert(values[4] > 128);
  assert(values[4] <= 255);
});
