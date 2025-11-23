// toolbar.js - ツールバー管理モジュール

import {
  getPrimaryShortcutTool,
  getShiftShortcutTool,
} from './tool-shortcuts.js';
import { readString, writeString } from '../utils/safe-storage.js';

export { describeShortcutsForTool } from './tool-shortcuts.js';

let toolCallbacks = {};
let currentTool = null;
let selectionScope = 'layer';

const LAST_TOOL_STORAGE_KEY = 'ui:lastTool';

const TOOL_SHORTCUT_DESCRIPTIONS = buildToolShortcutDescriptions(
  PRIMARY_TOOL_SHORTCUTS,
  SHIFT_TOOL_SHORTCUTS,
);

function buildToolShortcutDescriptions(primary, shift) {
  const descriptionMap = new Map();
  const register = (toolId, text) => {
    if (!toolId || !text) return;
    if (!descriptionMap.has(toolId)) {
      descriptionMap.set(toolId, []);
    }
    descriptionMap.get(toolId).push(text);
  };

  Object.entries(primary).forEach(([code, toolId]) => {
    register(toolId, codeToDisplayLabel(code));
  });

  Object.entries(shift).forEach(([code, toolId]) => {
    register(toolId, `Shift+${codeToDisplayLabel(code)}`);
  });

  return descriptionMap;
}

