/**
 * 色空間変換ユーティリティ。
 * 入力: 0〜1 の RGB/HSV 値
 * 出力: 変換後の色成分
 */
import { clamp01 } from './math.js';

/**
 * RGB(0〜1) → HSV 変換。
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {{h:number,s:number,v:number}}
 */
export const rgbToHsv = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h /= 6;
    if (h < 0) {
      h += 1;
    }
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
};

/**
 * HSV → RGB(0〜1) 変換。
 * @param {number} h 0〜1 の色相
 * @param {number} s 0〜1 の彩度
 * @param {number} v 0〜1 の明度
 * @returns {{r:number,g:number,b:number}}
 */
export const hsvToRgb = (h, s, v) => {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0:
      return { r: v, g: t, b: p };
    case 1:
      return { r: q, g: v, b: p };
    case 2:
      return { r: p, g: v, b: t };
    case 3:
      return { r: p, g: q, b: v };
    case 4:
      return { r: t, g: p, b: v };
    case 5:
    default:
      return { r: v, g: p, b: q };
  }
};

/**
 * RGB の各成分を 0〜1 に正規化する。
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {[number, number, number]}
 */
export const normalizeRgb = (r, g, b) => [clamp01(r), clamp01(g), clamp01(b)];

/**
 * 0〜1 の RGB 成分を 0〜255 の整数へ変換する。
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {[number, number, number]}
 */
export const denormalizeRgb = (r, g, b) => [
  Math.round(clamp01(r) * 255),
  Math.round(clamp01(g) * 255),
  Math.round(clamp01(b) * 255),
];
