/**
 * 数値ユーティリティ集。
 * 入力: 任意の数値と下限・上限
 * 出力: 範囲に収めた数値
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * 0〜1 に正規化した値を返す。
 * 入力: 任意の数値
 * 出力: 0 以上 1 以下の数値
 */
export const clamp01 = (value) => clamp(value, 0, 1);
