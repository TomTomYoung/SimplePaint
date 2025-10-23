// panels.js - パネル管理モジュール

import { readString, writeString } from '../utils/safe-storage.js';

const LAYER_FILTER_KEY = 'ui:layerFilter';
const LAYER_SEARCH_KEY = 'ui:layerSearch';
const VALID_LAYER_FILTERS = new Set(['all', 'raster', 'vector', 'text']);

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
let layerFilter = readStoredLayerFilter();
let layerSearchValue = '';
let layerSearchTerm = '';
let lastLayerArgs = { layers: [], activeLayer: 0, callbacks: {} };

const normaliseLayerId = layer => {
  if (layer && typeof layer._id === 'string') {
    return layer._id;
  }
  return null;
};


const storedLayerSearch = readString(LAYER_SEARCH_KEY, '');
if (typeof storedLayerSearch === 'string' && storedLayerSearch.trim().length > 0) {
  layerSearchValue = storedLayerSearch.trim();
  layerSearchTerm = layerSearchValue.toLowerCase();
}

function readStoredLayerFilter() {
  const stored = readString(LAYER_FILTER_KEY, 'all');
  if (typeof stored !== 'string') return 'all';
  const normalised = stored.trim().toLowerCase();
  return VALID_LAYER_FILTERS.has(normalised) ? normalised : 'all';
}

const rememberLayerFilter = value => {
  if (!VALID_LAYER_FILTERS.has(value)) return;
  writeString(LAYER_FILTER_KEY, value);
};

const rememberLayerSearch = value => {
  writeString(LAYER_SEARCH_KEY, value.trim());
};

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

  const filterButtons = Array.from(document.querySelectorAll('.layer-filter'));
  const updateFilterButtonState = () => {
    filterButtons.forEach(button => {
      const value = button.dataset.layerFilter || 'all';
      button.classList.toggle('is-active', value === layerFilter);
      button.setAttribute('aria-pressed', value === layerFilter ? 'true' : 'false');
    });
  };
  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      const next = button.dataset.layerFilter || 'all';
      if (next === layerFilter) return;
      layerFilter = VALID_LAYER_FILTERS.has(next) ? next : 'all';
      updateFilterButtonState();
      rerenderLayerList();
      rememberLayerFilter(layerFilter);
    });
  });
  updateFilterButtonState();
  rememberLayerFilter(layerFilter);

  const searchInput = document.getElementById('layerSearch');
  if (searchInput) {
    if (layerSearchValue) {
      searchInput.value = layerSearchValue;
    }
    rememberLayerSearch(layerSearchValue);

    let searchPersistTimer = null;
    const schedulePersist = () => {
      if (searchPersistTimer !== null) {
        clearTimeout(searchPersistTimer);
      }
      searchPersistTimer = setTimeout(() => {
        rememberLayerSearch(layerSearchValue);
        searchPersistTimer = null;
      }, 400);
    };

    searchInput.addEventListener('input', () => {
      const rawValue = searchInput.value;
      layerSearchValue = rawValue.trim();
      layerSearchTerm = layerSearchValue.toLowerCase();
      rerenderLayerList();
      schedulePersist();
    });

    searchInput.addEventListener('blur', () => {
      layerSearchValue = searchInput.value.trim();
      layerSearchTerm = layerSearchValue.toLowerCase();
      rememberLayerSearch(layerSearchValue);
      if (searchPersistTimer !== null) {
        clearTimeout(searchPersistTimer);
        searchPersistTimer = null;
      }
    });
  }

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
  lastLayerArgs = { layers, activeLayer, callbacks };
  renderLayerList(layers, activeLayer, callbacks);
}

const rerenderLayerList = () => {
  if (!lastLayerArgs) return;
  renderLayerList(lastLayerArgs.layers, lastLayerArgs.activeLayer, lastLayerArgs.callbacks);
};

const matchesLayerFilter = layer => {
  if (layerFilter === 'all') return true;
  const type = typeof layer?.layerType === 'string' ? layer.layerType : 'raster';
  return type === layerFilter;
};

const matchesLayerSearch = layer => {
  if (!layerSearchTerm) return true;
  const name = typeof layer?.name === 'string' ? layer.name : '';
  return name.toLowerCase().includes(layerSearchTerm);
};

