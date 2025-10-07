const DEFAULT_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[tabindex]',
].join(',');

function resolveDocument(doc) {
  const resolved = doc || (typeof document !== 'undefined' ? document : null);
  if (!resolved) {
    throw new Error('No document available for DOM operation.');
  }
  return resolved;
}

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

export function toggleClass(node, className, force) {
  if (!node || !className) return false;
  if (force === undefined) {
    return node.classList.toggle(className);
  }
  node.classList.toggle(className, !!force);
  return node.classList.contains(className);
}

export function listen(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

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
