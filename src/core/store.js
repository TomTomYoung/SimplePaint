import { EventBus } from './event-bus.js';
import { createEmptyVectorLayer } from './vector-layer-state.js';
import { computeToolDefaults } from '../gui/tool-props.js';

const hasStructuredClone = typeof globalThis.structuredClone === 'function';

const deepClone = (value) => {
  if (hasStructuredClone) {
    return globalThis.structuredClone(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }
  if (value && typeof value === 'object') {
    const clone = {};
    for (const key of Object.keys(value)) {
      clone[key] = deepClone(value[key]);
    }
    return clone;
  }
  return value;
};

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const shallowEqual = (a, b) => {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
};

export class Store {
  constructor(initial = {}, eventBus = new EventBus()) {
    this.eventBus = eventBus;
    const initialState = isPlainObject(initial) ? deepClone(initial) : {};
    const baseState = deepClone(defaultState);
    this.state = {
      ...baseState,
      ...initialState,
      tools: deepClone(initialState.tools ?? baseState.tools ?? {}),
    };
    this.subs = new Set();
  }

  getState() {
    return deepClone(this.state);
  }

  set(updates = {}, options = {}) {
    if (!isPlainObject(updates)) {
      throw new TypeError('Store.set expects an object of updates');
    }
    const { silent = false } = options;
    const changed = {};
    let hasChange = false;
    for (const [key, value] of Object.entries(updates)) {
      if (!Object.is(this.state[key], value)) {
        hasChange = true;
        changed[key] = value;
      }
    }
    if (!hasChange) return false;
    const oldState = deepClone(this.state);
    this.state = {
      ...this.state,
      ...updates,
    };
    if (!silent) {
      this._notify(oldState, changed);
    }
    return true;
  }

  replaceState(nextState = {}, options = {}) {
    if (!isPlainObject(nextState)) {
      throw new TypeError('Store.replaceState expects a plain object');
    }
    const { silent = false } = options;
    const oldState = deepClone(this.state);
    const cloned = deepClone(nextState);
    this.state = {
      ...deepClone(defaultState),
      ...cloned,
      tools: deepClone(cloned.tools ?? defaultState.tools ?? {}),
    };
    if (!silent) {
      this._notify(oldState, cloned);
    }
    return this.getState();
  }

  subscribe(handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Store.subscribe expects a function');
    }
    this.subs.add(handler);
    return () => this.subs.delete(handler);
  }

  watch(selector, callback, options = {}) {
    if (typeof selector !== 'function') {
      throw new TypeError('Store.watch expects the selector to be a function');
    }
    if (typeof callback !== 'function') {
      throw new TypeError('Store.watch expects the callback to be a function');
    }
    const { immediate = false, compare = Object.is } = options;
    let currentValue = selector(this.getState());
    if (immediate) {
      callback(currentValue, currentValue, this.getState(), this.getState());
    }
    return this.subscribe((state, oldState) => {
      const nextValue = selector(state);
      if (!compare(nextValue, currentValue)) {
        const previousValue = currentValue;
        currentValue = nextValue;
        callback(nextValue, previousValue, state, oldState);
      }
    });
  }

  getToolState(id, defaults) {
    const effectiveDefaults = defaults ?? computeToolDefaults(id);
    const toolState = this.state.tools?.[id];
    if (!effectiveDefaults && !toolState) return {};
    const base = effectiveDefaults ? { ...effectiveDefaults } : {};
    return toolState ? { ...base, ...deepClone(toolState) } : base;
  }

  setToolState(id, updates = {}, options = {}) {
    if (!id) {
      throw new TypeError('Store.setToolState requires a tool identifier');
    }
    if (!isPlainObject(updates)) {
      throw new TypeError('Store.setToolState expects a plain object of updates');
    }
    const { replace = false, defaults = computeToolDefaults(id), silent = false } = options;
    const stored = this.state.tools?.[id]
      ? deepClone(this.state.tools[id])
      : undefined;
    const baseDefaults = defaults ? deepClone(defaults) : {};
    const effectivePrevious = stored
      ? { ...baseDefaults, ...stored }
      : { ...baseDefaults };
    const base = replace ? baseDefaults : effectivePrevious;
    const nextState = { ...base, ...updates };
    if (shallowEqual(effectivePrevious, nextState)) {
      return effectivePrevious;
    }
    const oldState = deepClone(this.state);
    const nextTools = {
      ...(this.state.tools ?? {}),
      [id]: deepClone(nextState),
    };
    this.state = {
      ...this.state,
      tools: nextTools,
    };
    if (!silent) {
      this._notify(oldState, { tools: { [id]: deepClone(nextState) } });
    }
    return this.getToolState(id, defaults);
  }

  resetToolState(id, options = {}) {
    const { defaults = computeToolDefaults(id), silent = false } = options;
    return this.setToolState(id, {}, { replace: true, defaults, silent });
  }

  clearToolState(id, options = {}) {
    if (!this.state.tools || !(id in this.state.tools)) return false;
    const { silent = false } = options;
    const oldState = deepClone(this.state);
    const nextTools = { ...this.state.tools };
    delete nextTools[id];
    this.state = {
      ...this.state,
      tools: nextTools,
    };
    if (!silent) {
      this._notify(oldState, { tools: { [id]: null } });
    }
    return true;
  }

  _notify(oldState, changes) {
    const snapshot = this.getState();
    this.subs.forEach((handler) => {
      handler(snapshot, oldState);
    });
    this.eventBus.emit('store:updated', {
      oldState,
      newState: snapshot,
      changes: deepClone(changes),
    });
  }
}

export function createStore(initial, eventBus) {
  return new Store(initial, eventBus);
}

const defaultVectorLayerState = Object.freeze(createEmptyVectorLayer());

export const defaultState = Object.freeze({
  toolId: 'pencil',
  tools: {},
  vectorLayer: defaultVectorLayerState,
});