function codeToDisplayLabel(code) {
  if (code.startsWith('Key')) {
    return code.slice(3);
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  switch (code) {
    case 'Minus':
      return '-';
    case 'Equal':
      return '=';
    default:
      return code;
  }
}

export function initToolbar() {
  // ツールボタンの初期化
  document.querySelectorAll('.tool').forEach(b => {
    b.addEventListener('click', () => {
      const toolId = b.dataset.tool;
      selectTool(toolId);
    });
  });

  // システムボタンの初期化
  initSystemButtons();

  // ドロップダウンメニュー
  initToolDropdowns();

  // ショートカットキーの設定
  initKeyboardShortcuts();

  restoreLastSelectedTool();
}

function restoreLastSelectedTool() {
  const stored = readString(LAST_TOOL_STORAGE_KEY);
  if (stored && document.querySelector(`.tool[data-tool="${stored}"]`)) {
    selectTool(stored);
    return;
  }

  if (currentTool) return;

  const first = document.querySelector('.tool[data-tool]');
  if (first?.dataset.tool) {
    selectTool(first.dataset.tool);
  }
}

function initToolDropdowns() {
  const dropdowns = Array.from(document.querySelectorAll('.tool-dropdown'));
  if (!dropdowns.length) return;

  const closeOthers = current => {
    dropdowns.forEach(dd => {
      if (dd !== current) {
        dd.open = false;
      }
    });
  };

  const alignPanel = dropdown => {
    const panel = dropdown.querySelector('.tool-dropdown-panel');
    const summary = dropdown.querySelector('summary');
    if (!panel || !summary) return;
    panel.removeAttribute('data-align');

    const viewportWidth =
      document.documentElement?.clientWidth ||
      (typeof window !== 'undefined' ? window.innerWidth : 0);
    if (!viewportWidth) return;

    // Force layout before measuring width to ensure styles are applied
    const panelWidth = panel.offsetWidth;
    const summaryRect = summary.getBoundingClientRect();
    const margin = 8;

    let alignment = 'left';

    if (panelWidth >= viewportWidth - margin * 2) {
      alignment = 'center';
    } else {
      const overflowRight = summaryRect.left + panelWidth + margin - viewportWidth;
      if (overflowRight > 0) {
        const availableLeft = summaryRect.right - margin;
        alignment = availableLeft >= panelWidth ? 'right' : 'center';
      }
    }

    if (alignment === 'center') {
      panel.dataset.align = 'center';
    } else if (alignment === 'right') {
      panel.dataset.align = 'right';
    }
  };

  const schedule = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb => setTimeout(cb, 16));

  const repositionOpenDropdowns = () => {
    dropdowns.forEach(dd => {
      if (dd.open) alignPanel(dd);
    });
  };

  dropdowns.forEach(dropdown => {
    dropdown.addEventListener('toggle', () => {
      if (dropdown.open) {
        closeOthers(dropdown);
        schedule(() => alignPanel(dropdown));
      } else {
        dropdown.querySelector('.tool-dropdown-panel')?.removeAttribute('data-align');
      }
    });

    dropdown.querySelectorAll('.tool').forEach(button => {
      button.addEventListener('click', () => {
        dropdown.open = false;
        dropdown.querySelector('summary')?.focus();
      });
    });
  });

  document.addEventListener('click', event => {
    if (dropdowns.some(dd => dd.contains(event.target))) {
      return;
    }
    dropdowns.forEach(dd => {
      dd.open = false;
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    dropdowns.forEach(dd => {
      if (!dd.open) return;
      dd.open = false;
      dd.querySelector('summary')?.focus();
    });
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      if (!dropdowns.some(dd => dd.open)) return;
      schedule(repositionOpenDropdowns);
    });
  }
}

function initSystemButtons() {
  // ファイル操作
  document.getElementById('open')?.addEventListener('click', () => {
    document.getElementById('fileInput')?.click();
  });

  document.getElementById('newDoc')?.addEventListener('click', () => {
    toolCallbacks.onNewDocument?.();
  });
  
  document.getElementById('fileInput')?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) toolCallbacks.onOpenFile?.(f);
    e.target.value = '';
  });

  document.getElementById('savePNG')?.addEventListener('click', () => 
    toolCallbacks.onSave?.('png'));
  document.getElementById('saveJPG')?.addEventListener('click', () =>
    toolCallbacks.onSave?.('jpg'));
  document.getElementById('saveWEBP')?.addEventListener('click', () =>
    toolCallbacks.onSave?.('webp'));

  // 編集操作
  document.getElementById('undo')?.addEventListener('click', () => 
    toolCallbacks.onUndo?.());
  document.getElementById('redo')?.addEventListener('click', () =>
    toolCallbacks.onRedo?.());

  // クリップボード操作
  document.getElementById('copyBtn')?.addEventListener('click', () =>
    toolCallbacks.onCopy?.());
  document.getElementById('cutBtn')?.addEventListener('click', () =>
    toolCallbacks.onCut?.());
  document.getElementById('pasteBtn')?.addEventListener('click', () =>
    toolCallbacks.onPaste?.());

  // 選択スコープ
  document.querySelectorAll('.scope-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectionScope = btn.dataset.scope === 'canvas' ? 'canvas' : 'layer';
      document.querySelectorAll('.scope-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.scope === selectionScope));
      toolCallbacks.onSelectionScopeChange?.(selectionScope);
    });
  });

  // 選択処理
  document.getElementById('cropSelection')?.addEventListener('click', () =>
    toolCallbacks.onCropSelection?.(selectionScope));
  document.getElementById('affineSelectionH')?.addEventListener('click', () =>
    toolCallbacks.onAffineSelection?.(selectionScope, 'hflip'));
  document.getElementById('affineSelectionV')?.addEventListener('click', () =>
    toolCallbacks.onAffineSelection?.(selectionScope, 'vflip'));

  // キャンバス操作
  document.getElementById('clearAll')?.addEventListener('click', () =>
    toolCallbacks.onClearAll?.());
  document.getElementById('resizeCanvas')?.addEventListener('click', () =>
    toolCallbacks.onResizeCanvas?.());
  document.getElementById('flipCanvasH')?.addEventListener('click', () =>
    toolCallbacks.onFlipCanvas?.('h'));
  document.getElementById('flipCanvasV')?.addEventListener('click', () =>
    toolCallbacks.onFlipCanvas?.('v'));

  // レイヤー操作
  document.getElementById('addLayerBtn')?.addEventListener('click', () =>
    toolCallbacks.onAddLayer?.());
  document.getElementById('addVectorLayerBtn')?.addEventListener('click', () =>
    toolCallbacks.onAddVectorLayer?.());
  document.getElementById('deleteLayerBtn')?.addEventListener('click', () =>
    toolCallbacks.onDeleteLayer?.());

  // ビュー操作
  document.getElementById('fit')?.addEventListener('click', () =>
    toolCallbacks.onFitToScreen?.());
  document.getElementById('actual')?.addEventListener('click', () =>
    toolCallbacks.onActualSize?.());

  // 復元ボタン
  document.getElementById('restoreBtn')?.addEventListener('click', () =>
    toolCallbacks.onRestore?.());
}

