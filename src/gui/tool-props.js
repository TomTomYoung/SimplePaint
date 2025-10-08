import { getActiveEditor } from '../managers/text-editor.js';

const DEFAULT_TOOL_PALETTE = Object.freeze([
  '#000000',
  '#ffffff',
  '#ff6b6b',
  '#ffa94d',
  '#ffd43b',
  '#94d82d',
  '#4dabf7',
  '#845ef7',
]);

const strokeProps = [
  { name: 'brushSize', label: '線幅', type: 'range', min: 1, max: 64, step: 1, default: 4 },
  { name: 'primaryColor', label: '線色', type: 'color', default: '#000000' },
];

const smoothProps = [
  { name: 'smoothAlpha', label: '滑らかさ', type: 'range', min: 0, max: 1, step: 0.05, default: 0.55 },
  { name: 'spacingRatio', label: '間隔', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.4 },
];

const fillProps = [
  { name: 'secondaryColor', label: '塗色', type: 'color', default: '#ffffff' },
  { name: 'fillOn', label: '塗り', type: 'checkbox', default: true },
];

const aaProp = [{ name: 'antialias', label: 'AA', type: 'checkbox', default: false }];

const textProps = [
  {
    name: 'fontFamily',
    label: 'フォント',
    type: 'select',
    options: [
      { value: 'system-ui, sans-serif', label: 'System' },
      { value: '"Noto Sans JP", sans-serif', label: 'Noto Sans JP' },
      { value: 'serif', label: 'Serif' },
      { value: 'monospace', label: 'Monospace' },
    ],
    default: 'system-ui, sans-serif',
  },
  { name: 'fontSize', label: 'サイズ', type: 'number', min: 8, max: 200, step: 1, default: 24 },
];

const nurbsProp = [{ name: 'nurbsWeight', label: '重み', type: 'number', step: 0.1, default: 1 }];

export const toolPropDefs = {
  pencil: [...strokeProps],
  'pencil-click': [...strokeProps],
  brush: [...strokeProps, ...smoothProps],
  smooth: [...strokeProps],
  'texture-brush': [...strokeProps, { name: 'spacingRatio', label: '間隔', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.4 }],
    watercolor: [
      ...strokeProps,
      { name: 'diffusion', label: '拡散D', type: 'range', min: 0.05, max: 0.2, step: 0.01, default: 0.1 },
      { name: 'evaporation', label: '蒸発E', type: 'range', min: 0.01, max: 0.05, step: 0.01, default: 0.02 },
    ],
    'tess-stroke': [...strokeProps],
    minimal: [
      { name: 'brushSize', label: '線幅', type: 'range', min: 1, max: 6, step: 1, default: 4 },
      { name: 'primaryColor', label: '線色', type: 'color', default: '#000000' },
    ],
    calligraphy: [
      ...strokeProps,
      { name: 'penAngle', label: '角度', type: 'range', min: 0, max: 180, step: 1, default: 45 },
      { name: 'kappa', label: '縦横比', type: 'range', min: 1.5, max: 3, step: 0.1, default: 2 },
    ],
    bristle: [
      { name: 'brushSize', label: '線幅', type: 'range', min: 1, max: 64, step: 1, default: 8 },
      { name: 'count', label: '本数', type: 'range', min: 4, max: 12, step: 1, default: 8 },
    ],
    scatter: [...strokeProps],
    smudge: [
      { name: 'radius', label: 'サイズ', type: 'range', min: 1, max: 64, step: 1, default: 16 },
      { name: 'strength', label: '強さ', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
      {
        name: 'dirMode',
        label: '方向',
        type: 'select',
        options: [
          { value: 'tangent', label: '接線' },
          { value: 'angle', label: '角度指定' },
        ],
        default: 'tangent',
      },
      { name: 'angle', label: '角度', type: 'range', min: -180, max: 180, step: 1, default: 0 },
      { name: 'spacingRatio', label: '間隔', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.5 },
    ],
    'aa-line-brush': [
      { name: 'opacity', label: '不透明度', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.8 },
    ],
    'pixel-brush': [
      { name: 'pixelSize', label: 'ピクセルサイズ', type: 'range', min: 1, max: 32, step: 1, default: 1 },
    ],
    'blur-brush': [
      { name: 'sigma', label: 'ぼかしσ', type: 'range', min: 0.5, max: 10, step: 0.5, default: 3 },
      { name: 'iterations', label: '回数', type: 'number', min: 1, max: 5, step: 1, default: 1 },
      { name: 'spacingRatio', label: '間隔', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.6 },
    ],
    'edge-aware-paint': [
      { name: 'primaryColor', label: '線色', type: 'color', default: '#000000' },
      { name: 'tau', label: '勾配しきい値', type: 'range', min: 1, max: 100, step: 1, default: 30 },
      { name: 'radius', label: '半径', type: 'range', min: 1, max: 64, step: 1, default: 16 },
      { name: 'boundaryPad', label: '境界緩衝', type: 'range', min: 0, max: 3, step: 1, default: 1 },
      { name: 'strength', label: '強さ', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
      { name: 'spacingRatio', label: '間隔', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.5 },
    ],
    'noise-displaced': [
      ...strokeProps,
      { name: 'ndAmplitude', label: '変位振幅', type: 'range', min: 0, max: 6, step: 0.1, default: 2 },
      { name: 'ndFrequency', label: '変位周波数', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.25 },
      { name: 'ndSeed', label: 'シード', type: 'number', step: 1, default: 0 },
    ],
    eraser: [{ name: 'brushSize', label: 'サイズ', type: 'range', min: 1, max: 64, step: 1, default: 4 }],
    'eraser-click': [{ name: 'brushSize', label: 'サイズ', type: 'range', min: 1, max: 64, step: 1, default: 4 }],
    bucket: [{ name: 'primaryColor', label: '色', type: 'color', default: '#000000' }],
  line: [...strokeProps, ...aaProp],
  rect: [...strokeProps, ...fillProps, ...aaProp],
  ellipse: [...strokeProps, ...fillProps, ...aaProp],
  'ellipse-2': [...strokeProps, ...fillProps, ...aaProp],
  quad: [...strokeProps],
  cubic: [...strokeProps],
  arc: [...strokeProps],
  sector: [...strokeProps, ...fillProps],
  catmull: [...strokeProps],
  bspline: [...strokeProps],
  nurbs: [...strokeProps, ...nurbsProp],
  freehand: [...strokeProps, ...smoothProps],
  'freehand-click': [...strokeProps, ...smoothProps],
  text: [...strokeProps, ...textProps],
  'select-rect': [],
  eyedropper: [],
};

const ensurePalette = (value) => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_TOOL_PALETTE];
  }
  const normalized = value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object' && typeof entry.color === 'string') {
        return entry.color.trim();
      }
      return '';
    })
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? normalized : [...DEFAULT_TOOL_PALETTE];
};

