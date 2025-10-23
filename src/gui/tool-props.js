import { getActiveEditor } from '../managers/text-editor.js';
import { toolDefaults } from '../core/store.js';
import { describeShortcutsForTool } from './tool-shortcuts.js';
import { readJSON, writeJSON } from '../utils/safe-storage.js';

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

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const TOOL_PANEL_STATE_KEY = 'ui:toolAccordionState';

const readAccordionState = () => {
  const stored = readJSON(TOOL_PANEL_STATE_KEY, {});
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return {};
  }
  const normalised = {};
  Object.entries(stored).forEach(([key, value]) => {
    if (typeof value === 'boolean') {
      normalised[key] = value;
    }
  });
  return normalised;
};

const writeAccordionState = state => writeJSON(TOOL_PANEL_STATE_KEY, state);

const getPanelContainers = panel => {
  const body = panel?.querySelector('.panel-body');
  if (!body) {
    return null;
  }
  const properties = body.querySelector('#toolPropContainer') || body;
  const palette = body.querySelector('#toolPaletteContainer') || properties;
  const shortcuts = body.querySelector('#toolShortcutContainer') || properties;
  const previewCanvas = body.querySelector('#toolPreviewCanvas');
  const previewReset = body.querySelector('#toolPreviewReset');
  return {
    body,
    properties,
    palette,
    shortcuts,
    previewCanvas: previewCanvas instanceof HTMLCanvasElement ? previewCanvas : null,
    previewReset: previewReset instanceof HTMLButtonElement ? previewReset : null,
  };
};

const computeToolDefaults = id => {
  const defs = Array.isArray(toolPropDefs[id]) ? toolPropDefs[id] : [];
  const defaults = { ...toolDefaults };
  defs.forEach(def => {
    if (def && typeof def.name === 'string' && def.default !== undefined) {
      defaults[def.name] = def.default;
    }
  });
  return defaults;
};

const parseDashPattern = pattern => {
  if (typeof pattern !== 'string') return [];
  return pattern
    .split(/[\s,]+/)
    .map(Number)
    .filter(value => Number.isFinite(value) && value !== 0)
    .map(value => clamp(Math.abs(value), 1, 64));
};

const drawToolPreview = (canvas, state = {}, toolId = '') => {
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);

  const cell = 16;
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const even = ((x / cell) | 0) % 2 === ((y / cell) | 0) % 2;
      ctx.fillStyle = even ? '#f5f5f5' : '#e6e6e6';
      ctx.fillRect(x, y, cell, cell);
    }
  }

  const strokeColor = typeof state.primaryColor === 'string' ? state.primaryColor : '#4a90e2';
  const fillColor = state.fillOn === false
    ? null
    : (typeof state.secondaryColor === 'string' ? state.secondaryColor : '#f7c948');
  const lineWidth = clamp(typeof state.brushSize === 'number' ? state.brushSize : 8, 1, 24);
  const capStyle = typeof state.capStyle === 'string' ? state.capStyle : 'round';
  const opacity = clamp(typeof state.opacity === 'number' ? state.opacity : 1, 0.1, 1);

  if (fillColor) {
    ctx.save();
    ctx.globalAlpha = opacity * 0.75;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    const baseX = width * 0.35;
    const baseY = height * 0.55;
    const baseW = width * 0.45;
    const peakOffset = height * 0.22;
    ctx.moveTo(baseX, baseY + peakOffset);
    ctx.lineTo(baseX + baseW, baseY + peakOffset);
    ctx.lineTo(baseX + baseW - peakOffset, baseY - peakOffset);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.lineCap = capStyle;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = strokeColor;
  const dashSegments = parseDashPattern(state.dashPattern);
  if (dashSegments.length > 0 && typeof ctx.setLineDash === 'function') {
    ctx.setLineDash(dashSegments);
  }
  ctx.beginPath();
  ctx.moveTo(width * 0.1, height * 0.75);
  ctx.quadraticCurveTo(width * 0.45, height * 0.1, width * 0.85, height * 0.65);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.font = '12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.textAlign = 'right';
  ctx.fillText(toolId || '', width - 8, height - 10);
  ctx.restore();
};

let activeToolId = null;
let previewResetRef = null;

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

