/**
 * DOM manipulation and accessibility utilities shared across UI components.
 * The helpers favour explicit inputs and avoid mutating global state so they
 * can be re-used in tests and in environments with synthetic documents.
 *
 * @module utils/dom-helpers
 */

/**
 * @typedef {Object} CreateElementOptions
 * @property {Document} [document] - Alternate document to create elements within (useful for tests or iframes).
 * @property {string} [className] - String assigned to `className`.
 * @property {string[]} [classList] - Array of classes added via `classList.add`.
 * @property {string[]} [classes] - Alias of `classList` (merged).
 * @property {Record<string, string | number | boolean | null | undefined>} [attrs] - Attributes added via `setAttribute`.
 * @property {Record<string, string | number | boolean | null | undefined>} [attributes] - Alias of `attrs` (merged).
 * @property {Record<string, string | number | boolean>} [dataset] - Key/value pairs merged into `dataset`.
 * @property {string} [text] - Text content assigned to `textContent`.
 * @property {string} [html] - HTML assigned to `innerHTML`.
 * @property {Iterable<ChildNode|string|number|boolean|null|undefined>} [children] - Nodes or primitives appended to the element (nullish values are skipped).
 * @property {Record<string, any>} [props] - Arbitrary properties assigned directly on the element.
 * @property {CSSStyleDeclaration | Record<string, string | number>} [style] - Inline style declarations merged into `style`.
 * @property {Record<string, EventListener | null | undefined>} [on] - Event listeners bound with `addEventListener` (falsy handlers are ignored).
 */

/**
 * @typedef {Object} FocusableQueryOptions
 * @property {boolean} [includeContainer=false] - Whether to include the container element when it is focusable.
 */

/**
 * @typedef {Object} FocusTrapOptions
 * @property {HTMLElement} [initialFocus] - Element focused immediately after activation.
 * @property {boolean} [loop=true] - Whether focus wraps from end to start when tabbing past the extremes.
 * @property {boolean} [includeContainer=false] - Allow the container itself to be focused.
 * @property {boolean} [restoreFocus=true] - Restore focus to the previously focused element when the trap is released.
 * @property {Document} [document] - Alternative document reference (automatically inferred from the container when omitted).
 */

/**
 * CSS selector covering most tabbable controls according to the HTML spec.
 * The selector intentionally omits disabled controls so that a subsequent
 * visibility filter can make the final determination based on runtime state.
 */
const DEFAULT_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[tabindex]',
].join(',');

/**
 * Resolves a document reference from the provided value or the global scope.
 * Throws when running outside of a DOM-enabled environment.
 *
 * @param {Document|null|undefined} doc - Optional explicit document reference.
 * @returns {Document} A usable document object.
 */
function resolveDocument(doc) {
  const resolved = doc || (typeof document !== 'undefined' ? document : null);
  if (!resolved) {
    throw new Error('No document available for DOM operation.');
  }
  return resolved;
}

/**
 * Creates a DOM element and applies a set of commonly needed mutations in a
 * single call. Supports class names, attributes, dataset values, inline styles,
 * event listeners, children, and arbitrary property assignments.
 *
 * @param {string} tag - Tag name to create (e.g. `div`).
 * @param {CreateElementOptions} [options] - Mutation options for the created element.
 *
 * @example
 * const button = createElement('button', {
 *   classList: ['toolbar__action'],
 *   text: 'Flood fill',
 *   dataset: { tool: 'fill' },
 *   on: { click: () => setTool('fill') },
 * });
 * toolbar.append(button);
 * @returns {HTMLElement} The configured element instance.
 */
export function createElement(tag, options = {}) {
  const {
    document: doc,
    className,
    classList,
    classes,
    attrs,
    attributes,
    dataset,
    text,
    html,
    children,
    props,
    style,
    on,
  } = options;
  const documentRef = resolveDocument(doc);
  const el = documentRef.createElement(tag);

  if (className) el.className = className;
  const classesToAdd = classList || classes;
  if (Array.isArray(classesToAdd)) {
    el.classList.add(...classesToAdd.filter(Boolean));
  }

  setAttributes(el, { ...attrs, ...attributes });

  if (dataset) {
    for (const [key, value] of Object.entries(dataset)) {
      if (value === undefined) continue;
      el.dataset[key] = String(value);
    }
  }

  if (style) {
    Object.assign(el.style, style);
  }

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      el[key] = value;
    }
  }

  if (text !== undefined) {
    el.textContent = text;
  }

  if (html !== undefined) {
    el.innerHTML = html;
  }

  if (children) {
    for (const child of children) {
      if (child == null) continue;
      el.append(child);
    }
  }

  if (on) {
    for (const [eventName, handler] of Object.entries(on)) {
      if (!handler) continue;
      el.addEventListener(eventName, handler);
    }
  }

  return el;
}

/**
 * Sets or removes multiple attributes on a DOM node.
 *
 * @template {Element} T
 * @param {T} node - Node to mutate.
 * @param {Object<string, string | number | boolean | null | undefined>} [attrs] - Attribute map.
 * @returns {T} The same node reference for chaining.
 */
export function setAttributes(node, attrs = {}) {
  if (!node) return node;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) {
      node.removeAttribute(name);
    } else {
      node.setAttribute(name, String(value));
    }
  }
  return node;
}

/**
 * Toggles a CSS class on the provided node.
 *
 * @param {Element} node - Element whose classes will be adjusted.
 * @param {string} className - Class name to toggle.
 * @param {boolean} [force] - Explicit force flag mirroring `classList.toggle`.
 * @returns {boolean} Whether the class is present after the toggle.
 */
