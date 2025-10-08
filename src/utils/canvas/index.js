/**
 * Canvas関連のヘルパー。
 * 入力: Canvas要素と表示サイズ
 * 出力: DPRを考慮した実ピクセルサイズ
 */

const DEFAULT_MIN_DEVICE_PIXEL_RATIO = 1;
const DEFAULT_MAX_DEVICE_PIXEL_RATIO = 4;

/**
 * 現在のデバイスピクセル比を取得する。ブラウザ環境以外では 1 を返す。
 * @returns {number}
 */
export const getDevicePixelRatio = () => {
  if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number') {
    const ratio = window.devicePixelRatio;
    if (Number.isFinite(ratio) && ratio > 0) {
      return ratio;
    }
  }
  return 1;
};

/**
 * デバイスピクセル比を正規化する。
 * @param {number} ratio
 * @param {number} [min=DEFAULT_MIN_DEVICE_PIXEL_RATIO]
 * @param {number} [max=DEFAULT_MAX_DEVICE_PIXEL_RATIO]
 * @returns {number}
 */
export function normaliseDevicePixelRatio(ratio, min = DEFAULT_MIN_DEVICE_PIXEL_RATIO, max = DEFAULT_MAX_DEVICE_PIXEL_RATIO) {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 1;
  }
  if (Number.isFinite(min)) {
    ratio = Math.max(ratio, min);
  }
  if (Number.isFinite(max)) {
    ratio = Math.min(ratio, max);
  }
  return ratio;
}

/**
 * Canvas のピクセルサイズを指定値へ更新する。変更が行われた場合は true を返す。
 * @param {HTMLCanvasElement} canvas
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
export function ensureCanvasSize(canvas, width, height) {
  const resolvedWidth = Number.isFinite(width) && width >= 0 ? width : 0;
  const resolvedHeight = Number.isFinite(height) && height >= 0 ? height : 0;
  if (canvas.width !== resolvedWidth || canvas.height !== resolvedHeight) {
    canvas.width = resolvedWidth;
    canvas.height = resolvedHeight;
    return true;
  }
  return false;
}

function resolveCssLength(canvas, explicitValue, fallbackProperty, defaultValue = 0) {
  if (Number.isFinite(explicitValue) && explicitValue >= 0) {
    return explicitValue;
  }
  const fallback = canvas?.[fallbackProperty];
  if (Number.isFinite(fallback) && fallback >= 0) {
    return fallback;
  }
  return defaultValue;
}

/**
 * Canvas を CSS サイズに合わせてリサイズし、実ピクセル数と使用した DPR を返す。
 * @param {HTMLCanvasElement} canvas
 * @param {number} [cssWidth]
 * @param {number} [cssHeight]
 * @param {Object} [options]
 * @param {number} [options.devicePixelRatio]
 * @param {number} [options.minDevicePixelRatio]
 * @param {number} [options.maxDevicePixelRatio]
 * @param {Function} [options.round=Math.round]
 * @param {boolean} [options.applyCssSize=true]
 * @returns {{width: number, height: number, ratio: number, changed: boolean}}
 */
export function resizeCanvasToDisplaySize(
  canvas,
  cssWidth,
  cssHeight,
  {
    devicePixelRatio = getDevicePixelRatio(),
    minDevicePixelRatio = DEFAULT_MIN_DEVICE_PIXEL_RATIO,
    maxDevicePixelRatio = DEFAULT_MAX_DEVICE_PIXEL_RATIO,
    round = Math.round,
    applyCssSize = true,
  } = {},
) {
  if (!canvas) {
    throw new TypeError('Canvas element is required');
  }

  const ratio = normaliseDevicePixelRatio(devicePixelRatio, minDevicePixelRatio, maxDevicePixelRatio);
  const resolvedCssWidth = resolveCssLength(canvas, cssWidth, 'clientWidth', canvas.width);
  const resolvedCssHeight = resolveCssLength(canvas, cssHeight, 'clientHeight', canvas.height);

  const roundFn = typeof round === 'function' ? round : Math.round;
  const pixelWidth = Math.max(0, roundFn(resolvedCssWidth * ratio));
  const pixelHeight = Math.max(0, roundFn(resolvedCssHeight * ratio));
  const changed = ensureCanvasSize(canvas, pixelWidth, pixelHeight);

  if (applyCssSize && canvas.style) {
    if (Number.isFinite(resolvedCssWidth)) {
      canvas.style.width = `${resolvedCssWidth}px`;
    }
    if (Number.isFinite(resolvedCssHeight)) {
      canvas.style.height = `${resolvedCssHeight}px`;
    }
  }

  return { width: pixelWidth, height: pixelHeight, ratio, changed };
}

/**
 * 2D コンテキストを指定した DPR に合わせてスケーリングする。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} [ratio=getDevicePixelRatio()]
 * @param {{reset?: boolean}} [options]
 * @returns {number}
 */
