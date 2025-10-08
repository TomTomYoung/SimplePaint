import test from 'node:test';
import assert from 'node:assert/strict';

function setupToolEnvironment() {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    navigator: globalThis.navigator,
    performance: globalThis.performance,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    ImageData: globalThis.ImageData,
  };

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
    const element = {
      tagName: tagName.toUpperCase(),
      nodeName: tagName.toUpperCase(),
      style: {},
      dataset: {},
      className: '',
      classList: createClassList(),
      childNodes: [],
      children: [],
      parentNode: null,
      ownerDocument: null,
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
      setAttribute() {},
      getAttribute() {
        return null;
      },
      removeAttribute() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
      focus() {},
      blur() {},
      getBoundingClientRect() {
        return {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        };
      },
      cloneNode() {
        const clone = createGenericElement(tagName);
        clone.ownerDocument = this.ownerDocument;
        return clone;
      },
    };
    return element;
  }

  function createMockContext(canvas) {
    const context = {
      canvas,
      save() {},
      restore() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fill() {},
      clearRect() {},
      fillRect() {},
      strokeRect() {},
      drawImage() {},
      putImageData() {},
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
      setLineDash() {},
      measureText() {
        return { width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 };
      },
      getTransform() {
        return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      },
      setTransform() {},
      resetTransform() {},
      scale() {},
      translate() {},
      rotate() {},
      quadraticCurveTo() {},
      bezierCurveTo() {},
      arc() {},
      arcTo() {},
      ellipse() {},
      rect() {},
      clip() {},
      isPointInPath() {
        return false;
      },
      isPointInStroke() {
        return false;
      },
      getImageData(x = 0, y = 0, width = 0, height = 0) {
        return new ImageData(width, height);
      },
      createImageData(width = 0, height = 0) {
        return new ImageData(width, height);
      },
    };
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

  function createMockCanvas() {
    const canvas = createGenericElement('canvas');
    canvas.width = 0;
    canvas.height = 0;
    canvas.toDataURL = () => 'data:image/png;base64,';
    canvas.transferControlToOffscreen = () => createMockCanvas();
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
    canvas.getContext = function (type) {
      if (type !== '2d') return null;
      if (!this._ctx) {
        this._ctx = createMockContext(this);
      }
      return this._ctx;
    };
    canvas.cloneNode = () => {
      const clone = createMockCanvas();
      clone.width = canvas.width;
      clone.height = canvas.height;
      return clone;
    };
    return canvas;
  }

  const document = {
    createElement(tag) {
      if (tag === 'canvas') {
        const canvas = createMockCanvas();
        canvas.ownerDocument = this;
        return canvas;
      }
      const element = createGenericElement(tag);
      element.ownerDocument = this;
      return element;
    },
    createElementNS(_ns, tag) {
      return this.createElement(tag);
    },
    createDocumentFragment() {
      return {
        nodeType: 11,
        childNodes: [],
        appendChild(node) {
          this.childNodes.push(node);
          return node;
        },
        firstChild: null,
        ownerDocument: this,
      };
    },
    createTextNode(text = '') {
      return { nodeType: 3, data: String(text), textContent: String(text), ownerDocument: this };
    },
    body: null,
    head: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    },
  };
  document.body = createGenericElement('body');
  document.body.ownerDocument = document;
  document.head = createGenericElement('head');
  document.head.ownerDocument = document;

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

  globalThis.document = document;
  globalThis.window = window;
  globalThis.navigator = navigator;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.performance = previous.performance ?? { now: () => Date.now() };
  globalThis.ImageData = MockImageData;

  return () => {
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
}

const restoreAfterImports = setupToolEnvironment();
const manifestModule = await import('../../src/tools/_base/manifest.js');
const registryModule = await import('../../src/tools/_base/registry.js');
const storeModule = await import('../../src/core/store.js');
restoreAfterImports();

const { DEFAULT_TOOL_IDS, DEFAULT_TOOL_MANIFEST, collectToolIds } = manifestModule;
const { createDefaultTools, registerDefaultTools } = registryModule;
const { createStore } = storeModule;

test('default tool manifest is frozen and unique', () => {
  assert.ok(Object.isFrozen(DEFAULT_TOOL_MANIFEST));
  const seenCategories = new Set();
  const seenTools = new Set();
  for (const category of DEFAULT_TOOL_MANIFEST) {
    assert.ok(Object.isFrozen(category));
    assert.ok(Object.isFrozen(category.tools));
    assert.equal(typeof category.id, 'string');
    assert.equal(typeof category.label, 'string');
    assert.ok(!seenCategories.has(category.id), `duplicate category id ${category.id}`);
    seenCategories.add(category.id);
    for (const entry of category.tools) {
      assert.ok(Object.isFrozen(entry));
      assert.equal(entry.categoryId, category.id);
      assert.equal(typeof entry.id, 'string');
      assert.equal(typeof entry.factory, 'function');
      const key = entry.id;
      assert.ok(!seenTools.has(key), `duplicate tool id ${key}`);
      seenTools.add(key);
    }
  }
  assert.deepEqual(Array.from(seenTools), collectToolIds());
  assert.deepEqual(Array.from(seenTools), DEFAULT_TOOL_IDS);
});

test('registerDefaultTools registers every manifest entry exactly once', () => {
  const restore = setupToolEnvironment();
  try {
    const store = createStore();
    const registered = [];
    const engine = {
      register(tool) {
        registered.push(tool);
      },
    };
    registerDefaultTools(engine, store);
    const manifestIds = collectToolIds();
    const registeredIds = registered.map((tool) => tool.id);
    assert.deepEqual(registeredIds, manifestIds);
  } finally {
    restore();
  }
});

test('createDefaultTools yields tool objects that align with the manifest ordering', () => {
  const restore = setupToolEnvironment();
  try {
    const store = createStore();
    const tools = createDefaultTools(store);
    const ids = tools.map((tool) => tool.id);
    assert.deepEqual(ids, DEFAULT_TOOL_IDS);
  } finally {
    restore();
  }
});
