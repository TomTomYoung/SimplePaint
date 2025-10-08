/**
 * 色ユーティリティ。
 * 入力: RGB値またはHex文字列
 * 出力: 変換済みの色データ
 */
export const toHex = (r, g, b) =>
  `#${[r, g, b]
    .map((component) =>
      Math.round(Math.max(0, Math.min(255, component)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;

export const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;

  if (expanded.length !== 6) {
    throw new Error('Invalid hex color: ' + hex);
  }
  const intVal = parseInt(expanded, 16);
  return {
    r: (intVal >> 16) & 0xff,
    g: (intVal >> 8) & 0xff,
    b: intVal & 0xff,
  };
};

export const rgbaToString = (r, g, b, a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;

export {
  normalizeRgb,
  denormalizeRgb,
  normalizeAlpha,
  denormalizeAlpha,
  rgbToHsv,
  hsvToRgb,
  rgbToHsl,
  hslToRgb,
  srgbToLinear,
  linearToSrgb,
  rgbToXyz,
  xyzToRgb,
  xyzToLab,
  labToXyz,
  rgbToLab,
  labToRgb,
  labToLch,
  lchToLab,
  rgbToLch,
  lchToRgb,
} from './space.js';
