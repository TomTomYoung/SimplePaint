// toolbar.js - ツールバー管理モジュール

let toolCallbacks = {};
let currentTool = null;

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
  
  // ショートカットキーの設定
  initKeyboardShortcuts();
}

function initSystemButtons() {
  // ファイル操作
  document.getElementById('open')?.addEventListener('click', () => {
    document.getElementById('fileInput')?.click();
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
  document.getElementById('clear')?.addEventListener('click', () => 
    toolCallbacks.onClear?.());

  // ビュー操作
  document.getElementById('fit')?.addEventListener('click', () => 
    toolCallbacks.onFitToScreen?.());
  document.getElementById('actual')?.addEventListener('click', () => 
    toolCallbacks.onActualSize?.());

  // クリップボード操作
  document.getElementById('copyBtn')?.addEventListener('click', () => 
    toolCallbacks.onCopy?.());
  document.getElementById('cutBtn')?.addEventListener('click', () => 
    toolCallbacks.onCut?.());
  document.getElementById('pasteBtn')?.addEventListener('click', () => 
    toolCallbacks.onPaste?.());

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

    // ツールショートカット
    const shortcuts = {
      'KeyP': 'pencil',
      'KeyB': 'brush',
      'KeyE': 'eraser',
      'KeyT': 'text',
      'KeyM': 'select-rect',
      'KeyI': 'eyedropper',
      'KeyF': 'bucket',
      'KeyL': 'line',
      'KeyR': 'rect',
      'KeyO': 'ellipse',
      'KeyQ': 'quad',
      'KeyC': 'cubic',
      'KeyA': 'arc',
      'KeyS': 'sector',
      'KeyU': 'catmull',
      'KeyN': 'nurbs',
      'KeyH': 'freehand'
    };

    // Shiftキー併用の別ツール
    if (e.shiftKey) {
      const shiftShortcuts = {
        'KeyP': 'pencil-click',
        'KeyE': 'eraser-click',
        'KeyH': 'freehand-click'
      };
      if (shiftShortcuts[e.code]) {
        e.preventDefault();
        selectTool(shiftShortcuts[e.code]);
        return;
      }
    }

    // 通常のツールショートカット
    if (!e.ctrlKey && !e.metaKey && shortcuts[e.code]) {
      e.preventDefault();
      selectTool(shortcuts[e.code]);
      return;
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
  
  currentTool = toolId;
  
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