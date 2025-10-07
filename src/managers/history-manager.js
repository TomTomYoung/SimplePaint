/**
 * 履歴スタック管理。
 * 入力: パッチオブジェクト
 * 出力: undo/redo で取り出されるパッチ
 */
export class HistoryManager {
  constructor() {
    this.stack = [];
    this.index = -1;
  }

  pushPatch(patch) {
    if (!patch) return;
    this.stack.length = this.index + 1;
    this.stack.push(patch);
    this.index = this.stack.length - 1;
  }

  undo() {
    if (this.index < 0) return null;
    return this.stack[this.index--];
  }

  redo() {
    if (this.index >= this.stack.length - 1) return null;
    return this.stack[++this.index];
  }

  clear() {
    this.stack = [];
    this.index = -1;
  }

  canUndo() {
    return this.index >= 0;
  }

  canRedo() {
    return this.index < this.stack.length - 1;
  }
}
