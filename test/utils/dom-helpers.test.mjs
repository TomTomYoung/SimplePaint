import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement,
  setAttributes,
  toggleClass,
  listen,
  delegate,
  getFocusableElements,
  trapFocus,
} from '../../src/utils/dom-helpers.js';

class MockEventTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, handler, options = {}) {
    const entry = { handler, options };
    const list = this._listeners.get(type);
    if (list) {
      list.push(entry);
    } else {
      this._listeners.set(type, [entry]);
    }
  }

  removeEventListener(type, handler) {
    const list = this._listeners.get(type);
    if (!list) return;
    const index = list.findIndex((entry) => entry.handler === handler);
    if (index >= 0) list.splice(index, 1);
  }

  dispatchEvent(event) {
    if (!event.target) {
      event.target = this;
    }
    event.currentTarget = this;
    event.defaultPrevented = event.defaultPrevented ?? false;
    event.cancelBubble = false;
    event.preventDefault ??= function () {
      this.defaultPrevented = true;
    };
    event.stopPropagation ??= function () {
      this.cancelBubble = true;
    };

    const listeners = [...(this._listeners.get(event.type) ?? [])];
    for (const { handler } of listeners) {
      handler.call(this, event);
      if (event.cancelBubble) break;
    }

    if (event.bubbles !== false && !event.cancelBubble && this.parentNode) {
      this.parentNode.dispatchEvent(event);
    }

    return !event.defaultPrevented;
  }
}

class MockElement extends MockEventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this._classSet = new Set();
    this._text = '';
    this.id = '';
    this.tabIndex = 0;
  }

  get className() {
    return Array.from(this._classSet).join(' ');
  }

  set className(value) {
    this._classSet = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  get classList() {
    const element = this;
    return {
      add: (...tokens) => {
        tokens.filter(Boolean).forEach((token) => element._classSet.add(token));
      },
      remove: (...tokens) => {
        tokens.forEach((token) => element._classSet.delete(token));
      },
      toggle: (token, force) => {
        if (force === undefined) {
          if (element._classSet.has(token)) {
            element._classSet.delete(token);
            return false;
          }
          element._classSet.add(token);
          return true;
        }
        if (force) {
          element._classSet.add(token);
          return true;
        }
        element._classSet.delete(token);
        return false;
      },
      contains: (token) => element._classSet.has(token),
      toString: () => element.className,
    };
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node == null) continue;
      node.parentNode = this;
      this.children.push(node);
    }
  }

  get firstElementChild() {
    return this.children.find((child) => child instanceof MockElement) ?? null;
  }

  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }

  get textContent() {
    const childText = this.children.map((child) => child.textContent ?? '').join('');
    return (this._text ?? '') + childText;
  }

  set innerHTML(value) {
    this.textContent = value;
  }

  get innerHTML() {
    return this.textContent;
  }

  setAttribute(name, value) {
    const val = String(value);
    this.attributes.set(name, val);
    if (name === 'class') {
      this.className = val;
    } else if (name === 'id') {
      this.id = val;
    } else if (name.startsWith('data-')) {
      const dataKey = name
        .slice(5)
        .replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      this.dataset[dataKey] = val;
    } else if (name === 'tabindex') {
      this.tabIndex = Number(val);
    }
  }

  getAttribute(name) {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    if (name.startsWith('data-')) {
      const dataKey = name
        .slice(5)
        .replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      return this.dataset[dataKey] ?? null;
    }
    if (name === 'tabindex') return String(this.tabIndex);
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    if (name === 'id') return Boolean(this.id);
    if (name === 'class') return this._classSet.size > 0;
    if (name.startsWith('data-')) {
      const dataKey = name
        .slice(5)
        .replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      return dataKey in this.dataset;
    }
    if (name === 'tabindex') return true;
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    if (name === 'id') {
      this.id = '';
    } else if (name === 'class') {
      this._classSet.clear();
    } else if (name.startsWith('data-')) {
      const dataKey = name
        .slice(5)
        .replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      delete this.dataset[dataKey];
    } else {
      this.attributes.delete(name);
    }
    if (name === 'tabindex') {
      this.tabIndex = -1;
    }
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains?.(node));
  }

  matches(selector) {
    return matchesSelector(this, selector);
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches && current.matches(selector)) return current;
      current = current.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const selectors = selector.split(',').map((part) => part.trim()).filter(Boolean);
    const result = [];
    const visit = (node) => {
      if (node instanceof MockElement) {
        if (selectors.some((sel) => node.matches(sel))) {
          result.push(node);
        }
        node.children.forEach(visit);
      }
    };
    this.children.forEach(visit);
    return result;
  }

  focus() {
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this;
    }
  }

  click() {
    this.dispatchEvent(createEvent('click'));
  }
}

