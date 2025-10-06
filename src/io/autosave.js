export function createAutosaveController({
  sessionManager,
  snapshotDocument,
  applySnapshot,
  onStatus,
  autosaveInterval = 15000,
  debounceDelay = 800,
} = {}) {
  let debounceTimer = null;
  let intervalId = null;

  async function saveNow() {
    try {
      const snapshot = await snapshotDocument();
      await sessionManager.save(snapshot);
      onStatus?.({ type: 'saved', snapshot });
    } catch (error) {
      onStatus?.({ type: 'error', error });
    }
  }

  function scheduleSave() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(saveNow, debounceDelay);
  }

  function start() {
    stop();
    intervalId = setInterval(saveNow, autosaveInterval);
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  async function restore() {
    try {
      const snapshot = await sessionManager.load();
      if (snapshot?.dataURL) {
        await applySnapshot(snapshot);
        onStatus?.({ type: 'restored', snapshot });
      }
    } catch (error) {
      onStatus?.({ type: 'restore-error', error });
    }
  }

  async function check() {
    try {
      const snapshot = await sessionManager.load();
      onStatus?.({ type: snapshot?.dataURL ? 'available' : 'missing', snapshot });
    } catch (error) {
      onStatus?.({ type: 'check-error', error });
    }
  }

  return {
    saveNow,
    scheduleSave,
    start,
    stop,
    restore,
    check,
  };
}
