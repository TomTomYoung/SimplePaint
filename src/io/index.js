import { createLayeredSnapshot } from './layered-snapshot.js';
import { showRecoveryDialog, showSaveDialog } from '../gui/document-dialogs.js';
import { updateStatus } from '../gui/statusbar.js';
import { showRestoreButton, updateAutosaveBadge } from '../gui/toolbar.js';
import {
  createDocument,
  applyCanvasToActiveLayer,
  positionFloatingSelection,
  applySnapshotToDocument,
} from './document.js';
import { copySelection, cutSelection, readClipboardItems } from './clipboard-actions.js';
import { saveDocumentAs } from './export-actions.js';
import { createAutosaveController } from './autosave.js';
import { createSessionManager } from './session.js';
import { loadImageFile } from './file-io.js';

let engine = null;
let fitToScreen = () => {};
const sessionManager = createSessionManager();
let autosaveController = null;

const AUTOSAVE_INTERVAL = 15000;

const nowFmt = () => new Date().toLocaleTimeString();

function handleAutosaveStatus(event) {
  switch (event.type) {
    case 'saving':
      updateAutosaveBadge('AutoSave: 保存中…');
      break;
    case 'paused':
      updateAutosaveBadge('AutoSave: 一時停止');
      break;
    case 'resumed':
      updateAutosaveBadge('AutoSave: 再開');
      break;
    case 'saved':
      updateAutosaveBadge('AutoSave: ' + nowFmt());
      break;
    case 'restored':
      updateAutosaveBadge('Restored: ' + nowFmt());
      showRestoreButton(false);
      break;
    case 'available':
      showRestoreButton(true);
      break;
    case 'missing':
      showRestoreButton(false);
      break;
    case 'error':
      updateAutosaveBadge('AutoSave: 失敗');
      break;
    case 'restore-error':
    case 'check-error':
      console.error('Autosave error:', event.error);
      break;
    default:
      break;
  }
}

function ensureAutosaveController() {
  if (autosaveController) return autosaveController;
  autosaveController = createAutosaveController({
    sessionManager,
    autosaveInterval: AUTOSAVE_INTERVAL,
    snapshotDocument: async () => createLayeredSnapshot(engine),
    applySnapshot: (snapshot) =>
      applySnapshotToDocument({ engine, fitToScreen, snapshot }),
    onStatus: handleAutosaveStatus,
    eventBus: engine?.eventBus,
    eventNames: ['store:updated', 'document:changed'],
  });
  autosaveController.pause();
  return autosaveController;
}

export function initIO(eng, fitFunc) {
  engine = eng;
  fitToScreen = typeof fitFunc === 'function' ? fitFunc : () => {};
  ensureAutosaveController();

  window.addEventListener('paste', async (e) => {
    if (e.target?.closest?.('input, textarea, [contenteditable="true"], dialog')) return;
    if (e.clipboardData) {
      const items = [...e.clipboardData.items].filter((item) => item.type.startsWith('image/'));
      if (items.length) {
        e.preventDefault();
        const file = items[0].getAsFile();
        if (file) {
          try {
            const { canvas, width, height } = await loadImageFile(file);
            positionFloatingSelection(engine, canvas, width, height);
            saveSessionDebounced();
          } catch {
            updateStatus('ペースト失敗');
          }
        }
      }
    } else if (navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read();
        await handleClipboardItems(items);
      } catch {
        updateStatus('ペースト不可（権限/ブラウザ制限）');
      }
    }
  });

  window.addEventListener('beforeunload', () => {
    const controller = ensureAutosaveController();
    if (!controller.isPaused) controller.flush();
  });
}

export function initDocument(width = 1280, height = 720, backgroundColor = '#ffffff') {
  createDocument({ engine, fitToScreen, width, height, backgroundColor });
  saveSessionDebounced();
}

export async function openImageFile(file) {
  try {
    const { canvas, width, height } = await loadImageFile(file);
    createDocument({ engine, fitToScreen, width, height, backgroundColor: null });
    applyCanvasToActiveLayer(canvas);
    engine.requestRepaint();
    saveSessionDebounced();
  } catch (error) {
    console.error('Failed to open image file', error);
  }
}

export async function triggerSave(format) {
  if (!format) {
    const options = await showSaveDialog();
    if (!options) return;
    format = options.format;
  }
  return saveDocumentAs(format).catch(() => {
    updateStatus('保存に失敗しました');
  });
}

export async function doCopy(scope = 'layer') {
  try {
    await copySelection(engine, scope);
    updateStatus('コピー完了');
  } catch (error) {
    updateStatus('コピー不可（権限/ブラウザ制限）');
  }
}

export async function doCut(scope = 'layer') {
  if (!engine.selection) {
    updateStatus('選択がないためカット不可');
    return;
  }
  try {
    await cutSelection(engine, scope);
    updateStatus('カット完了');
    saveSessionDebounced();
  } catch (error) {
    updateStatus('カットに失敗しました');
  }
}

export async function handleClipboardItems(items) {
  try {
    const result = await readClipboardItems(items);
    if (result) {
      positionFloatingSelection(engine, result.canvas, result.width, result.height);
      saveSessionDebounced();
    }
  } catch {
    updateStatus('クリップボードの読み込みに失敗しました');
  }
}

export function saveSession() {
  return ensureAutosaveController().saveNow();
}

export function saveSessionDebounced() {
  ensureAutosaveController().scheduleSave();
}

export async function restoreSession() {
  const controller = ensureAutosaveController();
  await controller.pause();
  const restored = await controller.restore();
  if (restored) {
    const id = engine.store.getState().toolId;
    engine.store.set({ toolId: id === 'select-free' ? 'select-rect' : id });
    await controller.resume({ immediate: true });
  }
  return restored;
}

export async function checkSession() {
  const controller = ensureAutosaveController();
  const available = await controller.check();
  if (available === false) return controller.resume({ immediate: true });
  if (available === null) {
    updateAutosaveBadge('前回の絵を確認できません。画像を保存してください');
    return;
  }
  while (true) {
    const choice = await showRecoveryDialog();
    if (choice === 'new') {
      showRestoreButton(false);
      return controller.resume({ immediate: true });
    }
    if (await restoreSession()) return;
    updateAutosaveBadge('復元できませんでした。前回の保存は保持しています');
  }
}
