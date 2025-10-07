/**
 * 画像処理ユーティリティ。
 * 入力: ImageData / Canvas と調整パラメータ
 * 出力: 調整後の ImageData / Canvas
 */
import { clamp, clamp01 } from './math.js';
import { denormalizeRgb, hsvToRgb, normalizeRgb, rgbToHsv } from './color-space.js';

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const HUE_TO_UNIT = 1 / (2 * Math.PI);

/**
 * 1 ピクセル分の色調整を適用する。
 * @param {number} r 0〜1 の赤成分
 * @param {number} g 0〜1 の緑成分
 * @param {number} b 0〜1 の青成分
 * @param {number} brightness 追加する明度（-1〜1）
 * @param {number} contrast 1 を基準としたコントラスト倍率
 * @param {number} saturation 彩度倍率
 * @param {number} hue 色相回転 (ラジアン)
 * @param {boolean} invert 反転するか
 */
const applyAdjustmentsToPixel = (
  r,
  g,
  b,
  brightness,
  contrast,
  saturation,
  hue,
  invert,
) => {
  // 明度とコントラスト
  let nr = 0.5 + contrast * (r + brightness - 0.5);
  let ng = 0.5 + contrast * (g + brightness - 0.5);
  let nb = 0.5 + contrast * (b + brightness - 0.5);

  // HSV 空間で彩度・色相を調整
  const { h, s, v } = rgbToHsv(clamp01(nr), clamp01(ng), clamp01(nb));
  let hueAdjusted = (h + hue * HUE_TO_UNIT) % 1;
  if (hueAdjusted < 0) {
    hueAdjusted += 1;
  }
  const saturationAdjusted = clamp01(s * saturation);
  const { r: hr, g: hg, b: hb } = hsvToRgb(hueAdjusted, saturationAdjusted, v);

  nr = hr;
  ng = hg;
  nb = hb;

  if (invert) {
    nr = 1 - nr;
    ng = 1 - ng;
    nb = 1 - nb;
  }

  return denormalizeRgb(nr, ng, nb);
};

/**
 * ImageData に輝度/コントラスト等の調整を適用する。
 * 入力: 元の ImageData と調整パラメータ
 * 出力: 新しい ImageData
 */
export const applyAdjustmentsToImageData = (imageData, params = {}) => {
  const { width, height, data: src } = imageData;
  const dest = new ImageData(width, height);
  const dst = dest.data;

  const brightness = (params.brightness || 0) / 100;
  const contrast = 1 + (params.contrast || 0) / 100;
  const saturation = 1 + (params.saturation || 0) / 100;
  const hue = toRadians(params.hue || 0);
  const invert = Boolean(params.invert);

  for (let i = 0; i < src.length; i += 4) {
    const [r, g, b] = normalizeRgb(src[i] / 255, src[i + 1] / 255, src[i + 2] / 255);
    const [dr, dg, db] = applyAdjustmentsToPixel(
      r,
      g,
      b,
      brightness,
      contrast,
      saturation,
      hue,
      invert,
    );

    dst[i] = dr;
    dst[i + 1] = dg;
    dst[i + 2] = db;
    dst[i + 3] = Math.round(clamp01(src[i + 3] / 255) * 255);
  }

  return dest;
};

/**
 * Canvas に調整を適用した結果の Canvas を返す。
 * 入力: 元の Canvas と調整パラメータ
 * 出力: 調整済み Canvas
 */
export const applyFilterToCanvas = (srcCanvas, params = {}) => {
  const width = srcCanvas.width;
  const height = srcCanvas.height;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;

  const srcCtx = srcCanvas.getContext('2d');
  const dstCtx = out.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, width, height);
  const processed = applyAdjustmentsToImageData(srcData, params);
  dstCtx.putImageData(processed, 0, 0);

  return out;
};

const getKernelDimensions = (kernel, options) => {
  const width = options.width ?? Math.sqrt(kernel.length);
  const height = options.height ?? (options.width ? Math.ceil(kernel.length / options.width) : width);

  if (!Number.isInteger(width) || !Number.isInteger(height) || width * height !== kernel.length) {
    throw new Error('Kernel dimensions must match the number of entries.');
  }

  return { width, height };
};

const getPixelIndex = (width, x, y) => (y * width + x) * 4;

const sampleChannel = (data, width, height, x, y, channel) => {
  const clampedX = clamp(x, 0, width - 1);
  const clampedY = clamp(y, 0, height - 1);
  return data[getPixelIndex(width, clampedX, clampedY) + channel];
};

/**
 * ImageData に畳み込みフィルターを適用する。
 * 入力: ImageData とカーネル
 * 出力: 畳み込み後の ImageData
 */
