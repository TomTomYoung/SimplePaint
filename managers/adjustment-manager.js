import { applyFilterToCanvas } from "../filters.js";
import { bmp, layers, activeLayer } from "../layer.js";

export class AdjustmentManager {
  constructor(engine, layersRef = layers, activeLayerRef = activeLayer) {
    this.engine = engine;
    this.layers = layersRef;
    this.activeLayer = activeLayerRef;
    this.initElements();
  }

  initElements() {
    this.elements = {
      panel: document.getElementById("adjustPanel"),
      brightness: document.getElementById("adjBrightness"),
      contrast: document.getElementById("adjContrast"),
      saturation: document.getElementById("adjSaturation"),
      hue: document.getElementById("adjHue"),
      invert: document.getElementById("adjInvert"),
    };
  }

  resetToDefaults() {
    this.elements.brightness.value = 0;
    this.elements.contrast.value = 0;
    this.elements.saturation.value = 0;
    this.elements.hue.value = 0;
    this.elements.invert.checked = false;
  }

  startPreview() {
    this.updatePreview();
  }

  clearPreview() {
    this.engine.filterPreview = null;
    this.engine.requestRepaint();
  }

  updatePreview() {
    const sel = this.engine.selection;
    const params = {
      brightness: +this.elements.brightness.value,
      contrast: +this.elements.contrast.value,
      saturation: +this.elements.saturation.value,
      hue: +this.elements.hue.value,
      invert: this.elements.invert.checked ? 1 : 0,
    };
    if (sel && sel.floatCanvas) {
      const src = sel.floatCanvas;
      const can = applyFilterToCanvas(src, params);
      this.engine.filterPreview = { canvas: can, x: sel.pos.x, y: sel.pos.y };
    } else if (sel) {
      const { x, y, w, h } = sel.rect;
      const src = document.createElement("canvas");
      src.width = w;
      src.height = h;
      src.getContext("2d").drawImage(bmp, x, y, w, h, 0, 0, w, h);
      const can = applyFilterToCanvas(src, params);
      this.engine.filterPreview = { canvas: can, x, y };
    } else {
      const src = bmp;
      const can = applyFilterToCanvas(src, params);
      this.engine.filterPreview = { canvas: can, x: 0, y: 0 };
    }
    this.engine.requestRepaint();
  }

  applyFilter() {
    if (!this.engine.filterPreview) {
      return;
    }
    const { canvas, x, y } = this.engine.filterPreview;
    if (this.engine.selection && this.engine.selection.floatCanvas) {
      const sel = this.engine.selection;
      sel.floatCanvas = canvas;
      this.engine.filterPreview = null;
      this.engine.requestRepaint();
    } else {
      this.engine.beginStrokeSnapshot();
      const w = canvas.width,
        h = canvas.height;
      const ctx = this.layers[this.activeLayer].getContext("2d");
      const before = ctx.getImageData(x, y, w, h);
      ctx.clearRect(x, y, w, h);
      ctx.drawImage(canvas, x, y);
      const after = ctx.getImageData(x, y, w, h);
      this.engine.history.pushPatch({ rect: { x, y, w, h }, before, after });
      this.engine.filterPreview = null;
      this.engine.requestRepaint();
    }
  }
}
