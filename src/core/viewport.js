const clampValue = (value, min, max) => {
  let lo = min;
  let hi = max;
  if (Number.isFinite(lo) && Number.isFinite(hi) && lo > hi) {
    const mid = (lo + hi) / 2;
    lo = mid;
    hi = mid;
  }
  if (Number.isFinite(lo)) value = Math.max(lo, value);
  if (Number.isFinite(hi)) value = Math.min(hi, value);
  return value;
};

const computeContainRange = (length, screenLength, padding) => {
  if (length <= 0 || screenLength <= 0) {
    return { min: 0, max: 0 };
  }
  const safePadding = Math.max(0, padding);
  const available = Math.max(screenLength - safePadding * 2, 0);
  if (length <= available) {
    const center = (screenLength - length) / 2;
    return { min: center, max: center };
  }
  return {
    min: screenLength - safePadding - length,
    max: safePadding,
  };
};

const toFiniteOr = (value, fallback) =>
  Number.isFinite(value) ? value : fallback;

export class Viewport {
  constructor(options = {}) {
    this.zoom = toFiniteOr(options.zoom, 1);
    this.panX = toFiniteOr(options.panX, 0);
    this.panY = toFiniteOr(options.panY, 0);
    this.minZoom = toFiniteOr(options.minZoom, 0.1);
    this.maxZoom = toFiniteOr(options.maxZoom, 32);
    this.imageWidth = Math.max(0, options.imageWidth || 0);
    this.imageHeight = Math.max(0, options.imageHeight || 0);
    this.screenWidth = Math.max(0, options.screenWidth || 0);
    this.screenHeight = Math.max(0, options.screenHeight || 0);
    this.panBounds = null;
    this.containImage = false;
    this.containPadding = 0;
  }

  clampZoom(value) {
    const min = Number.isFinite(this.minZoom) ? this.minZoom : value;
    const max = Number.isFinite(this.maxZoom) ? this.maxZoom : value;
    return clampValue(value, min, max);
  }

  setZoomBounds(minZoom, maxZoom) {
    if (Number.isFinite(minZoom)) this.minZoom = minZoom;
    if (Number.isFinite(maxZoom)) this.maxZoom = maxZoom;
    this.zoom = this.clampZoom(this.zoom);
    this.applyPanConstraints();
  }

  setImageSize(width, height) {
    this.imageWidth = Math.max(0, width || 0);
    this.imageHeight = Math.max(0, height || 0);
    this.applyPanConstraints();
  }

  setViewportSize(width, height) {
    this.screenWidth = Math.max(0, width || 0);
    this.screenHeight = Math.max(0, height || 0);
    this.applyPanConstraints();
  }

  setPanBounds(bounds) {
    this.panBounds = bounds
      ? {
          minX: Number.isFinite(bounds.minX) ? bounds.minX : -Infinity,
          maxX: Number.isFinite(bounds.maxX) ? bounds.maxX : Infinity,
          minY: Number.isFinite(bounds.minY) ? bounds.minY : -Infinity,
          maxY: Number.isFinite(bounds.maxY) ? bounds.maxY : Infinity,
        }
      : null;
    this.applyPanConstraints();
  }

  setContainImage(enabled, options = {}) {
    this.containImage = Boolean(enabled);
    if (options.padding != null) {
      this.containPadding = Math.max(0, options.padding);
    }
    this.applyPanConstraints();
  }

  screenToImage(x, y) {
    const safeZoom = this.zoom || 1;
    return {
      x: (x - this.panX) / safeZoom,
      y: (y - this.panY) / safeZoom,
    };
  }

  imageToScreen(x, y) {
    return {
      x: x * this.zoom + this.panX,
      y: y * this.zoom + this.panY,
    };
  }

  setPan(x, y, options = {}) {
    if (Number.isFinite(x)) this.panX = x;
    if (Number.isFinite(y)) this.panY = y;
    return this.applyPanConstraints(options);
  }

  panBy(dx, dy, options = {}) {
    if (Number.isFinite(dx)) this.panX += dx;
    if (Number.isFinite(dy)) this.panY += dy;
    return this.applyPanConstraints(options);
  }

