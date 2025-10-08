/**
 * 履歴スタック管理。
 * 入力: パッチオブジェクト
 * 出力: undo/redo で取り出されるパッチ
 */
export class HistoryManager {
  constructor(options = {}) {
    const { limit = Infinity, onChange } = options;
    this.stack = [];
    this.index = -1;
    this.version = 0;
    this._listeners = new Set();
    this._limit = this._normalizeLimit(limit);
    if (onChange) {
      this.onChange(onChange, { immediate: true });
    }
  }

  /**
   * 監視リスナーを登録する。
   * @param {(payload: HistorySnapshot) => void} listener
   * @param {{ immediate?: boolean }} [options]
   * @returns {() => void}
   */
  onChange(listener, { immediate = false } = {}) {
    if (typeof listener !== 'function') {
      throw new TypeError('HistoryManager.onChange listener must be a function');
    }
    this._listeners.add(listener);
    if (immediate) {
      listener(this._buildSnapshot('snapshot'));
    }
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * リスナーを全て解除する。
   */
  dispose() {
    this._listeners.clear();
  }

  /**
   * 現在のスタック長を返す。
   * @returns {number}
   */
  get length() {
    return this.stack.length;
  }

  /**
   * 設定されている上限を返す。
   * @returns {number}
   */
  get limit() {
    return this._limit;
  }

  /**
   * 履歴の保持上限を変更する。
   * @param {number} limit
   * @returns {number} 新しい上限
   */
  setLimit(limit) {
    const next = this._normalizeLimit(limit);
    if (next === this._limit) {
      return this._limit;
    }
    this._limit = next;
    this._enforceLimit();
    this._notify('limit');
    return this._limit;
  }

  /**
   * 履歴を全て破棄する。
   * @returns {boolean} 何かが削除された場合は true
   */
  clear() {
    if (this.stack.length === 0 && this.index === -1) {
      return false;
    }
    this.stack = [];
    this.index = -1;
    this._notify('clear');
    return true;
  }

  /**
   * パッチをスタックに追加する。
   * @param {*} patch
   * @param {{ label?: string|null, timestamp?: number, metadata?: any }} [meta]
   * @returns {HistoryEntry|null}
   */
  pushPatch(patch, meta = {}) {
    if (patch == null) {
      return null;
    }
    this.stack.length = this.index + 1;
    const entry = this._createEntry(patch, meta);
    this.stack.push(entry);
    this.index = this.stack.length - 1;
    this._enforceLimit();
    this._notify('push', entry);
    return this._snapshot(entry);
  }

  /**
   * 直近のエントリを置き換える。
   * @param {*} patch
   * @param {{ label?: string|null, timestamp?: number, metadata?: any }} [meta]
   * @returns {HistoryEntry|null}
   */
  replaceTop(patch, meta = {}) {
    if (!this.canUndo() || patch == null) {
      return null;
    }
    const updated = this._createEntry(patch, meta, this.stack[this.index]);
    this.stack[this.index] = updated;
    this._notify('replace', updated);
    return this._snapshot(updated);
  }

  /**
   * 直近エントリのメタデータのみ更新する。
   * @param {object|((meta: HistoryEntryMeta) => object)} updater
   * @returns {HistoryEntry|null}
   */
  updateTopMetadata(updater) {
    if (!this.canUndo()) {
      return null;
    }
    const current = this.stack[this.index];
    let nextMeta;
    if (typeof updater === 'function') {
      nextMeta = updater({
        label: current.label,
        timestamp: current.timestamp,
        metadata: current.metadata,
      });
    } else {
      nextMeta = updater;
    }
    if (!nextMeta || typeof nextMeta !== 'object') {
      throw new TypeError('updateTopMetadata expects an object or updater function');
    }
    const updated = this._createEntry(current.patch, nextMeta, current);
    this.stack[this.index] = updated;
    this._notify('metadata', updated);
    return this._snapshot(updated);
  }

  /**
   * undo が可能かどうか。
   * @returns {boolean}
   */
  canUndo() {
    return this.index >= 0;
  }

  /**
   * redo が可能かどうか。
   * @returns {boolean}
   */
  canRedo() {
    return this.index < this.stack.length - 1;
  }

  /**
   * undo を実行し、パッチを返す。
   * @returns {*|null}
   */
  undo() {
    if (!this.canUndo()) {
      return null;
    }
    const entry = this.stack[this.index--];
    this._notify('undo', entry);
    return entry.patch;
  }

  /**
   * redo を実行し、パッチを返す。
   * @returns {*|null}
   */
  redo() {
    if (!this.canRedo()) {
      return null;
    }
    const entry = this.stack[++this.index];
    this._notify('redo', entry);
    return entry.patch;
  }

  /**
   * 次に undo されるエントリのスナップショットを返す。
   * @returns {HistoryEntry|null}
   */
  peekUndo() {
    return this._snapshot(this._peekUndoRaw());
  }

  /**
   * 次に redo されるエントリのスナップショットを返す。
   * @returns {HistoryEntry|null}
   */
  peekRedo() {
    return this._snapshot(this._peekRedoRaw());
  }

  _peekUndoRaw() {
    if (this.index < 0) {
      return null;
    }
    return this.stack[this.index];
  }

  _peekRedoRaw() {
    if (this.index >= this.stack.length - 1) {
      return null;
    }
    return this.stack[this.index + 1];
  }

  _notify(type, changed) {
    this.version += 1;
    const payload = this._buildSnapshot(type, changed);
    for (const listener of this._listeners) {
      listener(payload);
    }
    return payload;
  }

  _buildSnapshot(type, changed) {
    return {
      type,
      version: this.version,
      size: this.stack.length,
      index: this.index,
      limit: this._limit,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undo: this._snapshot(this._peekUndoRaw()),
      redo: this._snapshot(this._peekRedoRaw()),
      changed: this._snapshot(changed),
    };
  }

  _snapshot(entry) {
    if (!entry) {
      return null;
    }
    const meta = entry.metadata;
    let metadata = meta;
    if (meta && typeof meta === 'object') {
      metadata = Array.isArray(meta) ? [...meta] : { ...meta };
    }
    return {
      patch: entry.patch,
      label: entry.label ?? null,
      timestamp: entry.timestamp,
      metadata,
    };
  }

  _createEntry(patch, meta = {}, previous) {
    if (meta == null) {
      meta = {};
    }
    if (typeof meta !== 'object') {
      throw new TypeError('History metadata must be an object');
    }
    const base = previous ?? {};
    const timestamp = meta.timestamp ?? base.timestamp ?? Date.now();
    return {
      patch,
      label: meta.label ?? base.label ?? null,
      timestamp,
      metadata: meta.metadata ?? base.metadata ?? null,
    };
  }

  _normalizeLimit(limit) {
    const value = Number(limit);
    if (!Number.isFinite(value) || value <= 0) {
      return Infinity;
    }
    return Math.floor(value);
  }

  _enforceLimit() {
    if (!Number.isFinite(this._limit)) {
      return 0;
    }
    const excess = this.stack.length - this._limit;
    if (excess <= 0) {
      return 0;
    }
    this.stack.splice(0, excess);
    this.index -= excess;
    if (this.index < -1) {
      this.index = -1;
    }
    return excess;
  }
}

/**
 * @typedef {Object} HistoryEntry
 * @property {*} patch
 * @property {string|null} label
 * @property {number} timestamp
 * @property {any} metadata
 */

/**
 * @typedef {Object} HistoryEntryMeta
 * @property {string|null} label
 * @property {number} timestamp
 * @property {any} metadata
 */

/**
 * @typedef {Object} HistorySnapshot
 * @property {'snapshot'|'push'|'undo'|'redo'|'clear'|'replace'|'metadata'|'limit'} type
 * @property {number} version
 * @property {number} size
 * @property {number} index
 * @property {number} limit
 * @property {boolean} canUndo
 * @property {boolean} canRedo
 * @property {HistoryEntry|null} undo
 * @property {HistoryEntry|null} redo
 * @property {HistoryEntry|null} changed
 */
