// panels.js - パネル管理モジュール

let adjustCallbacks = {};
let layerCallbacks = {};
let layerPropertiesCallbacks = {};

const layerPropertiesElements = {
  container: null,
  typeLabel: null,
  vectorControls: null,
  color: null,
  width: null,
  dash: null,
  cap: null,
  apply: null,
};

let suppressLayerPropertyEvent = false;

export function initPanelHeaders() {
  document.querySelectorAll('.panel').forEach(p => {
    const header = p.querySelector('.panel-header');
    const name = p.dataset.name || p.id;
    if (header) header.textContent = `${name} (ID: ${p.id})`;
  });
}

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
  const addVectorBtn = document.getElementById('addVectorLayerBtn');

  addBtn?.addEventListener('click', () => layerCallbacks.onAdd?.());
  delBtn?.addEventListener('click', () => layerCallbacks.onDelete?.());
  addVectorBtn?.addEventListener('click', () => layerCallbacks.onAddVector?.());

  layerPropertiesElements.container = document.getElementById('layerProperties');
  layerPropertiesElements.typeLabel = document.getElementById('layerTypeLabel');
  layerPropertiesElements.vectorControls = document.getElementById('vectorLayerControls');
  layerPropertiesElements.color = document.getElementById('vectorLayerColor');
  layerPropertiesElements.width = document.getElementById('vectorLayerWidth');
  layerPropertiesElements.dash = document.getElementById('vectorLayerDash');
  layerPropertiesElements.cap = document.getElementById('vectorLayerCap');
  layerPropertiesElements.apply = document.getElementById('vectorLayerApplyAll');

  const emitStyleChange = () => {
    if (suppressLayerPropertyEvent) return;
    const color = layerPropertiesElements.color?.value || '#000000';
    const width = parseFloat(layerPropertiesElements.width?.value || '1');
    const dash = layerPropertiesElements.dash?.value || '';
    const cap = layerPropertiesElements.cap?.value || 'butt';
    layerPropertiesCallbacks.onStyleChange?.({
      color,
      width,
      dashPattern: dash,
      capStyle: cap,
    });
  };

  layerPropertiesElements.color?.addEventListener('input', emitStyleChange);
  layerPropertiesElements.width?.addEventListener('input', emitStyleChange);
  layerPropertiesElements.dash?.addEventListener('input', emitStyleChange);
  layerPropertiesElements.cap?.addEventListener('change', emitStyleChange);
  layerPropertiesElements.apply?.addEventListener('click', () =>
    layerPropertiesCallbacks.onApplyStyle?.(),
  );
}

export function setLayerCallbacks(callbacks) {
  layerCallbacks = callbacks;
}

export function setLayerPropertiesCallbacks(callbacks) {
  layerPropertiesCallbacks = callbacks || {};
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

const ensureLayerPropertiesInitialised = () => {
  return layerPropertiesElements.container && layerPropertiesElements.typeLabel;
};

const normaliseColorValue = (value) => {
  if (typeof value !== 'string') return '#000000';
  const trimmed = value.trim();
  if (!trimmed) return '#000000';
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return trimmed;
  return '#000000';
};

export function updateLayerProperties(layer) {
  if (!ensureLayerPropertiesInitialised()) return;
  const { container, typeLabel, vectorControls, color, width, dash, cap, apply } =
    layerPropertiesElements;

  if (!layer) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  const type = layer.layerType === 'vector' ? 'ベクターレイヤー' : 'ラスターレイヤー';
  if (typeLabel) typeLabel.textContent = type;

  if (layer.layerType === 'vector') {
    if (vectorControls) vectorControls.style.display = 'grid';
    const style = layer.vectorData?.defaultStyle || {};
    suppressLayerPropertyEvent = true;
    if (color) color.value = normaliseColorValue(style.color);
    if (width) {
      const w = Number(style.width);
      width.value = Number.isFinite(w) && w > 0 ? String(w) : '1';
    }
    if (dash) dash.value = typeof style.dashPattern === 'string' ? style.dashPattern : '';
    if (cap) cap.value = typeof style.capStyle === 'string' ? style.capStyle : 'butt';
    suppressLayerPropertyEvent = false;
    if (apply) {
      const curveCount = Array.isArray(layer.vectorData?.curves)
        ? layer.vectorData.curves.length
        : 0;
      apply.disabled = curveCount === 0;
    }
  } else {
    if (vectorControls) vectorControls.style.display = 'none';
    if (apply) apply.disabled = true;
  }
}
