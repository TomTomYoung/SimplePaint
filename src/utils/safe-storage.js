/**
 * Resilient wrappers around `localStorage` that never throw.
 *
 * Browsers can deny storage access for a variety of reasons (disabled cookies,
 * Safari private browsing, server-side rendering, etc.). These helpers return
 * fallback values instead of propagating exceptions so the rest of the
 * application can continue functioning without feature degradation.
 */

const getLocalStorage = () => {
  try {
    if (typeof window === 'undefined') return null;
    if (!('localStorage' in window)) return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
};

/**
 * Safely reads a raw string from `localStorage`.
 *
 * @param {string} key - Storage key to look up.
 * @param {string|null} [fallback=null] - Value to return when the read fails or the key is missing.
 * @returns {string|null} Stored value, or the provided fallback when unavailable.
 */
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

/**
 * Writes a string value to `localStorage`, ignoring any errors that occur.
 *
 * @param {string} key - Storage key to update.
 * @param {string|number|boolean} value - Value persisted as a string.
 */
export function writeString(key, value) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(key, String(value));
  } catch {
    /* ignore write errors */
  }
}

/**
 * Reads and parses JSON from `localStorage`.
 *
 * @param {string} key - Storage key containing JSON data.
 * @param {any} [fallback=null] - Value returned when the key is missing or parsing fails.
 * @returns {any} Parsed JSON value or the fallback.
 */
export function readJSON(key, fallback = null) {
  const raw = readString(key, null);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Serialises a value as JSON before persisting it to `localStorage`.
 *
 * @param {string} key - Storage key to update.
 * @param {any} value - Data serialised with `JSON.stringify`.
 */
export function writeJSON(key, value) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore write errors */
  }
}

/**
 * Removes an entry from `localStorage`, suppressing any resulting errors.
 *
 * @param {string} key - Storage key to delete.
 */
export function removeItem(key) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore remove errors */
  }
}
