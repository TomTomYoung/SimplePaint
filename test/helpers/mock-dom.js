const previousGlobals = new WeakMap();

function cloneImageData(imageData, ImageDataCtor) {
  if (!imageData) {
    return null;
  }
  const copy = new ImageDataCtor(imageData.width, imageData.height);
  copy.data.set(imageData.data);
  return copy;
}

class MockImageData {
  constructor(dataOrWidth, width, height) {
    if (dataOrWidth instanceof Uint8ClampedArray) {
      this.data = dataOrWidth;
      this.width = width ?? 0;
      this.height = height ?? 0;
    } else {
      const w = Number(dataOrWidth) || 0;
      const h = Number(width) || 0;
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  }
}

function createClassList() {
  return {
    add() {},
    remove() {},
    toggle() {},
    contains() {
      return false;
    },
  };
}

function createGenericElement(tagName) {
  const upper = String(tagName).toUpperCase();
  const element = {
    tagName: upper,
    nodeName: upper,
    style: {},
    dataset: {},
    className: '',
    classList: createClassList(),
    childNodes: [],
    children: [],
    parentNode: null,
    ownerDocument: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
    appendChild(child) {
      this.childNodes.push(child);
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      this.childNodes = this.childNodes.filter((c) => c !== child);
      this.children = this.children.filter((c) => c !== child);
      if (child.parentNode === this) child.parentNode = null;
      return child;
    },
    insertBefore(child, ref) {
      if (!ref) {
        return this.appendChild(child);
      }
      const index = this.childNodes.indexOf(ref);
      if (index === -1) {
        return this.appendChild(child);
      }
      this.childNodes.splice(index, 0, child);
      this.children = [...this.childNodes];
      child.parentNode = this;
      return child;
    },
    getBoundingClientRect() {
      return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
    },
    focus() {},
    blur() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    removeAttribute() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    cloneNode() {
      const clone = createGenericElement(tagName);
      clone.ownerDocument = this.ownerDocument;
      return clone;
    },
  };
  return element;
}

const CONTEXT_NOOPS = [
  'save',
  'restore',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'stroke',
  'fill',
  'clearRect',
  'fillRect',
  'strokeRect',
  'drawImage',
  'putImageData',
  'createPattern',
  'createLinearGradient',
  'createRadialGradient',
  'getLineDash',
  'setLineDash',
  'measureText',
  'getTransform',
  'setTransform',
  'resetTransform',
  'scale',
  'translate',
  'rotate',
  'quadraticCurveTo',
  'bezierCurveTo',
  'arc',
  'arcTo',
  'ellipse',
  'rect',
  'clip',
  'isPointInPath',
  'isPointInStroke',
  'createImageData',
];

function createMockContext(canvas, { trackImageData, ImageDataCtor }) {
  const context = {
    canvas,
    clearRectCalls: [],
    drawImageCalls: [],
    getImageDataCalls: [],
    putImageDataCalls: [],
    imageData: null,
    clearRect(...args) {
      if (trackImageData) this.clearRectCalls.push(args);
    },
    drawImage(...args) {
      if (trackImageData) this.drawImageCalls.push(args);
      const [source] = args;
      if (source && source._ctx?.imageData) {
        this.imageData = cloneImageData(source._ctx.imageData, ImageDataCtor);
      }
    },
    getImageData(x = 0, y = 0, width = canvas.width, height = canvas.height) {
      const w = width ?? canvas.width ?? 0;
      const h = height ?? canvas.height ?? 0;
      if (!this.imageData || this.imageData.width !== w || this.imageData.height !== h) {
        this.imageData = new ImageDataCtor(w, h);
      }
      const copy = cloneImageData(this.imageData, ImageDataCtor);
      if (trackImageData) this.getImageDataCalls.push({ args: [x, y, width, height], result: copy });
      return copy;
    },
    putImageData(imageData, x = 0, y = 0) {
      if (trackImageData) this.putImageDataCalls.push([imageData, x, y]);
      this.imageData = cloneImageData(imageData, ImageDataCtor);
    },
    createPattern() {
      return {};
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    getLineDash() {
      return [];
    },
    measureText() {
      return { width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 };
    },
    getTransform() {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    },
    isPointInPath() {
      return false;
    },
    isPointInStroke() {
      return false;
    },
    createImageData(width = 0, height = 0) {
      return new ImageDataCtor(width, height);
    },
  };

  for (const method of CONTEXT_NOOPS) {
    if (!context[method]) {
      context[method] = () => undefined;
    }
  }

  return new Proxy(context, {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      if (prop === Symbol.toStringTag) {
        return 'CanvasRenderingContext2D';
      }
      const noop = () => undefined;
      target[prop] = noop;
      return noop;
    },
  });
}

function createMockCanvas({ label = '', trackImageData = false, ImageDataCtor }) {
  const canvas = createGenericElement('canvas');
  canvas.width = 0;
  canvas.height = 0;
  canvas._ctx = null;
  canvas.toDataURL = () => 'data:image/png;base64,';
  canvas.transferControlToOffscreen = () => createMockCanvas({ label, trackImageData, ImageDataCtor });
  canvas.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    top: 0,
    left: 0,
    right: canvas.width,
    bottom: canvas.height,
  });
  canvas.getContext = (type) => {
    if (type !== '2d') return null;
    if (!canvas._ctx) {
      canvas._ctx = createMockContext(canvas, { trackImageData, ImageDataCtor });
    }
    return canvas._ctx;
  };
  canvas.toString = () => (label ? `[MockCanvas:${label}]` : '[MockCanvas]');
  return canvas;
}

