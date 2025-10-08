import test from 'node:test';
import assert from 'node:assert/strict';

import {
  convolveImageData,
  applyBoxBlur,
  applyGaussianBlur,
  applyUnsharpMask,
  applyGrayscale,
  applySobelOperator,
  applyPrewittOperator,
  applyLaplacianOperator,
  computeHistogram,
  applyHistogramEqualization,
  applyThreshold,
  applyDilation,
  applyErosion,
  applyMorphologicalOpening,
  applyMorphologicalClosing,
} from '../../src/utils/image/processing.js';
import { rgbToHsl } from '../../src/utils/color-space.js';

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

const toAlphaArray = (imageData) => {
  const { data } = imageData;
  const result = new Array(data.length / 4);
  for (let i = 0; i < result.length; i += 1) {
    result[i] = data[i * 4 + 3];
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

test('applyGrayscale converts colour pixels using luminance weights', () => {
  const data = new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
  ]);
  const source = new ImageData(data, 2, 2);
  const grayscale = applyGrayscale(source);
  const values = toGrayArray(grayscale);

  assert.equal(values.length, 4);
  assert(values[1] > values[0]);
  assert(values[0] > values[2]);
  assert.equal(values[3], 255);
  assert.deepEqual(toAlphaArray(grayscale), toAlphaArray(source));
});

test('applyGrayscale supports custom weighting coefficients', () => {
  const data = new Uint8ClampedArray([
    200, 20, 20, 255,
    0, 100, 255, 200,
  ]);
  const source = new ImageData(data, 1, 2);
  const grayscale = applyGrayscale(source, { weights: [1, 1, 1] });
  const values = toGrayArray(grayscale);

  assert.equal(values[0], Math.round((200 + 20 + 20) / 3));
  assert.equal(values[1], Math.round((0 + 100 + 255) / 3));
});

const createEdgeTestImage = () => {
  const width = 5;
  const height = 5;
  const values = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      values.push(y < 2 ? 0 : 255);
    }
  }
  return createImageData(width, height, values);
};

test('applySobelOperator emphasises the strongest gradient band', () => {
  const source = createEdgeTestImage();
  const sobel = applySobelOperator(source);
  const values = toGrayArray(sobel);

  const width = source.width;
  const strongBand = values.slice(width * 2, width * 3);
  const weakBand = values.slice(0, width);

  assert(strongBand.every((value) => value >= 80));
  assert(weakBand.every((value) => value <= 5));
});

test('applyPrewittOperator responds similarly to the Sobel operator', () => {
  const source = createEdgeTestImage();
  const prewitt = applyPrewittOperator(source);
  const values = toGrayArray(prewitt);

  const width = source.width;
  const band = values.slice(width * 2, width * 3);

  assert(band.every((value) => value >= 80));
});

test('edge operators honour thresholding and alpha preservation', () => {
  const source = createEdgeTestImage();
  const alphaData = source.data;
  for (let i = 0; i < alphaData.length; i += 4) {
    alphaData[i + 3] = 128;
  }

  const sobel = applySobelOperator(source, { threshold: 240 });
  const values = toGrayArray(sobel);
  const alphas = toAlphaArray(sobel);

  assert(values.every((value) => value === 0));
  assert(alphas.every((value) => value === 128));

  const sobelNoAlpha = applySobelOperator(source, { preserveAlpha: false });
  assert(toAlphaArray(sobelNoAlpha).every((value) => value === 255));
});

test('applyLaplacianOperator highlights transitions in intensity', () => {
  const source = createEdgeTestImage();
  const laplacian = applyLaplacianOperator(source);
  const values = toGrayArray(laplacian);

  const width = source.width;
  const band = values.slice(width * 2, width * 3);
  const outer = [...values.slice(0, width), ...values.slice(width * 4)];

  assert(band.every((value) => value >= 30));
  assert(outer.every((value) => value <= 5));
});

test('computeHistogram tallies luminance and channel occurrences', () => {
  const data = new Uint8ClampedArray([
    10, 20, 30, 255,
    200, 150, 100, 128,
  ]);
  const image = new ImageData(data, 2, 1);

  const redHistogram = computeHistogram(image, { channel: 'red' });
  assert.equal(redHistogram[10], 1);
  assert.equal(redHistogram[200], 1);
  assert.equal(redHistogram.reduce((acc, value) => acc + value, 0), 2);

  const luminanceHistogram = computeHistogram(image);
  assert.equal(luminanceHistogram.reduce((acc, value) => acc + value, 0), 2);
});

test('applyHistogramEqualization redistributes grayscale intensities', () => {
  const source = createImageData(4, 1, [10, 50, 90, 130]);
  const equalized = applyHistogramEqualization(source);
  const values = toGrayArray(equalized);

  assert.equal(Math.min(...values), 0);
  assert.equal(Math.max(...values), 255);
  for (let i = 1; i < values.length; i += 1) {
    assert(values[i] > values[i - 1]);
  }
});

