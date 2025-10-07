export function createAutosaveController({
  sessionManager,
  snapshotDocument,
  applySnapshot,
  onStatus,
  autosaveInterval: autosaveIntervalInit = 15000,
  debounceDelay: debounceDelayInit = 800,
  timers,
  eventBus,
  eventNames = [],
} = {}) {
  const defaultTimers = {
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
    setInterval: (...args) => globalThis.setInterval(...args),
    clearInterval: (...args) => globalThis.clearInterval(...args),
  };
  const timerApi = timers ?? defaultTimers;
  const setTimeoutFn = timerApi.setTimeout ?? defaultTimers.setTimeout;
  const clearTimeoutFn = timerApi.clearTimeout ?? defaultTimers.clearTimeout;
  const setIntervalFn = timerApi.setInterval ?? defaultTimers.setInterval;
  const clearIntervalFn = timerApi.clearInterval ?? defaultTimers.clearInterval;

  let debounceTimer = null;
  let intervalId = null;
  let paused = false;
  let queued = false;
  let currentSave = null;
  let autosaveInterval = autosaveIntervalInit;
  let debounceDelay = debounceDelayInit;
  const cleanupHandlers = new Set();

  function notify(type, payload) {
    if (typeof onStatus === 'function') {
      onStatus({ type, ...payload });
    }
  }

  function clearDebounce() {
    if (debounceTimer != null) {
      clearTimeoutFn(debounceTimer);
      debounceTimer = null;
    }
  }

  function stopInterval() {
    if (intervalId != null) {
      clearIntervalFn(intervalId);
      intervalId = null;
    }
  }

  async function performSave() {
    notify('saving');
    const snapshot = await snapshotDocument();
    await sessionManager.save(snapshot);
    notify('saved', { snapshot });
    return snapshot;
  }

  async function saveNow({ force = false } = {}) {
    clearDebounce();
    if (paused && !force) {
      queued = true;
      return null;
    }
    if (currentSave) {
      queued = true;
      return currentSave;
    }
    queued = false;
    currentSave = performSave()
      .catch((error) => {
        notify('error', { error });
        return null;
      })
      .finally(() => {
        const shouldReplay = queued && !paused;
        currentSave = null;
        if (shouldReplay) {
          queued = false;
          scheduleSave(0);
        }
      });
    return currentSave;
  }

  function scheduleSave(delay = debounceDelay) {
    if (paused) {
      queued = true;
      return;
    }
    clearDebounce();
    queued = true;
    const timeout = Math.max(0, Number.isFinite(delay) ? delay : debounceDelay);
    debounceTimer = setTimeoutFn(() => {
      debounceTimer = null;
      saveNow();
    }, timeout);
  }

  function start() {
    paused = false;
    stopInterval();
    if (autosaveInterval > 0) {
      intervalId = setIntervalFn(() => {
        saveNow();
      }, autosaveInterval);
    }
    return intervalId;
  }

  function stop() {
    stopInterval();
  }

  function pause(options = {}) {
    const { flush = false } = options;
    if (paused) {
      return flush ? saveNow({ force: true }) : Promise.resolve(null);
    }
    paused = true;
    notify('paused');
    clearDebounce();
    stopInterval();
    return flush ? saveNow({ force: true }) : Promise.resolve(null);
  }

  function resume(options = {}) {
    const { immediate = false } = options;
    const hadQueue = queued;
    paused = false;
    if (options?.notify !== false) {
      notify('resumed');
    }
    const id = start();
    if (immediate || hadQueue) {
      queued = false;
      const result = saveNow({ force: true });
      return result ?? Promise.resolve(id ?? null);
    }
    return Promise.resolve(id ?? null);
  }

  function flush() {
    return saveNow({ force: true });
  }

  function configure({ autosaveInterval: ai, debounceDelay: dd } = {}) {
    if (typeof ai === 'number' && Number.isFinite(ai) && ai >= 0) {
      autosaveInterval = ai;
      if (!paused) {
        start();
      }
    }
    if (typeof dd === 'number' && Number.isFinite(dd) && dd >= 0) {
      debounceDelay = dd;
    }
  }

  function bindToEventBus(bus = eventBus, events = eventNames, options = {}) {
    if (!bus || !Array.isArray(events) || events.length === 0) {
      return () => {};
    }
    const handler = () => scheduleSave(options.debounce ?? debounceDelay);
    const cleanups = events
      .map((event) => {
        try {
          return bus.on(event, handler);
        } catch {
          return null;
        }
      })
      .filter((cleanup) => typeof cleanup === 'function');
    const cleanup = () => {
      cleanups.forEach((fn) => fn?.());
      cleanupHandlers.delete(cleanup);
    };
    if (cleanups.length) {
      cleanupHandlers.add(cleanup);
    }
    return cleanup;
  }

  if (eventBus && Array.isArray(eventNames) && eventNames.length) {
    bindToEventBus(eventBus, eventNames, { debounce: debounceDelay });
  }

  async function restore() {
    try {
      const snapshot = await sessionManager.load();
      if (snapshot?.dataURL) {
        await applySnapshot(snapshot);
        notify('restored', { snapshot });
      }
    } catch (error) {
      notify('restore-error', { error });
    }
  }

  async function check() {
    try {
      const snapshot = await sessionManager.load();
      notify(snapshot?.dataURL ? 'available' : 'missing', { snapshot });
    } catch (error) {
      notify('check-error', { error });
    }
  }

  async function dispose({ flush: shouldFlush = false } = {}) {
    if (shouldFlush) {
      await saveNow({ force: true });
    }
    clearDebounce();
    stopInterval();
    cleanupHandlers.forEach((cleanup) => cleanup());
    cleanupHandlers.clear();
    paused = true;
  }

  const controller = {
    saveNow,
    scheduleSave,
    start,
    stop,
    pause,
    resume,
    flush,
    configure,
    bindToEventBus,
    restore,
    check,
    dispose,
    hasPendingSave() {
      return queued || Boolean(currentSave);
    },
  };

  Object.defineProperty(controller, 'isPaused', {
    get() {
      return paused;
    },
  });

  return controller;
}