function installMockDomEnvironment(options = {}) {
  const {
    trackCanvasImageData = false,
    ImageData: ImageDataCtor = MockImageData,
  } = options;

  const previous = previousGlobals.get(globalThis) || {
    document: globalThis.document,
    window: globalThis.window,
    navigator: globalThis.navigator,
    performance: globalThis.performance,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    ImageData: globalThis.ImageData,
  };

  const document = {
    _elements: Object.create(null),
    nodeType: 9,
    createElement(tag) {
      if (tag === 'canvas') {
        const canvas = createMockCanvas({
          label: tag,
          trackImageData: trackCanvasImageData,
          ImageDataCtor,
        });
        canvas.ownerDocument = this;
        return canvas;
      }
      const element = createGenericElement(tag);
      element.ownerDocument = this;
      return element;
    },
    createElementNS(namespace, tag) {
      return this.createElement(tag);
    },
    getElementById(id) {
      return this._elements[id] ?? null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  };

  document.body = createGenericElement('body');
  document.head = createGenericElement('head');
  document.body.ownerDocument = document;
  document.head.ownerDocument = document;
  document.defaultView = null;

  const window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
    requestAnimationFrame(callback) {
      return setTimeout(() => callback(Date.now()), 16);
    },
    cancelAnimationFrame(handle) {
      clearTimeout(handle);
    },
    matchMedia() {
      return { matches: false, addEventListener() {}, removeEventListener() {} };
    },
  };

  const navigator = { clipboard: null };

  document.defaultView = window;
  window.document = document;

  globalThis.document = document;
  globalThis.window = window;
  globalThis.navigator = navigator;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.performance = previous.performance ?? { now: () => Date.now() };
  globalThis.ImageData = ImageDataCtor;

  const restore = () => {
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.navigator === undefined) delete globalThis.navigator;
    else globalThis.navigator = previous.navigator;
    if (previous.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    if (previous.cancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    if (previous.performance === undefined) delete globalThis.performance;
    else globalThis.performance = previous.performance;
    if (previous.ImageData === undefined) delete globalThis.ImageData;
    else globalThis.ImageData = previous.ImageData;
  };

  previousGlobals.set(globalThis, previous);

  return {
    document,
    window,
    navigator,
    ImageData: ImageDataCtor,
    createCanvas(options = {}) {
      return createMockCanvas({
        label: options.label,
        trackImageData: options.trackImageData ?? trackCanvasImageData,
        ImageDataCtor,
      });
    },
    restore,
  };
}

function resetCanvasContext(context) {
  if (!context) return null;
  context.clearRectCalls = [];
  context.drawImageCalls = [];
  context.getImageDataCalls = [];
  context.putImageDataCalls = [];
  context.imageData = null;
  return context;
}

export {
  MockImageData,
  installMockDomEnvironment,
  createMockCanvas,
  createGenericElement,
  resetCanvasContext,
};