test('applyHistogramEqualization preserves hue when operating on luminance', () => {
  const data = new Uint8ClampedArray([
    50, 20, 20, 255,
    120, 60, 60, 255,
    180, 90, 90, 255,
    220, 120, 120, 255,
  ]);
  const image = new ImageData(data, 2, 2);

  const luminanceEqualised = applyHistogramEqualization(image, { mode: 'luminance' });
  const lumData = luminanceEqualised.data;
  const originalSecond = rgbToHsl(120 / 255, 60 / 255, 60 / 255);
  const resultSecond = rgbToHsl(lumData[4] / 255, lumData[5] / 255, lumData[6] / 255);
  approx(resultSecond.h, originalSecond.h, 0.001);
  approx(resultSecond.s, originalSecond.s, 0.02);

  const originalThird = rgbToHsl(180 / 255, 90 / 255, 90 / 255);
  const resultThird = rgbToHsl(lumData[8] / 255, lumData[9] / 255, lumData[10] / 255);
  approx(resultThird.h, originalThird.h, 0.001);
  approx(resultThird.s, originalThird.s, 0.02);

  assert.equal(lumData[3], 255);
  assert.equal(lumData[7], 255);
  assert.equal(lumData[11], 255);
  assert.equal(lumData[15], 255);

  const rgbEqualised = applyHistogramEqualization(image, { mode: 'rgb' });
  const reds = [rgbEqualised.data[0], rgbEqualised.data[4], rgbEqualised.data[8], rgbEqualised.data[12]];
  const greens = [rgbEqualised.data[1], rgbEqualised.data[5], rgbEqualised.data[9], rgbEqualised.data[13]];
  const blues = [rgbEqualised.data[2], rgbEqualised.data[6], rgbEqualised.data[10], rgbEqualised.data[14]];
  assert.equal(Math.min(...reds), 0);
  assert.equal(Math.max(...reds), 255);
  assert.equal(Math.min(...greens), 0);
  assert.equal(Math.max(...greens), 255);
  assert.equal(Math.min(...blues), 0);
  assert.equal(Math.max(...blues), 255);
  for (let i = 1; i < reds.length; i += 1) {
    assert(reds[i] > reds[i - 1]);
    assert(greens[i] > greens[i - 1]);
    assert(blues[i] > blues[i - 1]);
  }
});

test('applyThreshold supports manual and Otsu methods', () => {
  const source = createImageData(4, 1, [10, 150, 180, 250]);
  source.data[3] = 128;

  const manual = applyThreshold(source, { threshold: 160 });
  assert.deepEqual(toGrayArray(manual), [0, 0, 255, 255]);
  assert.deepEqual(toAlphaArray(manual), [0, 0, 255, 255]);

  const tinted = applyThreshold(source, {
    threshold: 160,
    foreground: [0, 255, 0],
    background: 32,
    preserveAlpha: false,
  });
  const tintedData = tinted.data;
  assert.deepEqual(Array.from(tintedData.slice(0, 4)), [32, 32, 32, 0]);
  assert.deepEqual(Array.from(tintedData.slice(8, 12)), [0, 255, 0, 255]);

  const otsuSource = createImageData(4, 1, [0, 0, 255, 255]);
  const otsu = applyThreshold(otsuSource, { method: 'otsu' });
  assert.deepEqual(toGrayArray(otsu), [0, 0, 255, 255]);
});

const collectActiveIndices = (imageData) => {
  const values = toGrayArray(imageData);
  const active = [];
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === 255) {
      active.push(i);
    }
  }
  return active;
};

test('applyDilation expands active pixels according to the structuring element', () => {
  const width = 5;
  const height = 5;
  const values = new Array(width * height).fill(0);
  const centreIndex = Math.floor(height / 2) * width + Math.floor(width / 2);
  values[centreIndex] = 255;
  const source = createImageData(width, height, values);

  const dilated = applyDilation(source);
  const active = collectActiveIndices(dilated);

  const expected = [];
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) {
      expected.push(y * width + x);
    }
  }

  assert.deepEqual(active.sort((a, b) => a - b), expected);
});

test('applyErosion shrinks regions that cannot contain the structuring element', () => {
  const width = 5;
  const height = 5;
  const values = new Array(width * height).fill(0);
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) {
      values[y * width + x] = 255;
    }
  }
  const source = createImageData(width, height, values);

  const eroded = applyErosion(source);
  const active = collectActiveIndices(eroded);

  const centreIndex = Math.floor(height / 2) * width + Math.floor(width / 2);
  assert.deepEqual(active, [centreIndex]);
});

test('applyMorphologicalOpening removes isolated noise while preserving shapes', () => {
  const width = 5;
  const height = 5;
  const values = new Array(width * height).fill(0);
  values[0] = 255; // isolated noise pixel
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) {
      values[y * width + x] = 255;
    }
  }
  const source = createImageData(width, height, values);

  const opened = applyMorphologicalOpening(source);
  const active = collectActiveIndices(opened);

  assert(!active.includes(0));
  assert(active.includes(Math.floor(height / 2) * width + Math.floor(width / 2)));
  assert.equal(active.length, 9);
});

test('applyMorphologicalClosing fills narrow gaps within shapes', () => {
  const width = 5;
  const height = 5;
  const values = new Array(width * height).fill(0);
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) {
      values[y * width + x] = 255;
    }
  }
  const holeIndex = Math.floor(height / 2) * width + Math.floor(width / 2);
  values[holeIndex] = 0;
  const source = createImageData(width, height, values);

  const closed = applyMorphologicalClosing(source);
  const active = collectActiveIndices(closed);

  assert(active.includes(holeIndex));
  assert.equal(active.length, 9);
});