const layerTypeLabel = layer => {
  const type = typeof layer?.layerType === 'string' ? layer.layerType : 'raster';
  switch (type) {
    case 'vector':
      return 'ベクター';
    case 'text':
      return 'テキスト';
    default:
      return 'ラスター';
  }
};

const renderLayerList = (layers, activeLayer, callbacks) => {
  const list = document.getElementById('layerList');
  if (!list) return;

  list.innerHTML = '';
  layerThumbnailRegistry.clear();
  const filtered = layers
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => matchesLayerFilter(layer))
    .filter(({ layer }) => matchesLayerSearch(layer));

  if (filtered.length === 0) {
    layerThumbnailRegistry.clear();
    const empty = document.createElement('li');
    empty.className = 'layer-empty';
    empty.textContent = layerSearchTerm
      ? '条件に一致するレイヤーがありません'
      : 'レイヤーがありません';
    list.appendChild(empty);
    return;
  }

  filtered.forEach(({ layer: l, index: i }) => {
    const li = document.createElement('li');
    const layerId = normaliseLayerId(l);
    li.className = 'layer-item' + (i === activeLayer ? ' active' : '');
    li.draggable = true;
    li.dataset.index = i;
    li.dataset.layerId = layerId ?? String(i);

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

    const meta = document.createElement('div');
    meta.className = 'layer-meta';
    const metaTop = document.createElement('div');
    metaTop.className = 'layer-meta-top';

    const handle = document.createElement('span');
    handle.textContent = '≡';
    handle.className = 'handle';
    metaTop.appendChild(handle);

    const vis = document.createElement('input');
    vis.type = 'checkbox';
    vis.checked = l.visible;
    vis.addEventListener('change', () => callbacks.onVisibility?.(i, vis.checked));
    metaTop.appendChild(vis);

    const name = document.createElement('span');
    name.className = 'layer-name';
    const displayName = typeof l.name === 'string' && l.name ? l.name : `Layer ${i + 1}`;
    name.textContent = displayName;
    name.style.userSelect = 'none';
    name.title = 'ダブルクリックで名前変更 / クリックで選択';

    name.addEventListener('click', ev => {
      ev.stopPropagation();
      callbacks.onSelect?.(i);
    });

    name.addEventListener('dblclick', ev => {
      ev.stopPropagation();
      const old = displayName;
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

      metaTop.replaceChild(input, name);
      input.focus();
      input.select();
    });

    metaTop.appendChild(name);
    meta.appendChild(metaTop);

    const metaBottom = document.createElement('div');
    metaBottom.className = 'layer-meta-bottom';
    const typeLabel = document.createElement('span');
    typeLabel.className = 'layer-type';
    typeLabel.textContent = layerTypeLabel(l);
    metaBottom.appendChild(typeLabel);

    if (typeof l.width === 'number' && typeof l.height === 'number') {
      const size = document.createElement('span');
      size.className = 'layer-size';
      size.textContent = `${l.width}×${l.height}`;
      metaBottom.appendChild(size);
    }
    meta.appendChild(metaBottom);
    li.appendChild(meta);

    const controls = document.createElement('div');
    controls.className = 'layer-item-controls';

    const op = document.createElement('input');
    op.type = 'range';
    op.min = 0;
    op.max = 1;
    op.step = 0.01;
    op.value = l.opacity;
    op.addEventListener('input', () => callbacks.onOpacity?.(i, parseFloat(op.value)));
    controls.appendChild(op);

    const mode = document.createElement('select');
    ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color', 'difference'].forEach(m => {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = m;
      if (l.mode === m) o.selected = true;
      mode.appendChild(o);
    });
    mode.addEventListener('change', () => callbacks.onBlendMode?.(i, mode.value));
    controls.appendChild(mode);

    const clip = document.createElement('input');
    clip.type = 'checkbox';
    clip.checked = l.clip;
    clip.title = 'Clip to below';
    clip.addEventListener('change', () => callbacks.onClip?.(i, clip.checked));
    controls.appendChild(clip);

    li.appendChild(controls);

    list.appendChild(li);
  });
};

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
