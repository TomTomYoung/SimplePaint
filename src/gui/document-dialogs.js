function openDialog(id) {
  const dialog = document.getElementById(id);
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
    dialog.returnValue = '';
    dialog.showModal();
  });
}

export async function showSaveDialog() {
  if (document.getElementById('saveDialog').open) return null;
  const result = await openDialog('saveDialog');
  if (result !== 'save') return null;
  return { format: document.getElementById('saveFormat').value };
}

export async function showRecoveryDialog() {
  const dialog = document.getElementById('recoveryDialog');
  dialog.oncancel = event => event.preventDefault();
  return openDialog('recoveryDialog');
}

export function constrainDimensions(width, height, originalWidth, originalHeight, changed) {
  const ratio = originalWidth / originalHeight;
  return changed === 'width'
    ? { width, height: Math.max(1, Math.round(width / ratio)) }
    : { width: Math.max(1, Math.round(height * ratio)), height };
}

export async function showSizeDialog(originalWidth, originalHeight) {
  if (document.getElementById('sizeDialog').open) return null;
  const width = document.getElementById('sizeWidth');
  const height = document.getElementById('sizeHeight');
  const lock = document.getElementById('sizeLock');
  const mode = document.getElementById('sizeMode');
  const hint = document.getElementById('sizeHint');
  width.value = originalWidth;
  height.value = originalHeight;
  lock.checked = true;
  mode.value = 'image';
  const describe = () => {
    lock.disabled = mode.value === 'canvas';
    hint.textContent = mode.value === 'canvas'
      ? '絵の大きさを保ち、右側と下側の余白を増減します。小さくすると範囲外を切り落とします。'
      : '画像全体を指定した大きさに拡大・縮小します。';
  };
  const update = changed => {
    if (!lock.checked || mode.value !== 'image') return;
    const w = Number(width.value), h = Number(height.value);
    if (!(w > 0 && h > 0)) return;
    const result = constrainDimensions(w, h, originalWidth, originalHeight, changed);
    width.value = result.width;
    height.value = result.height;
  };
  width.oninput = () => update('width');
  height.oninput = () => update('height');
  lock.onchange = () => update('width');
  mode.onchange = () => { describe(); update('width'); };
  describe();
  const result = await openDialog('sizeDialog');
  width.oninput = height.oninput = lock.onchange = mode.onchange = null;
  if (result !== 'apply') return null;
  return { width: Number(width.value), height: Number(height.value), mode: mode.value };
}
