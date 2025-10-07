/**
 * Utility helpers for working with file based image IO.
 * These helpers operate on plain browser primitives so they can be reused
 * across different applications that need canvas/image conversion.
 */

/**
 * Load an image from a File or Blob object.
 * @param {File|Blob} file
 * @returns {Promise<{image: HTMLImageElement, width: number, height: number, canvas: HTMLCanvasElement}>}
 */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = createCanvasFromImageSource(img);
        resolve({
          image: img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          canvas,
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Create a canvas that contains the provided image source drawn at origin.
 * @param {CanvasImageSource} source
 * @returns {HTMLCanvasElement}
 */
export function createCanvasFromImageSource(source) {
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/**
 * Render arbitrary content into an off-screen canvas.
 * @param {Object} options
 * @param {number} options.width
 * @param {number} options.height
 * @param {string} [options.backgroundColor]
 * @param {(ctx: CanvasRenderingContext2D) => void} options.render
 * @returns {HTMLCanvasElement}
 */
export function renderToCanvas({ width, height, backgroundColor, render }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }
  if (typeof render === 'function') {
    render(ctx);
  }
  return canvas;
}

/**
 * Convert a canvas into a Blob with the specified mime type and quality.
 * @param {HTMLCanvasElement} canvas
 * @param {string} [mime='image/png']
 * @param {number} [quality]
 * @returns {Promise<Blob>}
 */
export function canvasToBlob(canvas, mime = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to convert canvas to blob'));
    }, mime, quality);
  });
}

/**
 * Trigger a download for a Blob by generating a temporary anchor element.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
