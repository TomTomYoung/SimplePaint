/**
 * Canvas関連のヘルパー。
 * 入力: Canvas要素と表示サイズ
 * 出力: DPRを考慮した実ピクセルサイズ
 */
export const getDevicePixelRatio = () => window.devicePixelRatio || 1;

export function resizeCanvasToDisplaySize(canvas, cssWidth, cssHeight) {
  const ratio = getDevicePixelRatio();
  const width = Math.floor(cssWidth * ratio);
  const height = Math.floor(cssHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}