function initKeyboardShortcuts() {
  window.addEventListener('keydown', e => {
    // テキスト編集中はショートカット無効
    if (toolCallbacks.isTextEditing?.()) {
      if (e.code === 'Escape') {
        e.preventDefault();
        toolCallbacks.onCancelText?.();
      }
      return;
    }

    // Shiftキー併用の別ツール
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const shiftTool = getShiftShortcutTool(e.code);
      if (shiftTool) {
        e.preventDefault();
        selectTool(shiftTool);
        return;
      }
    }

    // 通常のツールショートカット
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const primaryTool = getPrimaryShortcutTool(e.code);
      if (primaryTool) {
        e.preventDefault();
        selectTool(primaryTool);
        return;
      }
    }

    // システムショートカット
    if (e.ctrlKey || e.metaKey) {
      switch(e.code) {
        case 'KeyZ':
          e.preventDefault();
          toolCallbacks.onUndo?.();
          break;
        case 'KeyY':
          e.preventDefault();
          toolCallbacks.onRedo?.();
          break;
        case 'KeyC':
          e.preventDefault();
          toolCallbacks.onCopy?.();
          break;
        case 'KeyX':
          e.preventDefault();
          toolCallbacks.onCut?.();
          break;
        case 'KeyV':
          e.preventDefault();
          toolCallbacks.onPaste?.();
          break;
        case 'KeyS':
          e.preventDefault();
          toolCallbacks.onSave?.('png');
          break;
        case 'KeyO':
          e.preventDefault();
          document.getElementById('fileInput')?.click();
          break;
      }
    }

    // その他のキー
    if (e.code === 'Escape') {
      e.preventDefault();
      toolCallbacks.onCancel?.();
    }
    
    if (e.code === 'Enter') {
      e.preventDefault();
      toolCallbacks.onEnter?.();
    }
    
    if (e.code === 'Space') {
      e.preventDefault();
      toolCallbacks.onSpaceDown?.();
    }
  });

  window.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      toolCallbacks.onSpaceUp?.();
    }
  });
}

export function selectTool(toolId) {
  if (currentTool === toolId) return;

  // UIの更新
  document.querySelectorAll('.tool').forEach(b =>
    b.classList.toggle('active', b.dataset.tool === toolId)
  );

  const toolLabel = document.getElementById('activeToolLabel');
  if (toolLabel) {
    const activeButton = document.querySelector(`.tool[data-tool="${toolId}"]`);
    const labelText = activeButton?.textContent?.trim() || toolId || '—';
    toolLabel.textContent = labelText;
    toolLabel.dataset.toolId = toolId ?? '';
  }

  currentTool = toolId;

  if (toolId) {
    writeString(LAST_TOOL_STORAGE_KEY, toolId);
  }

  // コールバック呼び出し
  toolCallbacks.onToolChange?.(toolId);
}

export function setToolCallbacks(callbacks) {
  toolCallbacks = callbacks;
}


export function getCurrentTool() {
  return currentTool;
}

// パラメータコントロールのバインド
export function bindParameterControls(params) {
  if (params.brushSize) {
    document.getElementById('brush')?.addEventListener('input', e => 
      params.onBrushSizeChange?.(+e.target.value));
  }
  
  if (params.smooth) {
    document.getElementById('smooth')?.addEventListener('input', e => 
      params.onSmoothChange?.(+e.target.value));
  }
  
  if (params.spacing) {
    document.getElementById('spacing')?.addEventListener('input', e => 
      params.onSpacingChange?.(+e.target.value));
  }
  
  if (params.color) {
    document.getElementById('color')?.addEventListener('input', e => 
      params.onColorChange?.(e.target.value));
  }
  
  if (params.color2) {
    document.getElementById('color2')?.addEventListener('input', e => 
      params.onColor2Change?.(e.target.value));
  }
  
  if (params.fillOn) {
    document.getElementById('fillOn')?.addEventListener('change', e => 
      params.onFillChange?.(e.target.checked));
  }
  
  if (params.antialias) {
    document.getElementById('antialias')?.addEventListener('change', e => 
      params.onAntialiasChange?.(e.target.checked));
  }
  
  if (params.fontFamily) {
    document.getElementById('fontFamily')?.addEventListener('change', e => 
      params.onFontFamilyChange?.(e.target.value));
  }
  
  if (params.fontSize) {
    document.getElementById('fontSize')?.addEventListener('change', e => 
      params.onFontSizeChange?.(e.target.value));
  }
  
  if (params.nurbsWeight) {
    document.getElementById('nurbsWeight')?.addEventListener('input', e => 
      params.onNurbsWeightChange?.(e.target.value));
  }
}

// ツールバーの表示状態管理
export function showRestoreButton(show = true) {
  const btn = document.getElementById('restoreBtn');
  if (btn) btn.style.display = show ? 'inline-block' : 'none';
}

export function updateAutosaveBadge(text) {
  const badge = document.getElementById('autosaveBadge');
  if (badge) badge.textContent = text;
}