export const convolveImageData = (imageData, kernel, options = {}) => {
  if (!Array.isArray(kernel) || kernel.length === 0) {
    throw new Error('Kernel must contain at least one value.');
  }

  const { width: kernelWidth, height: kernelHeight } = getKernelDimensions(kernel, options);
  const { width, height, data: src } = imageData;
  const out = new ImageData(width, height);
  const dst = out.data;

  const sum = kernel.reduce((acc, value) => acc + value, 0);
  const divisor = options.divisor ?? (Math.abs(sum) > 1e-6 ? sum : 1);
  const bias = options.bias ?? 0;
  const preserveAlpha = options.preserveAlpha ?? true;

  const halfW = Math.floor(kernelWidth / 2);
  const halfH = Math.floor(kernelHeight / 2);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let kernelIndex = 0;

      for (let ky = 0; ky < kernelHeight; ky += 1) {
        for (let kx = 0; kx < kernelWidth; kx += 1) {
          const weight = kernel[kernelIndex++];
          const sampleX = x + (kx - halfW);
          const sampleY = y + (ky - halfH);

          r += sampleChannel(src, width, height, sampleX, sampleY, 0) * weight;
          g += sampleChannel(src, width, height, sampleX, sampleY, 1) * weight;
          b += sampleChannel(src, width, height, sampleX, sampleY, 2) * weight;
        }
      }

      const outIndex = getPixelIndex(width, x, y);
      dst[outIndex] = clamp(Math.round(r / divisor + bias), 0, 255);
      dst[outIndex + 1] = clamp(Math.round(g / divisor + bias), 0, 255);
      dst[outIndex + 2] = clamp(Math.round(b / divisor + bias), 0, 255);
      dst[outIndex + 3] = preserveAlpha
        ? src[outIndex + 3]
        : clamp(Math.round(sampleChannel(src, width, height, x, y, 3) / divisor + bias), 0, 255);
    }
  }

  return out;
};

const createBoxBlurKernel = (radius) => {
  const size = radius * 2 + 1;
  const total = size * size;
  const weight = 1 / total;
  return new Array(total).fill(weight);
};

const createGaussianKernel = (sigma) => {
  const effectiveSigma = Math.max(sigma, 0.1);
  const radius = Math.max(1, Math.ceil(effectiveSigma * 3));
  const size = radius * 2 + 1;
  const kernel = new Array(size * size);
  const sigmaSq2 = 2 * effectiveSigma * effectiveSigma;
  const normaliser = 1 / (Math.PI * sigmaSq2);

  let index = 0;
  let sum = 0;
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const value = normaliser * Math.exp(-(x * x + y * y) / sigmaSq2);
      kernel[index++] = value;
      sum += value;
    }
  }

  for (let i = 0; i < kernel.length; i += 1) {
    kernel[i] /= sum;
  }

  return { kernel, size };
};

/**
 * ボックスブラーを適用する。
 * 入力: ImageData と半径
 * 出力: ぼかし後の ImageData
 */
export const applyBoxBlur = (imageData, radius = 1) => {
  const intRadius = Math.max(0, Math.floor(radius));
  if (intRadius === 0) {
    return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  }

  const kernel = createBoxBlurKernel(intRadius);
  const size = intRadius * 2 + 1;
  return convolveImageData(imageData, kernel, { width: size, height: size });
};

/**
 * ガウシアンブラーを適用する。
 * 入力: ImageData とシグマ値
 * 出力: ぼかし後の ImageData
 */
export const applyGaussianBlur = (imageData, sigma = 1) => {
  const { kernel, size } = createGaussianKernel(sigma);
  return convolveImageData(imageData, kernel, { width: size, height: size });
};

/**
 * アンシャープマスクを適用し、輪郭を強調する。
 * 入力: ImageData と調整パラメータ
 * 出力: シャープ処理済み ImageData
 */
export const applyUnsharpMask = (imageData, options = {}) => {
  const amount = options.amount ?? 0.5;
  const threshold = options.threshold ?? 0;
  const sigma = options.radius ?? options.sigma ?? 1;

  const blurred = applyGaussianBlur(imageData, sigma);
  const { width, height, data: src } = imageData;
  const dst = new ImageData(width, height);
  const out = dst.data;
  const blurredData = blurred.data;

  for (let i = 0; i < src.length; i += 4) {
    const rDiff = src[i] - blurredData[i];
    const gDiff = src[i + 1] - blurredData[i + 1];
    const bDiff = src[i + 2] - blurredData[i + 2];

    const applyR = Math.abs(rDiff) >= threshold;
    const applyG = Math.abs(gDiff) >= threshold;
    const applyB = Math.abs(bDiff) >= threshold;

    out[i] = clamp(Math.round(src[i] + (applyR ? rDiff * amount : 0)), 0, 255);
    out[i + 1] = clamp(Math.round(src[i + 1] + (applyG ? gDiff * amount : 0)), 0, 255);
    out[i + 2] = clamp(Math.round(src[i + 2] + (applyB ? bDiff * amount : 0)), 0, 255);
    out[i + 3] = src[i + 3];
  }

  return dst;
};
