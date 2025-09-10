export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const dpr = () => window.devicePixelRatio || 1;
export const toHex = (r, g, b) =>
  "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");

export function resizeCanvasToDisplaySize(canvas, cssW, cssH) {
  const ratio = dpr();
  const w = Math.floor(cssW * ratio);
  const h = Math.floor(cssH * ratio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
