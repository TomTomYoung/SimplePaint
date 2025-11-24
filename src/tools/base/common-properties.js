// 共通プロパティ定義
// 各ツールで共有されるプロパティ設定を提供します

export const strokeProps = [
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

export const opacityProp = {
  name: 'opacity',
  label: '不透明度',
  type: 'range',
  min: 0.05,
  max: 1,
  step: 0.05,
  default: 1,
  hint: '線の透け具合を設定します（0.05でほぼ透明〜1で完全不透明）。',
};

export const smoothProps = [
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

export const fillProps = [
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

export const aaProp = [
  {
    name: 'antialias',
    label: 'アンチエイリアス',
    type: 'checkbox',
    default: false,
    hint: 'オンでエッジを滑らかに補間し、オフでピクセルをくっきり描画します。',
  },
];

export const strokeStyleExtras = [
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

export const cornerRadiusProp = {
  name: 'cornerRadius',
  label: '角丸半径',
  type: 'number',
  min: 0,
  max: 256,
  step: 1,
  default: 0,
  hint: '矩形の角を丸める半径を指定します。0で直角、数値が大きいほど丸みが増します。',
};

export const textProps = [
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

export const nurbsProp = [
  {
    name: 'nurbsWeight',
    label: '制御点の重み',
    type: 'number',
    step: 0.1,
    default: 1,
    hint: '制御点の影響度を調整します。値が大きいほどその点へカーブが引き寄せられます。',
  },
];
