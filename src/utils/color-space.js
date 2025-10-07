/**
 * 色空間変換ユーティリティ。
 * 入力: 0〜1 の RGB/HSV 値
 * 出力: 変換後の色成分
 */
import { clamp01 } from './math.js';

const clampUnit = (value) => clamp01(value);

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
 * RGB → HSL 変換。
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {{h:number,s:number,l:number}}
 */
export const rgbToHsl = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let h;
  switch (max) {
    case r:
      h = (g - b) / delta + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / delta + 2;
      break;
    default:
      h = (r - g) / delta + 4;
      break;
  }

  return { h: (h / 6) % 1, s, l };
};

const hueToRgb = (p, q, t) => {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
};

/**
 * HSL → RGB 変換。
 * @param {number} h 0〜1 の色相
 * @param {number} s 0〜1 の彩度
 * @param {number} l 0〜1 の輝度
 * @returns {{r:number,g:number,b:number}}
 */
export const hslToRgb = (h, s, l) => {
  if (s === 0) {
    return { r: l, g: l, b: l };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: hueToRgb(p, q, h + 1 / 3),
    g: hueToRgb(p, q, h),
    b: hueToRgb(p, q, h - 1 / 3),
  };
};

/**
 * RGB の各成分を 0〜1 に正規化する。
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {[number, number, number]}
 */
export const normalizeRgb = (r, g, b) => [clampUnit(r), clampUnit(g), clampUnit(b)];

/**
 * 0〜1 の RGB 成分を 0〜255 の整数へ変換する。
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {[number, number, number]}
 */
export const denormalizeRgb = (r, g, b) => [
  Math.round(clampUnit(r) * 255),
  Math.round(clampUnit(g) * 255),
  Math.round(clampUnit(b) * 255),
];

/**
 * アルファ値を 0〜1 に正規化する。
 * @param {number} a
 * @returns {number}
 */
export const normalizeAlpha = (a) => clampUnit(a);

/**
 * 0〜1 のアルファを 0〜255 の整数に変換する。
 * @param {number} a
 * @returns {number}
 */
export const denormalizeAlpha = (a) => Math.round(clampUnit(a) * 255);

/**
 * sRGB(0〜1) から線形 RGB へ変換する。
 * @param {number} value
 * @returns {number}
 */
export const srgbToLinear = (value) => {
  const v = clampUnit(value);
  if (v <= 0.04045) {
    return v / 12.92;
  }
  return ((v + 0.055) / 1.055) ** 2.4;
};

/**
 * 線形 RGB(0〜1) から sRGB へ変換する。
 * @param {number} value
 * @returns {number}
 */
export const linearToSrgb = (value) => {
  const v = clampUnit(value);
  if (v <= 0.0031308) {
    return 12.92 * v;
  }
  return 1.055 * v ** (1 / 2.4) - 0.055;
};
