export class Viewport {
  constructor() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  screenToImage(x, y) {
    return {
      x: (x - this.panX) / this.zoom,
      y: (y - this.panY) / this.zoom,
    };
  }

  imageToScreen(x, y) {
    return {
      x: x * this.zoom + this.panX,
      y: y * this.zoom + this.panY,
    };
  }

  fitToScreen(width, height, containerRect) {
    const zx = containerRect.width / width;
    const zy = containerRect.height / height;
    this.zoom = Math.min(zx, zy);

    const c = { x: width / 2, y: height / 2 };
    const scr = this.imageToScreen(c.x, c.y);
    this.panX += containerRect.width / 2 - scr.x;
    this.panY += containerRect.height / 2 - scr.y;
  }

  resetView() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }
}
