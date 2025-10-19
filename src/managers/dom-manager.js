export class DOMManager {
  constructor() {
    this.elements = {
      base: document.getElementById("base"),
      overlay: document.getElementById("overlay"),
      editorLayer: document.getElementById("editorLayer"),
      stage: document.getElementById("stage"),
      header: document.querySelector("header"),
      leftResizer: document.getElementById("leftResizer"),
      rightResizer: document.getElementById("rightResizer"),
    };
  }

  getCanvasArea() {
    const stage = this.elements.stage;
    return (
      stage?.querySelector('#canvasArea') ||
      stage?.querySelector('[data-canvas-area="left"]') ||
      stage?.querySelector('.canvas-area') ||
      document.getElementById('canvasArea') ||
      null
    );
  }

  syncHeaderHeight() {
    const header = this.elements.header;
    if (!header) return;
    const h = Math.ceil(header.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--headerH", h + "px");
  }

  centerStageScroll() {
    const area = this.getCanvasArea();
    if (area) {
      area.scrollLeft = (area.scrollWidth - area.clientWidth) / 2;
      area.scrollTop = (area.scrollHeight - area.clientHeight) / 2;
    }
  }

  initEventListeners() {
    const header = this.elements.header;
    if (header) {
      new ResizeObserver(() => this.syncHeaderHeight()).observe(header);
    }

    window.addEventListener("load", () => {
      this.syncHeaderHeight();
      this.centerStageScroll();
    });

    window.addEventListener("resize", () => {
      this.syncHeaderHeight();
      this.centerStageScroll();
    });

  }
}