class MockDocument extends MockEventTarget {
  constructor() {
    super();
    this.body = new MockElement('body', this);
    this.body.parentNode = null;
    this.activeElement = null;
    this.defaultView = { KeyboardEvent: MockKeyboardEvent };
  }

  createElement(tagName) {
    return new MockElement(tagName, this);
  }

  getElementById(id) {
    const stack = [...this.body.children];
    while (stack.length) {
      const node = stack.pop();
      if (node.id === id) return node;
      stack.push(...node.children);
    }
    return null;
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

class MockKeyboardEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.key = options.key ?? '';
    this.shiftKey = !!options.shiftKey;
    this.bubbles = options.bubbles ?? true;
    this.defaultPrevented = false;
    this.cancelBubble = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this.cancelBubble = true;
  }
}

function createEvent(type, init = {}) {
  return {
    type,
    bubbles: init.bubbles ?? true,
    target: null,
    currentTarget: null,
    defaultPrevented: false,
    cancelBubble: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.cancelBubble = true;
    },
  };
}

function setupDom() {
  const document = new MockDocument();
  const window = { KeyboardEvent: MockKeyboardEvent };
  document.defaultView = window;
  globalThis.document = document;
  globalThis.window = window;
  return { document, window };
}

function matchesSelector(element, selector) {
  if (selector.includes(',')) {
    return selector
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => matchesSelector(element, part));
  }
  const tagMatch = selector.match(/^([a-z0-9_-]+)/i);
  let remaining = selector;
  if (tagMatch) {
    remaining = remaining.slice(tagMatch[0].length);
    if (element.tagName !== tagMatch[1].toUpperCase()) {
      return false;
    }
  }

  const tokenRegex = /([#.][^#.[\]]+)|(\[[^\]]+\])/g;
  let token;
  while ((token = tokenRegex.exec(remaining))) {
    const part = token[0];
    if (part.startsWith('.')) {
      if (!element.classList.contains(part.slice(1))) return false;
    } else if (part.startsWith('#')) {
      if (element.id !== part.slice(1)) return false;
    } else if (part.startsWith('[')) {
      const [rawName, rawValue] = part
        .slice(1, -1)
        .split('=')
        .map((str) => str?.trim());
      const expected = rawValue ? rawValue.replace(/^['"]|['"]$/g, '') : undefined;
      if (!element.hasAttribute(rawName)) return false;
      if (expected !== undefined && element.getAttribute(rawName) !== expected) return false;
    }
  }

  return true;
}

test('createElement applies classes, attributes, dataset, children, and listeners', () => {
  setupDom();
  const clickLog = [];
  const child = document.createElement('span');
  child.textContent = 'child';
  const el = createElement('button', {
    className: 'primary',
    classes: ['interactive', null, 'cta'],
    attrs: { type: 'button', disabled: null },
    dataset: { role: 'action', skip: undefined },
    text: 'Click me',
    children: [child],
    on: {
      click: () => clickLog.push('clicked'),
    },
    style: { border: '1px solid red' },
    props: { value: 'ok' },
  });

  document.body.append(el);

  assert.equal(el.className, 'primary interactive cta');
  assert.equal(el.getAttribute('type'), 'button');
  assert.equal(el.dataset.role, 'action');
  assert.equal(el.textContent, 'Click mechild');
  el.click();
  assert.deepEqual(clickLog, ['clicked']);
  assert.equal(el.style.border, '1px solid red');
  assert.equal(el.value, 'ok');
  assert.strictEqual(el.firstElementChild, child);
});

test('setAttributes assigns and removes attributes', () => {
  setupDom();
  const el = document.createElement('div');
  setAttributes(el, { role: 'dialog', 'aria-hidden': 'true', data: null });
  assert.equal(el.getAttribute('role'), 'dialog');
  assert.equal(el.getAttribute('aria-hidden'), 'true');
  assert.equal(el.hasAttribute('data'), false);
  setAttributes(el, { role: undefined });
  assert.equal(el.hasAttribute('role'), false);
});

test('toggleClass toggles with and without force parameter', () => {
  setupDom();
  const el = document.createElement('div');
  assert.equal(toggleClass(el, 'active'), true);
  assert.equal(el.classList.contains('active'), true);
  assert.equal(toggleClass(el, 'active', false), false);
  assert.equal(el.classList.contains('active'), false);
  assert.equal(toggleClass(el, 'active', true), true);
});

test('listen and delegate wire handlers and return cleanup callbacks', () => {
  setupDom();
  const root = document.createElement('div');
  const child = document.createElement('button');
  child.className = 'trigger';
  root.append(child);
  document.body.append(root);

  let rootClicks = 0;
  const stopRoot = listen(root, 'click', () => rootClicks++);

  let delegatedTarget = null;
  const stopDelegate = delegate(root, '.trigger', 'click', (event, target) => {
    delegatedTarget = target;
    assert.equal(event.delegateTarget, target);
  });

  child.click();
  assert.equal(rootClicks, 1);
  assert.strictEqual(delegatedTarget, child);

  stopDelegate();
  stopRoot();
  child.click();
  assert.equal(rootClicks, 1, 'cleanup removed listener');
});

test('getFocusableElements returns tabbable elements respecting options', () => {
  setupDom();
  const modal = document.createElement('div');
  modal.id = 'modal';
  modal.setAttribute('tabindex', '0');

  const first = document.createElement('button');
  first.id = 'first';
  const hiddenWrapper = document.createElement('div');
  hiddenWrapper.setAttribute('hidden', '');
  const hiddenButton = document.createElement('button');
  hiddenButton.id = 'hidden';
  const link = document.createElement('a');
  link.id = 'link';
  link.setAttribute('href', '#');
  const disabled = document.createElement('button');
  disabled.id = 'disabled';
  disabled.setAttribute('disabled', '');
  const custom = document.createElement('div');
  custom.id = 'custom';
  custom.setAttribute('tabindex', '3');

  hiddenWrapper.append(hiddenButton);
  modal.append(first, hiddenWrapper, link, disabled, custom);
  document.body.append(modal);

  const focusables = getFocusableElements(modal);
  assert.deepEqual(
    focusables.map((el) => el.id || el.tagName.toLowerCase()),
    ['first', 'link', 'custom']
  );

  const includeSelf = getFocusableElements(modal, { includeContainer: true });
  assert.equal(includeSelf[0], modal);
});

test('trapFocus keeps focus inside container and restores afterwards', () => {
  const { document, window } = setupDom();
  const outside = document.createElement('button');
  outside.id = 'outside';
  const dialog = document.createElement('div');
  dialog.id = 'dialog';
  const first = document.createElement('button');
  first.id = 'first';
  const second = document.createElement('button');
  second.id = 'second';

  dialog.append(first, second);
  document.body.append(outside, dialog);

  outside.focus();
  const release = trapFocus(dialog);
  assert.equal(document.activeElement, first);

  const tabEvent = new window.KeyboardEvent('keydown', { key: 'Tab' });
  document.dispatchEvent(tabEvent);
  assert.equal(document.activeElement, second, 'tab forwards within dialog');

  const wrapEvent = new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
  document.dispatchEvent(wrapEvent);
  assert.equal(document.activeElement, first, 'shift+tab wraps to end');

  release();
  assert.equal(document.activeElement, outside, 'focus restored after release');
});
