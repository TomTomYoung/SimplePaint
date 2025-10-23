import {
  applyPanelState,
  getPanelState,
  registerPanelStateListener,
} from './panel-resize.js';
import { readJSON, readString, writeJSON, writeString } from '../utils/safe-storage.js';

const PRESET_STORAGE_KEY = 'ui:layoutPreset';
const CUSTOM_STORAGE_KEY = 'ui:layoutCustomState';

const PRESETS = {
  default: {
    label: '標準',
    state: {
      leftWidth: 200,
      rightWidth: 250,
      leftCollapsed: false,
      rightCollapsed: false,
    },
  },
  brush: {
    label: 'ブラシ重視',
    state: {
      leftWidth: 260,
      rightWidth: 220,
      leftCollapsed: false,
      rightCollapsed: false,
    },
  },
  reference: {
    label: '資料表示',
    state: {
      leftWidth: 200,
      rightWidth: 320,
      leftCollapsed: false,
      rightCollapsed: false,
    },
  },
  focus: {
    label: 'キャンバス集中',
    state: {
      leftWidth: 220,
      rightWidth: 280,
      leftCollapsed: true,
      rightCollapsed: false,
    },
  },
};

const CUSTOM_ID = 'custom';
const WIDTH_TOLERANCE = 2; // px

let selectEl = null;
let isApplyingPreset = false;

const isValidPanelState = value => {
  if (!value || typeof value !== 'object') return false;
  const hasWidths =
    typeof value.leftWidth === 'number' &&
    typeof value.rightWidth === 'number' &&
    Number.isFinite(value.leftWidth) &&
    Number.isFinite(value.rightWidth);
  const hasFlags = typeof value.leftCollapsed === 'boolean' && typeof value.rightCollapsed === 'boolean';
  return hasWidths && hasFlags;
};

const clampWidth = value => Math.min(500, Math.max(150, value));

const normaliseState = state => {
  if (!isValidPanelState(state)) return null;
  return {
    leftWidth: clampWidth(state.leftWidth),
    rightWidth: clampWidth(state.rightWidth),
    leftCollapsed: Boolean(state.leftCollapsed),
    rightCollapsed: Boolean(state.rightCollapsed),
  };
};

const statesEqual = (a, b) => {
  if (!isValidPanelState(a) || !isValidPanelState(b)) return false;
  const widthClose = (x, y) => Math.abs(x - y) <= WIDTH_TOLERANCE;
  return (
    widthClose(a.leftWidth, b.leftWidth) &&
    widthClose(a.rightWidth, b.rightWidth) &&
    a.leftCollapsed === b.leftCollapsed &&
    a.rightCollapsed === b.rightCollapsed
  );
};

const findMatchingPreset = state => {
  for (const [id, preset] of Object.entries(PRESETS)) {
    if (statesEqual(state, preset.state)) {
      return id;
    }
  }
  return null;
};

const setSelectValue = value => {
  if (!selectEl) return;
  if (selectEl.value === value) return;
  const option = Array.from(selectEl.options).find(opt => opt.value === value);
  if (option) {
    selectEl.value = value;
  }
};

const persistPresetSelection = id => {
  writeString(PRESET_STORAGE_KEY, id);
};

const persistCustomState = state => {
  writeJSON(CUSTOM_STORAGE_KEY, state);
};

const loadCustomState = () => {
  const stored = readJSON(CUSTOM_STORAGE_KEY, null);
  return normaliseState(stored);
};

const applyPreset = (id, { persistSelection = true } = {}) => {
  if (!selectEl) return;
  let targetId = id;
  if (!(targetId in PRESETS) && targetId !== CUSTOM_ID) {
    targetId = 'default';
  }

  isApplyingPreset = true;
  if (targetId === CUSTOM_ID) {
    const stored = loadCustomState() ?? getPanelState();
    persistCustomState(stored);
    applyPanelState(stored);
  } else {
    applyPanelState(PRESETS[targetId].state);
  }
  setSelectValue(targetId);
  if (persistSelection) {
    persistPresetSelection(targetId);
  }
  isApplyingPreset = false;
};

export function initWorkspaceLayoutControls() {
  if (typeof document === 'undefined') return;
  selectEl = document.getElementById('layoutPreset');
  if (!selectEl) return;

  const storedSelection = readString(PRESET_STORAGE_KEY, null);
  const currentState = getPanelState();
  let initialSelection = storedSelection;

  if (!(initialSelection in PRESETS) && initialSelection !== CUSTOM_ID) {
    initialSelection = findMatchingPreset(currentState) ?? CUSTOM_ID;
  }

  if (initialSelection === CUSTOM_ID) {
    const customState = loadCustomState();
    if (customState) {
      applyPanelState(customState);
    } else {
      persistCustomState(currentState);
    }
  } else {
    applyPanelState(PRESETS[initialSelection].state);
  }

  setSelectValue(initialSelection);
  persistPresetSelection(initialSelection);

  selectEl.addEventListener('change', () => {
    applyPreset(selectEl.value);
  });

  registerPanelStateListener(state => {
    if (isApplyingPreset) return;
    const matched = findMatchingPreset(state);
    if (matched) {
      setSelectValue(matched);
      persistPresetSelection(matched);
    } else {
      setSelectValue(CUSTOM_ID);
      persistPresetSelection(CUSTOM_ID);
      persistCustomState(state);
    }
  });
}

window.initWorkspaceLayoutControls = initWorkspaceLayoutControls;
