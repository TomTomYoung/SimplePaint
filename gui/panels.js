// panels.js - パネル管理モジュール

let adjustCallbacks = {};
let layerCallbacks = {};

export function initAdjustPanel() {
  const adjPanel = document.getElementById('adjustPanel');
  const adjBtn = document.getElementById('adjustBtn');
  const brightnessEl = document.getElementById('adjBrightness');
  const contrastEl = document.getElementById('adjContrast');
  const saturationEl = document.getElementById('adjSaturation');
  const hueEl = document.getElementById('adjHue');
  const invertEl = document.getElementById('adjInvert');

  if (!adjPanel || !adjBtn) return;

  adjBtn.addEventListener('click', () => {
    adjPanel.style.display = 
      adjPanel.style.display === 'none' || adjPanel.style.display === '' 
        ? 'block' 
        : 'none';
    if (adjPanel.style.display === 'block') {
      adjustCallbacks.onOpen?.();
    } else {
      adjustCallbacks.onClose?.();
    }
  });

  document.getElementById('adjReset')?.addEventListener('click', () => {
    brightnessEl.value = 0;
    contrastEl.value = 0;
    saturationEl.value = 0;
    hueEl.value = 0;
    invertEl.checked = false;
    adjustCallbacks.onUpdate?.();
  });

  document.getElementById('adjCancel')?.addEventListener('click', () => {
    adjustCallbacks.onCancel?.();
    adjPanel.style.display = 'none';
  });

  document.getElementById('adjApply')?.addEventListener('click', () => {
    adjustCallbacks.onApply?.();
    adjPanel.style.display = 'none';
  });

  [brightnessEl, contrastEl, saturationEl, hueEl].forEach(el => 
    el?.addEventListener('input', () => adjustCallbacks.onUpdate?.())
  );
  invertEl?.addEventListener('change', () => adjustCallbacks.onUpdate?.());
}

export function setAdjustCallbacks(callbacks) {
  adjustCallbacks = callbacks;
}

export function initLayerPanel() {
  const addBtn = document.getElementById('addLayerBtn');
  const delBtn = document.getElementById('delLayerBtn');
  
  addBtn?.addEventListener('click', () => layerCallbacks.onAdd?.());
  delBtn?.addEventListener('click', () => layerCallbacks.onDelete?.());
}

export function setLayerCallbacks(callbacks) {
  layerCallbacks = callbacks;
}

export function updateLayerList(layers, activeLayer, callbacks) {
  const list = document.getElementById('layerList');
  if (!list) return;
  
  list.innerHTML = '';
  layers.forEach((l, i) => {
    const li = document.createElement('li');
    li.className = 'layer-item' + (i === activeLayer ? ' active' : '');
    li.draggable = true;
    li.dataset.index = i;

    li.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', i);
    });
    li.addEventListener('dragover', e => e.preventDefault());
    li.addEventListener('drop', e => {
      e.preventDefault();
      const from = parseInt(e.dataTransfer.getData('text/plain'));
      const to = parseInt(li.dataset.index);
      callbacks.onMove?.(from, to);
    });

    const handle = document.createElement('span');
    handle.textContent = '≡';
    handle.className = 'handle';
    li.appendChild(handle);

    const vis = document.createElement('input');
    vis.type = 'checkbox';
    vis.checked = l.visible;
    vis.addEventListener('change', () => callbacks.onVisibility?.(i, vis.checked));
    li.appendChild(vis);

    const name = document.createElement('span');
    name.textContent = typeof l.name === 'string' && l.name ? l.name : `Layer ${i + 1}`;
    name.style.flex = '1';
    name.style.userSelect = 'none';
    name.title = 'ダブルクリックで名前変更 / クリックで選択';

    name.addEventListener('click', ev => {
      ev.stopPropagation();
      callbacks.onSelect?.(i);
    });

    name.addEventListener('dblclick', ev => {
      ev.stopPropagation();
      const old = typeof l.name === 'string' && l.name ? l.name : `Layer ${i + 1}`;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = old;
      input.style.width = '100%';
      input.style.font = 'inherit';
      input.style.padding = '0';
      input.style.margin = '0';
      input.style.border = '1px solid #999';

      const commit = () => {
        const v = input.value.trim();
        callbacks.onRename?.(i, v || old);
      };
      const cancel = () => callbacks.onRename?.(i, old);

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      });
      input.addEventListener('blur', commit);

      li.replaceChild(input, name);
      input.focus();
      input.select();
    });

    li.appendChild(name);

    const op = document.createElement('input');
    op.type = 'range';
    op.min = 0;
    op.max = 1;
    op.step = 0.01;
    op.value = l.opacity;
    op.addEventListener('input', () => callbacks.onOpacity?.(i, parseFloat(op.value)));
    li.appendChild(op);

    const mode = document.createElement('select');
    ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color', 'difference'].forEach(m => {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = m;
      if (l.mode === m) o.selected = true;
      mode.appendChild(o);
    });
    mode.addEventListener('change', () => callbacks.onBlendMode?.(i, mode.value));
    li.appendChild(mode);

    const clip = document.createElement('input');
    clip.type = 'checkbox';
    clip.checked = l.clip;
    clip.title = 'Clip to below';
    clip.addEventListener('change', () => callbacks.onClip?.(i, clip.checked));
    li.appendChild(clip);

    list.appendChild(li);
  });
}