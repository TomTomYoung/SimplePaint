import { bmp, flattenLayers } from '../core/layer.js';
import { renderToCanvas, canvasToBlob, downloadBlob } from './file-io.js';

function formatToMime(format) {
  switch (format) {
    case 'jpg':
    case 'jpeg':
      return { mime: 'image/jpeg', quality: 0.92 };
    case 'webp':
      return { mime: 'image/webp', quality: 0.92 };
    default:
      return { mime: 'image/png', quality: undefined };
  }
}

export function renderDocumentCanvas({ format } = {}) {
  const backgroundColor = format === 'jpg' || format === 'jpeg' ? '#ffffff' : undefined;
  return renderToCanvas({
    width: bmp.width,
    height: bmp.height,
    backgroundColor,
    render: (ctx) => flattenLayers(ctx),
  });
}

export async function saveDocumentAs(format) {
  const canvas = renderDocumentCanvas({ format });
  const { mime, quality } = formatToMime(format);
  const blob = await canvasToBlob(canvas, mime, quality);
  downloadBlob(blob, `image.${format}`);
}
