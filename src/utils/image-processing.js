/**
 * 画像処理ユーティリティ。
 * 入力: ImageData / Canvas と調整パラメータ
 * 出力: 調整後の ImageData / Canvas
 */
import { clamp01 } from './math.js';
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
