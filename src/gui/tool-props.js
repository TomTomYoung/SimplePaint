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
  {
    name: 'brushSize',
    label: '線幅',
    type: 'range',
    min: 1,
    max: 64,
    step: 1,
    default: 4,
    hint: 'ストロークの太さを調整します（1〜64px）。',
  },
  {
    name: 'primaryColor',
    label: '線色',
    type: 'color',
    default: '#000000',
    hint: '線を描画するときに使用する色を選びます。',
  },
];

const opacityProp = {
  name: 'opacity',
  label: '不透明度',
  type: 'range',
  min: 0.05,
  max: 1,
  step: 0.05,
  default: 1,
  hint: '線の透け具合を設定します（0.05でほぼ透明〜1で完全不透明）。',
};

const smoothProps = [
  {
    name: 'smoothAlpha',
    label: '滑らかさ',
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.55,
    hint: '補間の強さを制御し、値が高いほどブラシ跡が滑らかになります（0〜1）。',
  },
  {
    name: 'spacingRatio',
    label: 'スタンプ間隔',
    type: 'range',
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 0.4,
    hint: 'ブラシスタンプの間隔を倍率で指定します（0.1〜1）。低いほど密になります。',
  },
];

const fillProps = [
  {
    name: 'secondaryColor',
    label: '塗り色',
    type: 'color',
    default: '#ffffff',
    hint: '矩形や楕円の塗りつぶしに使う色を選びます。',
  },
  {
    name: 'fillOn',
    label: '塗りを有効にする',
    type: 'checkbox',
    default: true,
    hint: 'オンにすると図形を塗りつぶし、オフで輪郭のみ描画します。',
  },
];

const aaProp = [
  {
    name: 'antialias',
    label: 'アンチエイリアス',
    type: 'checkbox',
    default: false,
    hint: 'オンでエッジを滑らかに補間し、オフでピクセルをくっきり描画します。',
  },
];

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
    hint: 'テキストツールで使用するフォントファミリを選択します。',
  },
  {
    name: 'fontSize',
    label: 'サイズ',
    type: 'number',
    min: 8,
    max: 200,
    step: 1,
    default: 24,
    hint: 'テキストの文字サイズ（ポイント相当）を 8〜200px で指定します。',
  },
];

const nurbsProp = [
  {
    name: 'nurbsWeight',
    label: '制御点の重み',
    type: 'number',
    step: 0.1,
    default: 1,
    hint: '制御点の影響度を調整します。値が大きいほどその点へカーブが引き寄せられます。',
  },
];

