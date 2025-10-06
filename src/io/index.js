import { bmp, clipCanvas, layers, activeLayer, flattenLayers, renderLayers, updateLayerList, addLayer } from '../core/layer.js';
import { showRestoreButton, updateAutosaveBadge } from '../gui/toolbar.js';
import { updateStatus } from '../gui/statusbar.js';
import { extractImageFromClipboardItems, writeCanvasToClipboard } from './clipboard.js';
import { canvasToBlob, downloadBlob, loadImageFile, renderToCanvas } from './file-io.js';
import { createSessionManager } from './session.js';

let engine = null;
let fitToScreen = () => {};
const sessionManager = createSessionManager();
let autosaveTimer = null;
const AUTOSAVE_INTERVAL = 15000;

const nowFmt = () => new Date().toLocaleTimeString();

export function initIO(eng, fitFunc) {
  engine = eng;
  fitToScreen = fitFunc;

  document.getElementById('savePNG').addEventListener('click', () => saveImage('png'));
  document.getElementById('saveJPG').addEventListener('click', () => saveImage('jpg'));
  document.getElementById('saveWEBP').addEventListener('click', () => saveImage('webp'));

  window.addEventListener('paste', async (e) => {
    if (e.clipboardData) {
      const items = [...e.clipboardData.items].filter((it) => it.type.startsWith('image/'));
      if (items.length) {
        e.preventDefault();
        const file = items[0].getAsFile();
        if (file) {
          try {
            const { canvas, width, height } = await loadImageFile(file);
            placeCanvasSelection(canvas, width, height);
          } catch {}
        }
      }
    } else if (navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read();
        handleClipboardItems(items);
      } catch {}
    }
  });

  window.addEventListener('beforeunload', () => {
    saveSession();
  });

  setInterval(saveSession, AUTOSAVE_INTERVAL);
}

export function initDocument(w = 1280, h = 720, bg = '#ffffff') {
  bmp.width = w;
  bmp.height = h;
  clipCanvas.width = w;
  clipCanvas.height = h;
  layers.length = 0;
  addLayer(engine);
  layers.forEach((l) => {
    l.width = w;
    l.height = h;
    l.getContext('2d').clearRect(0, 0, w, h);
  });
  const bgctx = layers[0].getContext('2d');
  bgctx.fillStyle = bg;
  bgctx.fillRect(0, 0, w, h);
  renderLayers();
  fitToScreen();
  updateLayerList(engine);
}

export async function openImageFile(file) {
  try {
    const { canvas, width, height } = await loadImageFile(file);
    initDocument(width, height, '#ffffff');
    layers[activeLayer].getContext('2d').drawImage(canvas, 0, 0);
    renderLayers();
    engine.clearSelection();
    fitToScreen();
    engine.requestRepaint();
    saveSessionDebounced();
  } catch (e) {
    console.error('Failed to open image file', e);
  }
}

function downloadFromCanvas(canvas, format) {
  const mime =
    format === 'png'
      ? 'image/png'
      : format === 'jpg'
      ? 'image/jpeg'
      : 'image/webp';
  const quality = format === 'png' ? undefined : 0.92;
  canvasToBlob(canvas, mime, quality)
    .then((blob) => downloadBlob(blob, `image.${format}`))
    .catch(() => {});
}

async function saveImage(format) {
  const background = format === 'jpg' ? '#ffffff' : undefined;
  const canvas = renderToCanvas({
    width: bmp.width,
    height: bmp.height,
    backgroundColor: background,
    render: (ctx) => flattenLayers(ctx),
  });
  downloadFromCanvas(canvas, format);
}

export function triggerSave(format) {
  if (format === 'png') saveImage('png');
  else if (format === 'jpg') saveImage('jpg');
  else if (format === 'webp') saveImage('webp');
}

export async function doCopy() {
  const sel = engine.selection;
  let sourceCanvas = null;
  if (sel) {
    const { x, y, w, h } = sel.rect;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cctx = c.getContext('2d');
    if (sel.floatCanvas) {
      cctx.drawImage(sel.floatCanvas, 0, 0);
    } else {
      const ctx = layers[activeLayer].getContext('2d');
      const img = ctx.getImageData(x, y, w, h);
      cctx.putImageData(img, 0, 0);
    }
    sourceCanvas = c;
  } else {
    sourceCanvas = bmp;
  }
  try {
    await writeCanvasToClipboard(sourceCanvas);
    updateStatus('コピー完了');
  } catch (e) {
    updateStatus('コピー不可（権限/ブラウザ制限）');
  }
}

export async function doCut() {
  const sel = engine.selection;
  if (!sel) {
    updateStatus('選択がないためカット不可');
    return;
  }
  await doCopy();
  const { x, y, w, h } = sel.rect;
  const ctx = layers[activeLayer].getContext('2d');
  const before = ctx.getImageData(x, y, w, h);
  ctx.clearRect(x, y, w, h);
  const after = ctx.getImageData(x, y, w, h);
  engine.history.pushPatch({ rect: { x, y, w, h }, before, after });
  engine.clearSelection();
  engine.requestRepaint();
  saveSessionDebounced();
}

export async function handleClipboardItems(items) {
  try {
    const result = await extractImageFromClipboardItems(items);
    if (result) {
      placeCanvasSelection(result.canvas, result.width, result.height);
    }
  } catch {}
}

function placeCanvasSelection(canvas, width, height) {
  const cx = bmp.width / 2 - width / 2;
  const cy = bmp.height / 2 - height / 2;
  engine.selection = {
    rect: {
      x: Math.floor(cx),
      y: Math.floor(cy),
      w: width,
      h: height,
    },
    floatCanvas: canvas,
    pos: { x: Math.floor(cx), y: Math.floor(cy) },
  };
  engine.requestRepaint();
  saveSessionDebounced();
}

export async function restoreSession() {
  try {
    const data = await sessionManager.load();
    if (data && data.dataURL) {
      const img = new Image();
      img.onload = () => {
        initDocument(data.width, data.height, '#ffffff');
        layers[activeLayer].getContext('2d').drawImage(img, 0, 0);
        renderLayers();
        fitToScreen();
        engine.requestRepaint();
        updateAutosaveBadge('Restored: ' + nowFmt());
        showRestoreButton(false);
      };
      img.src = data.dataURL;
    }
  } catch (e) {
    console.error('Failed to restore session', e);
  }
}

export async function checkSession() {
  try {
    const data = await sessionManager.load();
    if (data && data.dataURL) {
      showRestoreButton(true);
    }
  } catch (e) {
    console.error('Failed to check session', e);
  }
}

async function saveSession() {
  try {
    const canvas = renderToCanvas({
      width: bmp.width,
      height: bmp.height,
      render: (ctx) => flattenLayers(ctx),
    });
    const dataURL = canvas.toDataURL('image/png');
    await sessionManager.save({ dataURL, width: bmp.width, height: bmp.height, ts: Date.now() });
    updateAutosaveBadge('AutoSave: ' + nowFmt());
  } catch (e) {
    updateAutosaveBadge('AutoSave: 失敗');
  }
}

export function saveSessionDebounced() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveSession, 800);
}

export { saveSession };