const strokeStyleExtras = [
  {
    name: 'dashPattern',
    label: '破線パターン',
    type: 'text',
    default: '',
    hint: 'カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。',
  },
  {
    name: 'capStyle',
    label: '線端スタイル',
    type: 'select',
    options: [
      { value: 'butt', label: '直角（butt）' },
      { value: 'round', label: '丸端（round）' },
      { value: 'square', label: '突き出し（square）' },
    ],
    default: 'butt',
    hint: '線の端の形を選びます。直角・丸端・突き出しから選択できます。',
  },
];

const cornerRadiusProp = {
  name: 'cornerRadius',
  label: '角丸半径',
  type: 'number',
  min: 0,
  max: 256,
  step: 1,
  default: 0,
  hint: '矩形の角を丸める半径を指定します。0で直角、数値が大きいほど丸みが増します。',
};

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
  'meta-brush': [
    ...strokeProps,
    {
      name: 'alpha',
      label: '透明度',
      type: 'range',
      min: 0.1,
      max: 1,
      step: 0.05,
      default: 1,
      hint: 'スタンプ全体の不透明度を設定します（0.1〜1）。',
    },
    {
      name: 'spacingRatio',
      label: 'スタンプ間隔',
      type: 'range',
      min: 0.1,
      max: 1,
      step: 0.05,
      default: 0.5,
      hint: 'スタンプを打つ間隔をブラシ幅に対する倍率で指定します。',
    },
    {
      name: 'usePressure',
      label: '筆圧を使用する',
      type: 'checkbox',
      default: true,
      hint: 'オンにするとペンの筆圧を検出してモード切替に利用します。',
    },
    {
      name: 'vLo',
      label: '低速しきい値 (px/s)',
      type: 'number',
      min: 10,
      max: 2000,
      step: 10,
      default: 80,
      hint: 'この速度未満を「低速」とみなします。滑らかな描き出しに影響します。',
    },
    {
      name: 'vHi',
      label: '高速しきい値 (px/s)',
      type: 'number',
      min: 100,
      max: 4000,
      step: 10,
      default: 450,
      hint: 'この速度を超えると高速モードへ移行します。',
    },
    {
      name: 'pLo',
      label: '低筆圧しきい値',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.25,
      hint: '筆圧がこの値未満のときに軽いタッチとして扱います。',
    },
    {
      name: 'pHi',
      label: '高筆圧しきい値',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.7,
      hint: '筆圧がこの値を超えると強いタッチとして扱います。',
    },
    {
      name: 'kHi',
      label: '曲率しきい値',
      type: 'number',
      min: 0.001,
      max: 0.1,
      step: 0.001,
      default: 0.02,
      hint: 'カーブの急さを判断する指標です。小さいほど曲線モードへ早く移行します。',
    },
    {
      name: 'hystRatio',
      label: 'ヒステリシス比率',
      type: 'range',
      min: 0,
      max: 0.5,
      step: 0.01,
      default: 0.15,
      hint: 'モード切替を安定させるための緩衝幅です。',
    },
    {
      name: 'minDwellMs',
      label: '最小滞留時間 (ms)',
      type: 'number',
      min: 0,
      max: 1000,
      step: 10,
      default: 90,
      hint: '一度切り替えたモードを最低限維持する時間です。',
    },
    {
      name: 'initMode',
      label: '初期モード',
      type: 'select',
      options: [
        { value: 'callig', label: 'カリグラフィ' },
        { value: 'ink', label: 'インク' },
        { value: 'ribbon', label: 'リボン' },
      ],
      default: 'callig',
      hint: '描き始めに使用するサブブラシを選択します。',
    },
    {
      name: 'emaV',
      label: '速度平滑化',
      type: 'range',
      min: 0.05,
      max: 1,
      step: 0.05,
      default: 0.35,
      hint: '速度の変化をどれだけ素早く追従するかを制御します。',
    },
    {
      name: 'emaP',
      label: '筆圧平滑化',
      type: 'range',
      min: 0.05,
      max: 1,
      step: 0.05,
      default: 0.3,
      hint: '筆圧のノイズをどれだけ平均化するかを決めます。',
    },
    {
      name: 'emaK',
      label: '曲率平滑化',
      type: 'range',
      min: 0.05,
      max: 1,
      step: 0.05,
      default: 0.4,
      hint: '曲率の変化を滑らかにする係数です。',
    },
    {
      name: 'penAngle',
      label: 'ペン角度',
      type: 'range',
      min: 0,
      max: 180,
      step: 1,
      default: 45,
      hint: 'カリグラフィモード時のペン先角度を指定します。',
    },
    {
      name: 'calligKappa',
      label: 'カリグラフィ長短比',
      type: 'range',
      min: 1,
      max: 4,
      step: 0.1,
      default: 2,
      hint: 'カリグラフィ楕円の長径と短径の比率です。',
    },
    {
      name: 'ribbonHardness',
      label: 'リボン硬さ',
      type: 'range',
      min: 0.2,
      max: 2,
      step: 0.1,
      default: 1,
      hint: 'リボンモード時のエッジの鋭さを調整します。',
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
  'stroke-boil': [
    ...strokeProps,
    {
      name: 'alpha',
      label: '透明度',
      type: 'range',
      min: 0.1,
      max: 1,
      step: 0.05,
      default: 1,
      hint: 'ストローク全体の不透明度を設定します。',
    },
    {
      name: 'amplitude',
      label: '揺らぎ振幅',
      type: 'range',
      min: 0.1,
      max: 3,
      step: 0.1,
      default: 1,
      hint: '線を揺らす振幅（px）です。大きいほど変形が大きくなります。',
    },
    {
      name: 'widthJitter',
      label: '幅ゆらぎ',
      type: 'range',
      min: 0,
      max: 0.35,
      step: 0.01,
      default: 0.15,
      hint: '線幅をどれだけランダムに変化させるかを割合で指定します。',
    },
    {
      name: 'boilStep',
      label: '更新間隔',
      type: 'select',
      options: [
        { value: 1, label: '毎フレーム' },
        { value: 2, label: '隔フレーム' },
      ],
      default: 1,
      coerce: 'number',
      hint: '揺らぎを更新する頻度です。隔フレームにすると動きが緩やかになります。',
    },
    {
      name: 'spacingRatio',
      label: 'スタンプ間隔',
      type: 'range',
      min: 0.1,
      max: 1,
      step: 0.05,
      default: 0.5,
      hint: '入力点列をどれだけ間引くかをブラシ幅に対する倍率で指定します。',
    },
    {
      name: 'minSampleDist',
      label: '最小サンプル距離',
      type: 'range',
      min: 0.1,
      max: 5,
      step: 0.1,
      default: 0.5,
      hint: '新しい点を追加する最小距離（px）です。',
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
  line: [...strokeProps, ...strokeStyleExtras, ...aaProp],
  rect: [...strokeProps, ...strokeStyleExtras, cornerRadiusProp, ...fillProps, ...aaProp],
  ellipse: [...strokeProps, ...strokeStyleExtras, ...fillProps, ...aaProp],
  'ellipse-2': [...strokeProps, ...strokeStyleExtras, ...fillProps, ...aaProp],
  quad: [...strokeProps, ...strokeStyleExtras],
  cubic: [...strokeProps, ...strokeStyleExtras],
  arc: [...strokeProps, ...strokeStyleExtras],
  sector: [...strokeProps, ...strokeStyleExtras, ...fillProps],
  catmull: [...strokeProps, ...strokeStyleExtras],
  bspline: [...strokeProps, ...strokeStyleExtras],
  nurbs: [...strokeProps, ...strokeStyleExtras, ...nurbsProp],
  freehand: [...strokeProps, ...smoothProps],
  'freehand-click': [...strokeProps, ...smoothProps],
  text: [...strokeProps, ...textProps],
  'path-bool': [
    {
      name: 'primaryColor',
      label: '塗り色',
      type: 'color',
      default: '#000000',
      hint: '合成結果を塗りつぶす色を選びます。',
    },
    {
      name: 'alpha',
      label: '塗り不透明度',
      type: 'range',
      min: 0.1,
      max: 1,
      step: 0.05,
      default: 1,
      hint: '合成結果を描画する際の不透明度です。',
    },
    {
      name: 'op',
      label: '新規パス演算子',
      type: 'select',
      options: [
        { value: 'union', label: '加算（Union）' },
        { value: 'subtract', label: '差分（Subtract）' },
        { value: 'intersect', label: '積集合（Intersect）' },
      ],
      default: 'union',
      hint: '追加するパスに既定で適用するブーリアン演算を選びます。',
    },
    {
      name: 'epsilon',
      label: '頂点結合許容',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.0001,
      default: 0.000001,
      hint: '頂点を自動的に結合する距離しきい値です。微小な隙間を吸収します。',
    },
    {
      name: 'fillRule',
      label: '塗り判定ルール',
      type: 'select',
      options: [
        { value: 'nonzero', label: '非ゼロ（non-zero）' },
        { value: 'evenodd', label: '偶奇（even-odd）' },
      ],
      default: 'nonzero',
      hint: '塗り領域の決定方法を選択します。',
    },
    {
      name: 'previewFill',
      label: 'プレビュー塗り表示',
      type: 'checkbox',
      default: true,
      hint: 'オンにすると編集中に合成結果の簡易プレビューを表示します。',
    },
    {
      name: 'minSampleDist',
      label: 'サンプル間隔',
      type: 'range',
      min: 0.1,
      max: 5,
      step: 0.1,
      default: 0.5,
      hint: '入力点を追加する最小距離（px）です。',
    },
  ],
  'vector-tool': [
    ...strokeProps,
    {
      name: 'snapToGrid',
      label: 'グリッドにスナップ',
      type: 'checkbox',
      default: false,
      hint: 'オンで最寄りのグリッド交点へ自動吸着します。',
    },
    {
      name: 'gridSize',
      label: 'グリッド間隔 (px)',
      type: 'number',
      min: 1,
      max: 256,
      step: 1,
      default: 8,
      hint: 'グリッドスナップ有効時の格子間隔を設定します。',
    },
    {
      name: 'snapToExisting',
      label: '既存アンカーにスナップ',
      type: 'checkbox',
      default: true,
      hint: 'オンにすると既存パスのアンカーへ吸着して整列できます。',
    },
    {
      name: 'snapRadius',
      label: 'スナップ半径 (px)',
      type: 'range',
      min: 1,
      max: 48,
      step: 1,
      default: 6,
      hint: 'アンカーやセグメントを捕捉する半径を調整します。',
    },
    {
      name: 'simplifyTolerance',
      label: '簡略化しきい値',
      type: 'range',
      min: 0,
      max: 5,
      step: 0.05,
      default: 0.75,
      hint: 'ドラフト確定時に折れ線をどの程度間引くかを制御します。',
    },
    {
      name: 'rasterizeMode',
      label: 'ラスタライズモード',
      type: 'select',
      options: [
        { value: 'manual', label: '手動' },
        { value: 'onExport', label: '書き出し時' },
        { value: 'auto', label: '自動' },
      ],
      default: 'manual',
      hint: 'パスをビットマップへ反映するタイミングを選びます。',
    },
    {
      name: 'showAnchors',
      label: 'アンカーを表示',
      type: 'checkbox',
      default: true,
      hint: 'オフにすると編集中のアンカー表示を隠します。',
    },
  ],
  'select-rect': [],
  eyedropper: [],
};

const editableCurveActions = Object.freeze([
  {
    name: 'copyCurvesToVectorLayer',
    label: 'ベクターレイヤーにコピー',
    type: 'button',
    hint: '制御点のコピーをベクターレイヤーに渡し、ツール内の座標は保持します。',
    handle({ tool, engine }) {
      if (tool && typeof tool.transferCurvesToVectorLayer === 'function') {
        tool.transferCurvesToVectorLayer({ engine, clearToolCurves: false });
      }
    },
  },
  {
    name: 'moveCurvesToVectorLayer',
    label: 'ベクターレイヤーに移動',
    type: 'button',
    hint: '制御点をベクターレイヤーへ渡し、ツール内の座標を破棄します。',
    handle({ tool, engine }) {
      if (tool && typeof tool.transferCurvesToVectorLayer === 'function') {
        tool.transferCurvesToVectorLayer({ engine, clearToolCurves: true });
      }
    },
  },
  {
    name: 'finalizeCurves',
    label: '確定',
    type: 'button',
    hint: '保持している曲線を描画して確定し、制御点をクリアします。',
    handle({ tool, ctx, engine }) {
      if (tool && typeof tool.finalizePending === 'function') {
        tool.finalizePending(ctx, engine);
      }
    },
  },
  {
    name: 'burnCurves',
    label: '焼き付け',
    type: 'button',
    hint: '制御点を保持したまま現在の曲線をレイヤーに描画します。',
    handle({ tool, ctx, engine }) {
      if (tool && typeof tool.burnPending === 'function') {
        tool.burnPending(ctx, engine);
      }
    },
  },
]);

const editableCurveSourceMap = Object.freeze({
  'quad-edit': 'quad',
  'cubic-edit': 'cubic',
  'catmull-edit': 'catmull',
  'bspline-edit': 'bspline',
  'nurbs-edit': 'nurbs',
});

Object.entries(editableCurveSourceMap).forEach(([editId, baseId]) => {
  const baseProps = toolPropDefs[baseId] || [];
  toolPropDefs[editId] = [...baseProps, ...editableCurveActions];
});

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

const POINTER_EVENT_DESCRIPTIONS = Object.freeze({
  pointerdown: 'pointerdown（押した瞬間）',
  pointermove: 'pointermove（移動・ドラッグ中）',
  pointerup: 'pointerup（離した瞬間）',
});

const formatPointerEvent = (eventName) =>
  POINTER_EVENT_DESCRIPTIONS[eventName] ?? eventName;

const collectPointerEventNames = (tool) => {
  if (!tool || typeof tool !== 'object') {
    return [];
  }
  const events = [];
  if (typeof tool.onPointerDown === 'function') events.push('pointerdown');
  if (typeof tool.onPointerMove === 'function') events.push('pointermove');
  if (typeof tool.onPointerUp === 'function') events.push('pointerup');
  return events.map(formatPointerEvent);
};

const collectKeyUsageDescriptions = (tool, toolId) => {
  const descriptions = [];
  const shortcuts = describeShortcutsForTool(toolId);
  if (shortcuts.length > 0) {
    descriptions.push(`ツール切替: ${shortcuts.join(' / ')}`);
  }
  if (tool && typeof tool.onEnter === 'function') {
    descriptions.push('Enterキー: 操作を確定（onEnter）');
  }
  if (tool && typeof tool.cancel === 'function') {
    descriptions.push('Escapeキー: 操作をキャンセル（cancel）');
  }
  return descriptions;
};

const createToolMetaRow = (label, value) => {
  const row = document.createElement('div');
  row.className = 'tool-meta-row';
  const labelSpan = document.createElement('span');
  labelSpan.className = 'tool-meta-label';
  labelSpan.textContent = label;
  const valueSpan = document.createElement('span');
  valueSpan.className = 'tool-meta-value';
  valueSpan.textContent = value;
  row.appendChild(labelSpan);
  row.appendChild(valueSpan);
  return row;
};

const createToolMetaSection = (tool, toolId) => {
  const pointerEvents = collectPointerEventNames(tool);
  const keyDescriptions = collectKeyUsageDescriptions(tool, toolId);
  if (pointerEvents.length === 0 && keyDescriptions.length === 0) {
    return null;
  }
  const section = document.createElement('div');
  section.className = 'tool-meta';
  const title = document.createElement('div');
  title.className = 'tool-meta-title';
  title.textContent = '操作ガイド';
  section.appendChild(title);
  if (pointerEvents.length > 0) {
    section.appendChild(createToolMetaRow('受け付けイベント', pointerEvents.join(' / ')));
  }
  if (keyDescriptions.length > 0) {
    section.appendChild(createToolMetaRow('使用するキー', keyDescriptions.join(' / ')));
  }
  return section;
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
  const containers = getPanelContainers(panel);
  if (!containers) return;

  const accordionSections = Array.from(
    panel.querySelectorAll('.accordion-section[data-section]'),
  );
  if (accordionSections.length > 0) {
    let accordionState = readAccordionState();
    accordionSections.forEach(section => {
      const key = section.dataset.section;
      if (!key) return;
      if (Object.prototype.hasOwnProperty.call(accordionState, key)) {
        section.open = !!accordionState[key];
      }
    });

    const persistAccordionState = () => {
      const snapshot = {};
      accordionSections.forEach(section => {
        const key = section.dataset.section;
        if (!key) return;
        snapshot[key] = section.open;
      });
      accordionState = snapshot;
      writeAccordionState(accordionState);
    };

    accordionSections.forEach(section => {
      section.addEventListener('toggle', persistAccordionState);
    });
  }

  previewResetRef = containers.previewReset;
  if (previewResetRef && !previewResetRef.dataset.bound) {
    previewResetRef.addEventListener('click', () => {
      if (!activeToolId) return;
      store.resetToolState(activeToolId, {
        defaults: computeToolDefaults(activeToolId),
      });
    });
    previewResetRef.dataset.bound = 'true';
  }

  const render = (id) => {
    activeToolId = id;
    const defs = toolPropDefs[id] || [];
    const defaults = computeToolDefaults(id);
    const state = store.getToolState(id, defaults);
    const fieldRefs = new Map();

    const { properties, palette, shortcuts, previewCanvas } = containers;
    [properties, palette, shortcuts].forEach(section => {
      if (section) section.innerHTML = '';
    });

    const tool = engine && engine.tools instanceof Map ? engine.tools.get(id) : null;
    const metaSection = createToolMetaSection(tool, id);
    if (shortcuts) {
      if (metaSection) {
        shortcuts.appendChild(metaSection);
      } else {
        const empty = document.createElement('div');
        empty.className = 'prop-empty';
        empty.textContent = 'ショートカットは定義されていません。';
        shortcuts.appendChild(empty);
      }
    } else if (metaSection) {
      properties.appendChild(metaSection);
    }

    if (defs.length === 0) {
      const note = document.createElement('div');
      note.className = 'prop-empty-note';
      note.textContent = 'このツールに固有の設定はありません（パレットのみ）';
      properties.appendChild(note);
    }

    defs.forEach((d) => {
      const wrap = document.createElement('div');
      wrap.className = 'prop-item';
      const label = document.createElement('label');
      label.textContent = d.label;
      label.style.display = 'block';
      let input;
      if (d.type === 'button') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = d.label;
        btn.addEventListener('click', () => {
          const ctx = engine?.ctx;
          if (!ctx) return;
          if (typeof d.handle === 'function') {
            try {
              d.handle({ tool, store, engine, ctx, id });
            } catch (error) {
              console.error('Failed to run tool action', error);
            }
          }
        });
          wrap.appendChild(btn);
          if (d.hint) {
            const hint = document.createElement('div');
            hint.className = 'prop-hint';
            hint.textContent = d.hint;
            wrap.appendChild(hint);
            btn.title = d.hint;
          }
          properties.appendChild(wrap);
          return;
        }
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
      if (input instanceof HTMLElement) {
        input.name = d.name;
        fieldRefs.set(d.name, input);
      }
      if (id === 'vector-tool' && d.name === 'gridSize' && input instanceof HTMLInputElement) {
        input.disabled = !state.snapToGrid;
      }
      const evt = d.type === 'checkbox' || d.type === 'select' ? 'change' : 'input';
      input.addEventListener(evt, () => {
        let v;
        if (d.type === 'checkbox') {
          v = input.checked;
        } else if (d.type === 'number' || d.type === 'range' || d.coerce === 'number') {
          const parsed = parseFloat(input.value);
          v = Number.isFinite(parsed) ? parsed : d.default;
        } else {
          v = input.value;
        }
        store.setToolState(id, { [d.name]: v });
        if (d.name === 'antialias') engine?.requestRepaint?.();
        if (id === 'vector-tool') {
          if (d.name === 'snapToGrid') {
            const gridField = fieldRefs.get('gridSize');
            if (gridField instanceof HTMLInputElement) {
              gridField.disabled = !input.checked;
            }
          }
          if (d.name === 'showAnchors') {
            engine?.requestRepaint?.();
          }
        }
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
      properties.appendChild(wrap);
    });

    appendPaletteSection(palette || properties, store, id, state);

    drawToolPreview(previewCanvas, state, id);

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
