/**
 * Lightweight IndexedDB backed key-value store for persisting session data.
 */
export function createSessionManager({ dbName = 'paintdb', storeName = 'kv', key = 'autosave' } = {}) {
  let dbPromise = null;

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return dbPromise;
  }

  async function withStore(mode, handler) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      try {
        const maybePromise = handler(store);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise
            .then((value) => {
              result = value;
            })
            .catch(reject);
        } else {
          result = maybePromise;
        }
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    async save(data) {
      await withStore('readwrite', (store) => {
        store.put(data, key);
      });
    },
    async load() {
      return withStore('readonly', (store) => {
        return new Promise((resolve, reject) => {
          const request = store.get(key);
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error);
        });
      });
    },
    async clear() {
      await withStore('readwrite', (store) => {
        store.delete(key);
      });
    },
  };
}