  zoomAt(sx, sy, factor, options = {}) {
    if (!Number.isFinite(factor) || factor === 0) {
      return this.zoom;
    }
    const anchor = this.screenToImage(sx, sy);
    let newZoom = this.zoom * factor;
    if (options.clampZoom !== false) {
      const min = Number.isFinite(options.minZoom) ? options.minZoom : this.minZoom;
      const max = Number.isFinite(options.maxZoom) ? options.maxZoom : this.maxZoom;
      const prevMin = this.minZoom;
      const prevMax = this.maxZoom;
      if (Number.isFinite(options.minZoom)) this.minZoom = min;
      if (Number.isFinite(options.maxZoom)) this.maxZoom = max;
      newZoom = this.clampZoom(newZoom);
      this.minZoom = prevMin;
      this.maxZoom = prevMax;
    }
    if (!(newZoom > 0)) {
      return this.zoom;
    }
    this.zoom = newZoom;
    const after = this.imageToScreen(anchor.x, anchor.y);
    this.panX += sx - after.x;
    this.panY += sy - after.y;
    this.applyPanConstraints(options);
    return this.zoom;
  }

  fitToScreen(width, height, containerRect, options = {}) {
    const w = Math.max(0, width || 0);
    const h = Math.max(0, height || 0);
    const rect = containerRect || { width: 0, height: 0 };
    const padding = Math.max(0, options.padding || 0);

    this.setImageSize(w, h);
    this.setViewportSize(rect.width || 0, rect.height || 0);

    if (!(w > 0 && h > 0 && rect.width > 0 && rect.height > 0)) {
      this.zoom = this.clampZoom(1);
      this.panX = 0;
      this.panY = 0;
      return { zoom: this.zoom, panX: this.panX, panY: this.panY };
    }

    const availableWidth = Math.max(rect.width - padding * 2, 0);
    const availableHeight = Math.max(rect.height - padding * 2, 0);
    const zx = availableWidth > 0 ? availableWidth / w : 0;
    const zy = availableHeight > 0 ? availableHeight / h : 0;
    const ratios = [zx, zy].filter(v => v > 0);
    const targetZoom = ratios.length ? Math.min(...ratios) : 0;
    const zoomToApply = options.clampZoom === false
      ? targetZoom
      : this.clampZoom(targetZoom || this.zoom);
    this.zoom = zoomToApply > 0 ? zoomToApply : this.clampZoom(this.zoom);

    const centerX = w / 2;
    const centerY = h / 2;
    const desiredScreenX = padding + availableWidth / 2;
    const desiredScreenY = padding + availableHeight / 2;
    this.panX = desiredScreenX - centerX * this.zoom;
    this.panY = desiredScreenY - centerY * this.zoom;

    this.setContainImage(options.containImage ?? this.containImage, {
      padding: options.padding ?? this.containPadding,
    });
    this.applyPanConstraints(options);
    return { zoom: this.zoom, panX: this.panX, panY: this.panY };
  }

  applyPanConstraints(options = {}) {
    if (options.constrainPan === false) {
      return { panX: this.panX, panY: this.panY };
    }

    let minX = -Infinity;
    let maxX = Infinity;
    let minY = -Infinity;
    let maxY = Infinity;

    const bounds = options.panBounds || this.panBounds;
    if (bounds) {
      if (Number.isFinite(bounds.minX)) minX = Math.max(minX, bounds.minX);
      if (Number.isFinite(bounds.maxX)) maxX = Math.min(maxX, bounds.maxX);
      if (Number.isFinite(bounds.minY)) minY = Math.max(minY, bounds.minY);
      if (Number.isFinite(bounds.maxY)) maxY = Math.min(maxY, bounds.maxY);
    }

    if (options.containImage ?? this.containImage) {
      const padding = options.padding ?? this.containPadding;
      const zoomedWidth = this.imageWidth * this.zoom;
      const zoomedHeight = this.imageHeight * this.zoom;
      const horizontal = computeContainRange(zoomedWidth, this.screenWidth, padding);
      const vertical = computeContainRange(zoomedHeight, this.screenHeight, padding);
      minX = Math.max(minX, horizontal.min);
      maxX = Math.min(maxX, horizontal.max);
      minY = Math.max(minY, vertical.min);
      maxY = Math.min(maxY, vertical.max);
    }

    this.panX = clampValue(this.panX, minX, maxX);
    this.panY = clampValue(this.panY, minY, maxY);
    return { panX: this.panX, panY: this.panY };
  }

  resetView() {
    this.zoom = this.clampZoom(1);
    this.panX = 0;
    this.panY = 0;
    this.applyPanConstraints();
  }
}
