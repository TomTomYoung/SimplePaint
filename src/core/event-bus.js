const DEFAULT_LOGGER = (event, error) => {
  console.error('EventBus handler error for', event, error);
};

const isFunction = (value) => typeof value === 'function';

export class EventBus {
  constructor(options = {}) {
    const { logger = DEFAULT_LOGGER } = options;
    this._events = new Map();
    this._logger = isFunction(logger) ? logger : DEFAULT_LOGGER;
  }

  on(event, handler, options = {}) {
    if (!isFunction(handler)) {
      throw new TypeError('EventBus.on expects the handler to be a function');
    }
    const { once = false, signal } = options;
    if (signal?.aborted) {
      return () => false;
    }
    const entry = { handler, once };
    const handlers = this._getHandlers(event);
    handlers.add(entry);
    let cleanupAbort = null;
    const unsubscribe = () => {
      if (!handlers.has(entry)) return false;
      handlers.delete(entry);
      if (handlers.size === 0) {
        this._events.delete(event);
      }
      if (cleanupAbort) {
        cleanupAbort();
        cleanupAbort = null;
      }
      return true;
    };

    if (signal) {
      const abortHandler = () => {
        unsubscribe();
      };
      if (isFunction(signal.addEventListener)) {
        signal.addEventListener('abort', abortHandler, { once: true });
        cleanupAbort = () => signal.removeEventListener('abort', abortHandler);
      } else if ('onabort' in signal) {
        const prev = signal.onabort;
        signal.onabort = (...args) => {
          abortHandler();
          if (isFunction(prev)) prev.apply(signal, args);
        };
        cleanupAbort = () => {
          signal.onabort = prev;
        };
      }
    }

    return unsubscribe;
  }

  once(event, handler, options = {}) {
    return this.on(event, handler, { ...options, once: true });
  }

  off(event, handler) {
    if (!isFunction(handler)) return false;
    const handlers = this._events.get(event);
    if (!handlers?.size) return false;
    let removed = false;
    for (const entry of handlers) {
      if (entry.handler === handler) {
        handlers.delete(entry);
        removed = true;
      }
    }
    if (handlers.size === 0) {
      this._events.delete(event);
    }
    return removed;
  }

  emit(event, payload) {
    const handlers = this._events.get(event);
    if (!handlers?.size) return;
    const snapshot = Array.from(handlers);
    for (const entry of snapshot) {
      if (entry.once) {
        handlers.delete(entry);
      }
      try {
        entry.handler(payload);
      } catch (error) {
        this._logger(event, error);
      }
    }
    if (handlers.size === 0) {
      this._events.delete(event);
    }
  }

  async emitAsync(event, payload) {
    const handlers = this._events.get(event);
    if (!handlers?.size) return [];
    const snapshot = Array.from(handlers);
    for (const entry of snapshot) {
      if (entry.once) {
        handlers.delete(entry);
      }
    }
    if (handlers.size === 0) {
      this._events.delete(event);
    }
    const results = [];
    for (const entry of snapshot) {
      try {
        // eslint-disable-next-line no-await-in-loop
        results.push(await entry.handler(payload));
      } catch (error) {
        this._logger(event, error);
        results.push(undefined);
      }
    }
    return results;
  }

  clear(event) {
    if (event === undefined) {
      this._events.clear();
      return;
    }
    this._events.delete(event);
  }

  listeners(event) {
    const handlers = this._events.get(event);
    if (!handlers?.size) return [];
    return Array.from(handlers, (entry) => entry.handler);
  }

  listenerCount(event) {
    return this._events.get(event)?.size ?? 0;
  }

  has(event) {
    return this.listenerCount(event) > 0;
  }

  _getHandlers(event) {
    if (!this._events.has(event)) {
      this._events.set(event, new Set());
    }
    return this._events.get(event);
  }
}
