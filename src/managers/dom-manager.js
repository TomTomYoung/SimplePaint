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
    this.leftWidth = 200;
    this.rightWidth = 250;
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

    this.initPanelResizers();
  }

  initPanelResizers() {
    const { stage, leftResizer, rightResizer } = this.elements;
    if (!stage || !leftResizer || !rightResizer) return;

    const update = () => {
      stage.style.gridTemplateColumns = `${this.leftWidth}px 4px 1fr 4px ${this.rightWidth}px`;
    };

    const startDrag = (side, e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startLeft = this.leftWidth;
      const startRight = this.rightWidth;

      const onMove = ev => {
        const dx = ev.clientX - startX;
        if (side === 'left') {
          this.leftWidth = Math.max(100, startLeft + dx);
        } else {
          this.rightWidth = Math.max(100, startRight - dx);
        }
        update();
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    leftResizer.addEventListener('mousedown', e => startDrag('left', e));
    rightResizer.addEventListener('mousedown', e => startDrag('right', e));

    update();
  }
}