const parsePaletteInput = (value) => {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error('JSONの解析に失敗しました');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('配列形式のJSONを入力してください');
  }
  const normalized = parsed
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object' && typeof entry.color === 'string') {
        return entry.color.trim();
      }
      return '';
    })
    .filter((entry) => entry.length > 0);
  if (normalized.length === 0) {
    throw new Error('1色以上の色を指定してください');
  }
  return normalized;
};

const appendPaletteSection = (container, store, id, state) => {
  const palette = ensurePalette(state?.palette);
  const paletteSection = document.createElement('div');
  paletteSection.className = 'prop-item prop-palette-section';

  const label = document.createElement('label');
  label.textContent = 'パレット';
  label.style.display = 'block';
  paletteSection.appendChild(label);

  const hint = document.createElement('div');
  hint.className = 'palette-hint';
  hint.textContent = '左クリック: 色を使用 / 右クリック: 現在色で更新';
  paletteSection.appendChild(hint);

  const swatchGrid = document.createElement('div');
  swatchGrid.className = 'palette-swatches';
  palette.forEach((color, index) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'palette-swatch';
    swatch.style.backgroundColor = color;
    swatch.dataset.index = String(index);
    swatch.dataset.color = color;
    swatch.title = `${color}\n左クリック: 色を使用 / 右クリック: 現在色で更新`;
    swatch.addEventListener('click', (evt) => {
      evt.preventDefault();
      const swatchColor = swatch.dataset.color;
      if (typeof swatchColor === 'string') {
        store.setToolState(id, { primaryColor: swatchColor });
      }
    });
    swatch.addEventListener('contextmenu', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const currentState = store.getToolState(id);
      const currentPalette = ensurePalette(currentState.palette);
      const primaryColor =
        typeof currentState.primaryColor === 'string' && currentState.primaryColor.trim()
          ? currentState.primaryColor.trim()
          : currentPalette[index] ?? palette[0] ?? '#000000';
      const nextPalette = currentPalette.slice();
      nextPalette[index] = primaryColor;
      store.setToolState(id, { palette: nextPalette });
    });
    swatchGrid.appendChild(swatch);
  });
  paletteSection.appendChild(swatchGrid);

  const textarea = document.createElement('textarea');
  textarea.className = 'palette-json';
  textarea.value = JSON.stringify(palette, null, 2);
  textarea.rows = Math.min(8, Math.max(2, palette.length));
  textarea.setAttribute('aria-label', 'パレットJSON');
  textarea.spellcheck = false;
  textarea.addEventListener('input', () => {
    textarea.classList.remove('error');
    textarea.title = '';
  });
  paletteSection.appendChild(textarea);

  const actionRow = document.createElement('div');
  actionRow.className = 'palette-actions';

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.textContent = 'JSON適用';
  applyBtn.addEventListener('click', () => {
    try {
      const normalized = parsePaletteInput(textarea.value);
      store.setToolState(id, { palette: normalized });
      textarea.value = JSON.stringify(normalized, null, 2);
      textarea.classList.remove('error');
      textarea.title = '';
    } catch (error) {
      textarea.classList.add('error');
      textarea.title = error?.message ?? 'JSONの解析に失敗しました';
    }
  });
  actionRow.appendChild(applyBtn);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.textContent = 'JSONコピー';
  copyBtn.addEventListener('click', async () => {
    const original = copyBtn.textContent;
    const clipboard = navigator.clipboard;
    const canWrite = clipboard && typeof clipboard.writeText === 'function';
    if (!canWrite) {
      copyBtn.textContent = 'コピー不可';
      setTimeout(() => {
        copyBtn.textContent = original;
      }, 1200);
      return;
    }
    try {
      await clipboard.writeText(textarea.value);
      copyBtn.textContent = 'コピー完了';
    } catch (error) {
      copyBtn.textContent = 'コピー失敗';
    }
    setTimeout(() => {
      copyBtn.textContent = original;
    }, 1200);
  });
  actionRow.appendChild(copyBtn);

  paletteSection.appendChild(actionRow);

  container.appendChild(paletteSection);
};

