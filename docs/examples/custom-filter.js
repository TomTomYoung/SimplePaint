import { applyKernel } from '../../src/utils/image/processing.js';

const bloomKernel = [
  0, 0.05, 0,
  0.05, 0.6, 0.05,
  0, 0.05, 0,
];

export function applyBloom(canvasCtx) {
  const { width, height } = canvasCtx.canvas;
  const imageData = canvasCtx.getImageData(0, 0, width, height);
  const output = applyKernel(imageData, bloomKernel, 3);
  canvasCtx.putImageData(output, 0, 0);
}
