const getLocalStorage = () => {
  try {
    if (typeof window === 'undefined') return null;
    if (!('localStorage' in window)) return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
};

export function readString(key, fallback = null) {
  const storage = getLocalStorage();
  if (!storage) return fallback;
  try {
    const value = storage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writeString(key, value) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(key, String(value));
  } catch {
    /* ignore write errors */
  }
}

export function readJSON(key, fallback = null) {
  const raw = readString(key, null);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore write errors */
  }
}

export function removeItem(key) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore remove errors */
  }
}