export function scaleContextForDPR(ctx, ratio = getDevicePixelRatio(), { reset = false } = {}) {
  const resolvedRatio = normaliseDevicePixelRatio(ratio);
  if (!ctx) {
    return resolvedRatio;
  }

  if (reset) {
    if (typeof ctx.setTransform === 'function') {
      ctx.setTransform(resolvedRatio, 0, 0, resolvedRatio, 0, 0);
      return resolvedRatio;
    }
    if (typeof ctx.resetTransform === 'function') {
      ctx.resetTransform();
      if (resolvedRatio !== 1 && typeof ctx.scale === 'function') {
        ctx.scale(resolvedRatio, resolvedRatio);
      }
      return resolvedRatio;
    }
  }

  if (resolvedRatio !== 1 && typeof ctx.scale === 'function') {
    ctx.scale(resolvedRatio, resolvedRatio);
  }
  return resolvedRatio;
}

function defaultCreateCanvas() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new Error('No document available to create a canvas element');
  }
  return document.createElement('canvas');
}

/**
 * DPR に合わせたオフスクリーン Canvas を生成し、2D コンテキストを返す。
 * @param {number} width CSS ピクセルでの幅
 * @param {number} height CSS ピクセルでの高さ
 * @param {Object} [options]
 * @param {HTMLCanvasElement} [options.canvas]
 * @param {string} [options.contextType='2d']
 * @param {CanvasRenderingContext2DSettings|WebGLContextAttributes} [options.contextAttributes]
 * @param {number} [options.devicePixelRatio]
 * @param {number} [options.minDevicePixelRatio]
 * @param {number} [options.maxDevicePixelRatio]
 * @param {boolean} [options.applyCssSize=true]
 * @param {boolean} [options.scaleContext=true]
 * @param {Function} [options.createCanvas]
 * @returns {{canvas: HTMLCanvasElement, context: CanvasRenderingContext2D|null, ratio: number, width: number, height: number}}
 */
export function createHiDPICanvas(
  width,
  height,
  {
    canvas,
    contextType = '2d',
    contextAttributes,
    devicePixelRatio = getDevicePixelRatio(),
    minDevicePixelRatio = DEFAULT_MIN_DEVICE_PIXEL_RATIO,
    maxDevicePixelRatio = DEFAULT_MAX_DEVICE_PIXEL_RATIO,
    applyCssSize = true,
    scaleContext = true,
    createCanvas = defaultCreateCanvas,
  } = {},
) {
  const ratio = normaliseDevicePixelRatio(devicePixelRatio, minDevicePixelRatio, maxDevicePixelRatio);
  const targetCanvas = canvas ?? createCanvas();

  const pixelWidth = Math.max(0, Math.round(width * ratio));
  const pixelHeight = Math.max(0, Math.round(height * ratio));
  ensureCanvasSize(targetCanvas, pixelWidth, pixelHeight);

  if (applyCssSize && targetCanvas.style) {
    if (Number.isFinite(width)) {
      targetCanvas.style.width = `${width}px`;
    }
    if (Number.isFinite(height)) {
      targetCanvas.style.height = `${height}px`;
    }
  }

  let context = null;
  if (typeof targetCanvas.getContext === 'function') {
    context = targetCanvas.getContext(contextType, contextAttributes) || null;
  }

  if (scaleContext && context && contextType === '2d') {
    scaleContextForDPR(context, ratio, { reset: true });
  }

  return { canvas: targetCanvas, context, ratio, width: pixelWidth, height: pixelHeight };
}

function computeScaleFactors(srcWidth, srcHeight, targetWidth, targetHeight) {
  if (!(Number.isFinite(srcWidth) && Number.isFinite(srcHeight)) || srcWidth <= 0 || srcHeight <= 0) {
    return { contain: 0, cover: 0 };
  }
  const safeTargetWidth = Number.isFinite(targetWidth) && targetWidth > 0 ? targetWidth : 0;
  const safeTargetHeight = Number.isFinite(targetHeight) && targetHeight > 0 ? targetHeight : 0;
  const contain = safeTargetWidth && safeTargetHeight
    ? Math.min(safeTargetWidth / srcWidth, safeTargetHeight / srcHeight)
    : 0;
  const cover = safeTargetWidth && safeTargetHeight
    ? Math.max(safeTargetWidth / srcWidth, safeTargetHeight / srcHeight)
    : 0;
  return { contain, cover };
}

/**
 * 元画像をアスペクト比を保ったまま指定範囲に内接させるサイズを計算する。
 * @param {number} srcWidth
 * @param {number} srcHeight
 * @param {number} maxWidth
 * @param {number} maxHeight
 * @returns {{width: number, height: number, scale: number}}
 */
export function computeContainFit(srcWidth, srcHeight, maxWidth, maxHeight) {
  const { contain } = computeScaleFactors(srcWidth, srcHeight, maxWidth, maxHeight);
  if (!contain) {
    return { width: 0, height: 0, scale: 0 };
  }
  return {
    width: srcWidth * contain,
    height: srcHeight * contain,
    scale: contain,
  };
}

/**
 * 元画像を指定範囲を覆うように拡大縮小したサイズを計算する。
 * @param {number} srcWidth
 * @param {number} srcHeight
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {{width: number, height: number, scale: number}}
 */
export function computeCoverFit(srcWidth, srcHeight, targetWidth, targetHeight) {
  const { cover } = computeScaleFactors(srcWidth, srcHeight, targetWidth, targetHeight);
  if (!cover) {
    return { width: 0, height: 0, scale: 0 };
  }
  return {
    width: srcWidth * cover,
    height: srcHeight * cover,
    scale: cover,
  };
}

/**
 * Canvas 全体をクリアするユーティリティ。
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 */
export function clearCanvas(ctx, canvas) {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
