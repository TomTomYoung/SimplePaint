import { bmp, clipCanvas, layers, activeLayer, flattenLayers, renderLayers, updateLayerList, addLayer } from './layer.js';
import { showRestoreButton, updateAutosaveBadge } from './gui/toolbar.js';
import { updateStatus } from './gui/statusbar.js';

let engine = null;
let fitToScreen = () => {};

const nowFmt = () => new Date().toLocaleTimeString();

export function initIO(eng, fitFunc) {
  engine = eng;
  fitToScreen = fitFunc;

  document.getElementById('savePNG').addEventListener('click', savePNG);
  document.getElementById('saveJPG').addEventListener('click', saveJPG);
  document.getElementById('saveWEBP').addEventListener('click', saveWEBP);

  window.addEventListener('paste', async (e) => {
    if (e.clipboardData) {
      const items = [...e.clipboardData.items].filter((it) => it.type.startsWith('image/'));
      if (items.length) {
        e.preventDefault();
        const file = items[0].getAsFile();
        if (file) pasteImageFile(file);
      }
    } else if (navigator.clipboard && navigator.clipboard.read) {
      try {
        const items = await navigator.clipboard.read();
        handleClipboardItems(items);
      } catch {}
    }
  });

  window.addEventListener('beforeunload', () => {
    saveSession();
  });

  setInterval(saveSession, 15000);
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

export function openImageFile(file) {
  const img = new Image();
  img.onload = () => {
    initDocument(img.naturalWidth, img.naturalHeight, '#ffffff');
    layers[activeLayer].getContext('2d').drawImage(img, 0, 0);
    renderLayers();
    engine.clearSelection();
    fitToScreen();
    engine.requestRepaint();
    saveSessionDebounced();
  };
  img.src = URL.createObjectURL(file);
}

function downloadDataURL(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

function savePNG() {
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const cctx = c.getContext('2d');
  flattenLayers(cctx);
  downloadDataURL(c.toDataURL('image/png'), 'image.png');
}

function saveJPG() {
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const cctx = c.getContext('2d');
  cctx.fillStyle = '#ffffff';
  cctx.fillRect(0, 0, c.width, c.height);
  flattenLayers(cctx);
  downloadDataURL(c.toDataURL('image/jpeg', 0.92), 'image.jpg');
}

function saveWEBP() {
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const cctx = c.getContext('2d');
  flattenLayers(cctx);
  downloadDataURL(c.toDataURL('image/webp', 0.92), 'image.webp');
}

export function triggerSave(format) {
  if (format === 'png') document.getElementById('savePNG').click();
  else if (format === 'jpg') document.getElementById('saveJPG').click();
  else if (format === 'webp') document.getElementById('saveWEBP').click();
}

export async function doCopy() {
  const sel = engine.selection;
  let srcCanvas = null;
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
    srcCanvas = c;
  } else {
    srcCanvas = bmp;
  }
  try {
    const blob = await new Promise((res) => srcCanvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('blob null');
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
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

export function handleClipboardItems(items) {
  for (const item of items) {
    for (const type of item.types) {
      if (type.startsWith('image/')) {
        item.getType(type).then((blob) => pasteImageFile(blob));
        return;
      }
    }
  }
}

function pasteImageFile(file) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const cx = bmp.width / 2 - c.width / 2,
      cy = bmp.height / 2 - c.height / 2;
    engine.selection = {
      rect: {
        x: Math.floor(cx),
        y: Math.floor(cy),
        w: c.width,
        h: c.height,
      },
      floatCanvas: c,
      pos: { x: Math.floor(cx), y: Math.floor(cy) },
    };
    engine.requestRepaint();
    saveSessionDebounced();
  };
  img.src = URL.createObjectURL(file);
}

const DB_NAME = 'paintdb',
  STORE = 'kv',
  KEY = 'autosave';

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function saveSession() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const cctx = c.getContext('2d');
    flattenLayers(cctx);
    const dataURL = c.toDataURL('image/png');
    store.put(
      { dataURL, width: bmp.width, height: bmp.height, ts: Date.now() },
      KEY
    );
    await tx.complete;
    updateAutosaveBadge('AutoSave: ' + nowFmt());
  } catch (e) {
    updateAutosaveBadge('AutoSave: 失敗');
  }
}

let saveTimer = null;
export function saveSessionDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSession, 800);
}

async function getSessionData() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const data = await new Promise((res, rej) => {
      const g = store.get(KEY);
      g.onsuccess = () => res(g.result);
      g.onerror = () => rej(g.error);
    });
    return data;
  } catch (e) {
    return null;
  }
}

export async function restoreSession() {
  const data = await getSessionData();
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
}

export async function checkSession() {
  const data = await getSessionData();
  if (data && data.dataURL) {
    showRestoreButton(true);
  }
}

export { saveSession };