export function toggleClass(node, className, force) {
  if (!node || !className) return false;
  if (force === undefined) {
    return node.classList.toggle(className);
  }
  node.classList.toggle(className, !!force);
  return node.classList.contains(className);
}

/**
 * Registers an event listener and returns a disposer that removes it.
 * This helper ensures the same options object is reused for both the
 * registration and the clean-up step to avoid mismatched capture flags.
 *
 * @param {EventTarget} target - Event target to listen on.
 * @param {string} type - Event type.
 * @param {EventListenerOrEventListenerObject} handler - Listener to invoke.
 * @param {boolean|AddEventListenerOptions} [options] - Listener options.
 * @returns {() => void} Function that removes the listener when called.
 */
export function listen(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/**
 * Adds an event listener that delegates to descendants matching the selector.
 * The `delegateTarget` property is set on the event prior to invocation.
 *
 * @example
 * const dispose = delegate(menu, '[role="menuitem"]', 'click', (event, item) => {
 *   selectItem(item.dataset.value);
 *   dispose();
 * });
 *
 * @param {Element} root - Root element to attach the listener to.
 * @param {string} selector - CSS selector used to match descendants.
 * @param {string} type - Event type to listen for.
 * @param {(event: Event, matched: Element) => void} handler - Handler invoked with the event and match.
 * @param {boolean|AddEventListenerOptions} [options] - Listener options.
 * @returns {() => void} Function removing the delegated listener.
 */
export function delegate(root, selector, type, handler, options) {
  const listener = (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const matched = target.closest(selector);
    if (!matched || !root.contains(matched)) return;
    event.delegateTarget = matched;
    handler.call(matched, event, matched);
  };
  return listen(root, type, listener, options);
}

/**
 * Determines whether an element is focusable based on visibility and disabled state.
 *
 * @param {HTMLElement} element - Element to inspect.
 * @returns {boolean} True when the element can receive focus.
 */
function isFocusable(element) {
  const hidden =
    element.hasAttribute('hidden') ||
    element.closest?.('[hidden]') ||
    element.getAttribute('aria-hidden') === 'true' ||
    element.getAttribute('tabindex') === '-1';
  const disabled =
    element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
  return !hidden && !disabled;
}

/**
 * Returns focusable descendants of the provided container. Non-visible or
 * disabled nodes are filtered out.
 *
 * @param {HTMLElement} container - Root element to inspect.
 * @param {FocusableQueryOptions} [options] - Optional configuration.
 * @returns {HTMLElement[]} Array of unique focusable elements.
 */
export function getFocusableElements(container, { includeContainer = false } = {}) {
  if (!container) return [];
  resolveDocument(container.ownerDocument);
  const nodes = Array.from(container.querySelectorAll(DEFAULT_FOCUSABLE_SELECTOR)).filter(
    (el) => isFocusable(el)
  );

  if (includeContainer) {
    nodes.unshift(container);
  }

  return Array.from(new Set(nodes)).filter((el) => el === container || isFocusable(el));
}

/**
 * Traps keyboard focus within the provided container. Focus is optionally
 * restored to the previously focused element when the disposer is called. The
 * trap listens for <kbd>Tab</kbd> presses at the document level to keep focus
 * cycling inside the given container and falls back to focusing the container
 * itself when no tabbable children are present.
 *
 * @param {HTMLElement} container - Element whose children should capture focus.
 * @param {FocusTrapOptions} [options]
 *
 * @example
 * const release = trapFocus(dialog, { initialFocus: dialog.querySelector('button.primary') });
 * closeButton.addEventListener('click', () => {
 *   release();
 *   dialog.close();
 * });
 * @returns {() => void} Cleanup function removing listeners and restoring focus if requested.
 */
export function trapFocus(
  container,
  {
    initialFocus,
    loop = true,
    includeContainer = false,
    restoreFocus = true,
    document: doc,
  } = {}
) {
  const documentRef = resolveDocument(doc ?? container?.ownerDocument);
  if (!container) throw new Error('A focus container is required.');

  const previouslyFocused = documentRef.activeElement;

  const focusables = () => {
    const list = getFocusableElements(container, { includeContainer });
    return list.length ? list : [container];
  };

  const focusFirst = (list) => {
    const target = initialFocus ?? list.find((el) => el !== documentRef.body) ?? list[0];
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  };

  focusFirst(focusables());

  const handleKeydown = (event) => {
    if (event.key !== 'Tab') return;
    const items = focusables().filter((el) => typeof el.focus === 'function');
    if (!items.length) {
      event.preventDefault();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = documentRef.activeElement;

    if (!container.contains(active)) {
      event.preventDefault();
      focusFirst(items);
      return;
    }

    const index = items.indexOf(active);
    let nextIndex = event.shiftKey ? index - 1 : index + 1;

    if (!loop) {
      nextIndex = Math.min(Math.max(nextIndex, 0), items.length - 1);
    } else {
      if (nextIndex < 0) nextIndex = items.length - 1;
      if (nextIndex >= items.length) nextIndex = 0;
    }

    event.preventDefault();
    const next = items[nextIndex] ?? (event.shiftKey ? last : first);
    next.focus();
  };

  const release = listen(documentRef, 'keydown', handleKeydown, true);

  return () => {
    release();
    if (restoreFocus && previouslyFocused && previouslyFocused.focus) {
      previouslyFocused.focus();
    }
  };
}
