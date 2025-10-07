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

/**
 * 2 つの値を補間する。
 * 入力: 開始値、終了値、補間係数 (0〜1)
 * 出力: 補間された値
 */
export const lerp = (start, end, t) => start + (end - start) * t;

/**
 * 値が 2 つの範囲のどこに位置するかを求める。
 * 入力: 開始値、終了値、評価したい値
 * 出力: 補間係数 (開始値と終了値が同じ場合は 0)
 */
export const inverseLerp = (start, end, value) => {
  if (start === end) return 0;
  return (value - start) / (end - start);
};

/**
 * 一つの範囲から別の範囲へ値を線形マッピングする。
 * 入力: 変換したい値、入力範囲の最小・最大、出力範囲の最小・最大
 * 出力: マッピングされた値
 */
export const remap = (value, inMin, inMax, outMin, outMax) =>
  lerp(outMin, outMax, inverseLerp(inMin, inMax, value));

/**
 * 2 点間の距離を計算する。
 * 入力: それぞれの点の x, y 座標
 * 出力: 2 点間の距離
 */
export const distance = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