export const toolPropDefs = {
  pencil: [...strokeProps, opacityProp],
  'pencil-click': [...strokeProps, opacityProp],
  brush: [...strokeProps, opacityProp, ...smoothProps],
  smooth: [...strokeProps, ...smoothProps],
  'texture-brush': [
    ...strokeProps,
    {
      name: 'spacingRatio',
      label: 'スタンプ間隔',
      type: 'range',
      min: 0.1,
      max: 1,
      step: 0.05,
      default: 0.4,
      hint: 'テクスチャスタンプの間隔を倍率で調整します（0.1〜1）。低いほど密に押されます。',
    },
  ],
  watercolor: [
    ...strokeProps,
    {
      name: 'diffusion',
      label: '拡散量',
      type: 'range',
      min: 0.05,
      max: 0.2,
      step: 0.01,
      default: 0.1,
      hint: '水彩の滲みの広がりを指定します（0.05〜0.20）。大きいほどぼんやり広がります。',
    },
    {
      name: 'evaporation',
      label: '蒸発速度',
      type: 'range',
      min: 0.01,
      max: 0.05,
      step: 0.01,
      default: 0.02,
      hint: '水分が乾く速さを制御します（0.01〜0.05）。高いほど乾きが速く濃く残ります。',
    },
  ],
  'tess-stroke': [...strokeProps],
  minimal: [
    {
      name: 'brushSize',
      label: '線幅（ミニマル）',
      type: 'range',
      min: 1,
      max: 6,
      step: 1,
      default: 4,
      hint: '極細線ブラシの太さを 1〜6px で調整します。',
    },
    {
      name: 'primaryColor',
      label: '線色',
      type: 'color',
      default: '#000000',
      hint: '描画に使用する色を選びます。',
    },
  ],
  calligraphy: [
    ...strokeProps,
    {
      name: 'penAngle',
      label: 'ペン角度',
      type: 'range',
      min: 0,
      max: 180,
      step: 1,
      default: 45,
      hint: 'ペン先の回転角度を 0〜180° で指定します。傾きを変えると太さの出方が変化します。',
    },
    {
      name: 'kappa',
      label: '長短径比',
      type: 'range',
      min: 1.5,
      max: 3,
      step: 0.1,
      default: 2,
      hint: '筆先の長径と短径の比率を設定します。値が高いほど楕円が細長くなります。',
    },
    {
      name: 'w_min',
      label: '最小幅',
      type: 'range',
      min: 1,
      max: 64,
      step: 1,
      default: 1,
      hint: 'ペン先の短径を 1〜64px で制限します。細さの下限を決め筆致を安定させます。',
    },
  ],
  bristle: [
    {
      name: 'brushSize',
      label: '束の幅',
      type: 'range',
      min: 1,
      max: 64,
      step: 1,
      default: 8,
      hint: 'ブラシ全体の太さを 1〜64px で調整します。',
    },
    {
      name: 'count',
      label: '毛の本数',
      type: 'range',
      min: 4,
      max: 12,
      step: 1,
      default: 8,
      hint: 'スタンプ内の毛束の本数を設定します。多いほど密で滑らかになります。',
    },
  ],
  scatter: [...strokeProps],
  smudge: [
    {
      name: 'radius',
      label: 'ぼかし半径',
      type: 'range',
      min: 1,
      max: 64,
      step: 1,
      default: 16,
      hint: '周囲から色を引き延ばす半径を 1〜64px で指定します。大きいほど広範囲を混ぜます。',
    },
    {
      name: 'strength',
      label: '混ざり強度',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
      hint: 'ドラッグした方向へどれだけ色を引きずるかを 0〜1 で制御します。',
    },
    {
      name: 'dirMode',
      label: '方向モード',
      type: 'select',
      options: [
        { value: 'tangent', label: '接線方向' },
        { value: 'angle', label: '角度指定' },
      ],
      default: 'tangent',
      hint: 'ストローク方向に従うか、角度を固定するかを選びます。',
    },
    {
      name: 'angle',
      label: '固定角度',
      type: 'range',
      min: -180,
      max: 180,
      step: 1,
      default: 0,
      hint: '方向モードが角度指定のときに使用する角度を −180〜180° で設定します。',
    },
    {
      name: 'spacingRatio',
      label: 'サンプル間隔',
      type: 'range',
      min: 0.1,
      max: 1,
      step: 0.05,
      default: 0.5,
      hint: 'ストローク中のサンプリング間隔を倍率で調整します（0.1〜1）。',
    },
  ],
  'aa-line-brush': [
    {
      name: 'opacity',
      label: '不透明度',
      type: 'range',
      min: 0.1,
      max: 1,
      step: 0.05,
      default: 0.8,
      hint: 'アンチエイリアス線の濃さを指定します（0.1〜1）。',
    },
  ],
  'pixel-brush': [
    {
      name: 'pixelSize',
      label: 'ピクセルサイズ',
      type: 'range',
      min: 1,
      max: 32,
      step: 1,
      default: 1,
      hint: '描画されるピクセル単位の大きさを 1〜32px で指定します。',
    },
  ],
  'blur-brush': [
    {
      name: 'sigma',
      label: 'ぼかし強度',
      type: 'range',
      min: 0.5,
      max: 10,
      step: 0.5,
      default: 3,
      hint: 'ガウシアンぼかしのσ値（0.5〜10）です。大きいほどぼけが広がります。',
    },
    {
      name: 'iterations',
      label: '反復回数',
      type: 'number',
      min: 1,
      max: 5,
      step: 1,
      default: 1,
      hint: '処理を重ねる回数です。増やすと滑らかになりますが処理が重くなります。',
    },
    {
      name: 'spacingRatio',
      label: 'スタンプ間隔',
      type: 'range',
      min: 0.1,
      max: 1,
      step: 0.05,
      default: 0.6,
      hint: 'ぼかしスタンプの間隔を調整します（0.1〜1）。',
    },
  ],
  'edge-aware-paint': [
    {
      name: 'primaryColor',
      label: '線色',
      type: 'color',
      default: '#000000',
      hint: '塗りつぶす際のベースカラーを選択します。',
    },
    {
      name: 'tau',
      label: 'エッジ感度',
      type: 'range',
      min: 1,
      max: 100,
      step: 1,
      default: 30,
      hint: 'エッジ検出の閾値を設定します（1〜100）。低いほど細かな輪郭を検知します。',
    },
    {
      name: 'radius',
      label: '探索半径',
      type: 'range',
      min: 1,
      max: 64,
      step: 1,
      default: 16,
      hint: 'エッジを探索する半径を 1〜64px で指定します。',
    },
    {
      name: 'boundaryPad',
      label: '境界余白',
      type: 'range',
      min: 0,
      max: 3,
      step: 1,
      default: 1,
      hint: '境界へどれだけ余白を取るかを 0〜3px で調整します。',
    },
    {
      name: 'strength',
      label: '適用強度',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.6,
      hint: '塗りの影響力を 0〜1 で制御します。高いほど輪郭を強く保護します。',
    },
    {
      name: 'spacingRatio',
      label: 'スタンプ間隔',
      type: 'range',
      min: 0.1,
      max: 1,
      step: 0.05,
      default: 0.5,
      hint: 'ブラシを打つ頻度を倍率で調整します（0.1〜1）。',
    },
  ],
  'noise-displaced': [
    ...strokeProps,
    {
      name: 'ndAmplitude',
      label: '変位振幅',
      type: 'range',
      min: 0,
      max: 6,
      step: 0.1,
      default: 2,
      hint: 'ノイズ変位の強さを 0〜6px で調整します。',
    },
    {
      name: 'ndFrequency',
      label: '変位周波数',
      type: 'range',
      min: 0.02,
      max: 1,
      step: 0.01,
      default: 0.25,
      hint: 'ノイズの細かさを制御します（0.02〜1）。高いほど細かな揺らぎになります。',
    },
    {
      name: 'ndSeed',
      label: 'シード値',
      type: 'number',
      step: 1,
      default: 0,
      hint: 'ノイズパターンを決める乱数シードです。同じ値なら結果が再現されます。',
    },
  ],
  eraser: [
    {
      name: 'brushSize',
      label: '消し幅',
      type: 'range',
      min: 1,
      max: 64,
      step: 1,
      default: 4,
      hint: '消しゴムの太さを 1〜64px で指定します。',
    },
  ],
  'eraser-click': [
    {
      name: 'brushSize',
      label: '消し幅',
      type: 'range',
      min: 1,
      max: 64,
      step: 1,
      default: 4,
      hint: 'クリック単位で削除する円の直径を決めます。',
    },
  ],
  bucket: [
    {
      name: 'primaryColor',
      label: '塗り色',
      type: 'color',
      default: '#000000',
      hint: '塗りつぶしに使用する色を選びます。',
    },
  ],
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
      if (d.type === 'checkbox') {
        input.checked = !!val;
      } else if (val !== undefined && val !== null) {
        input.value = String(val);
      } else if (d.default !== undefined && d.type !== 'checkbox') {
        input.value = String(d.default);
      }
      const evt = d.type === 'checkbox' || d.type === 'select' ? 'change' : 'input';
      input.addEventListener(evt, () => {
        let v;
        if (d.type === 'checkbox') {
          v = input.checked;
        } else if (d.type === 'number' || d.type === 'range') {
          const parsed = parseFloat(input.value);
          v = Number.isFinite(parsed) ? parsed : d.default;
        } else {
          v = input.value;
        }
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
      if (d.hint) {
        const hint = document.createElement('div');
        hint.className = 'prop-hint';
        hint.textContent = d.hint;
        wrap.appendChild(hint);
        if (input instanceof HTMLElement) {
          input.title = d.hint;
        }
      }
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