export function initToolPropsPanel(store, engine) {
  const panel = document.getElementById('leftPanel');
  if (!panel) return;
  const body = panel.querySelector('.panel-body');
  if (!body) return;

  const render = (id) => {
    const defs = toolPropDefs[id] || [];
    const state = store.getToolState(id);
    body.innerHTML = '';

    if (defs.length === 0) {
      const note = document.createElement('div');
      note.className = 'prop-empty-note';
      note.textContent = 'このツールに固有の設定はありません（パレットのみ）';
      body.appendChild(note);
    }

    defs.forEach((d) => {
      const wrap = document.createElement('div');
      wrap.className = 'prop-item';
      const label = document.createElement('label');
      label.textContent = d.label;
      label.style.display = 'block';
      let input;
      if (d.type === 'select') {
        input = document.createElement('select');
        d.options.forEach((o) => {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          input.appendChild(opt);
        });
      } else {
        input = document.createElement('input');
        input.type = d.type;
        if (d.min !== undefined) input.min = d.min;
        if (d.max !== undefined) input.max = d.max;
        if (d.step !== undefined) input.step = d.step;
      }
      const val = state[d.name] ?? d.default;
      if (d.type === 'checkbox') input.checked = !!val; else input.value = val;
      const evt = d.type === 'checkbox' ? 'change' : 'input';
      input.addEventListener(evt, () => {
        const v = d.type === 'checkbox'
          ? input.checked
          : (d.type === 'number' ? parseFloat(input.value) : input.value);
        store.setToolState(id, { [d.name]: v });
        if (d.name === 'antialias') engine?.requestRepaint?.();
        if (id === 'text') {
          const ed = getActiveEditor();
          if (ed) {
            if (d.name === 'fontFamily') ed.style.fontFamily = v;
            if (d.name === 'fontSize') {
              ed.style.fontSize = v + 'px';
              ed.style.lineHeight = Math.round(v * 1.4) + 'px';
            }
            if (d.name === 'primaryColor') ed.style.color = v;
          }
        }
      });
      wrap.appendChild(label);
      wrap.appendChild(input);
      body.appendChild(wrap);
    });

    appendPaletteSection(body, store, id, state);

    panel.style.display = 'flex';
    panel.classList.remove('no-tool-props');
  };

  render(store.getState().toolId);
  store.subscribe((s, old) => {
    if (s.toolId !== old.toolId) {
      render(s.toolId);
    } else {
      const tid = s.toolId;
      const ns = s.tools?.[tid];
      const os = old.tools?.[tid];
      if (JSON.stringify(ns) !== JSON.stringify(os)) render(tid);
    }
  });
}

// expose definitions for other scripts if needed
window.initToolPropsPanel = initToolPropsPanel;
