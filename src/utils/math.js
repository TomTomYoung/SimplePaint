/**
 * 数値ユーティリティ集。
 * 入力: 任意の数値と下限・上限
 * 出力: 範囲に収めた数値
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
