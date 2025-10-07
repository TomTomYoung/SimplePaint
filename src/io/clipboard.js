import { canvasToBlob, loadImageFile } from './file-io.js';

/**
 * Write a canvas image to the async clipboard API.
 * @param {HTMLCanvasElement} canvas
 * @param {string} [mime='image/png']
 */
export async function writeCanvasToClipboard(canvas, mime = 'image/png') {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard API is not available');
  }
  const blob = await canvasToBlob(canvas, mime);
  await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
}

/**
 * Extract the first image-like payload from clipboard items and convert it to a canvas.
 * @param {ClipboardItems} items
 * @returns {Promise<{canvas: HTMLCanvasElement, width: number, height: number}>}
 */
export async function extractImageFromClipboardItems(items) {
  for (const item of items) {
    for (const type of item.types) {
      if (type.startsWith('image/')) {
        const blob = await item.getType(type);
        const { canvas, width, height } = await loadImageFile(blob);
        return { canvas, width, height };
      }
    }
  }
  return null;
}

/**
 * Attempt to read clipboard contents and return the first image payload, if any.
 * @returns {Promise<{canvas: HTMLCanvasElement, width: number, height: number} | null>}
 */
export async function readClipboardImage() {
  if (!navigator.clipboard?.read) return null;
  const items = await navigator.clipboard.read();
  return extractImageFromClipboardItems(items);
}
