import { getActiveEditor } from '../managers/text-editor.js';

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
  'aa-line-brush': [
    { name: 'primaryColor', label: '線色', type: 'color', default: '#000000' },
    { name: 'opacity', label: '不透明度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.8 },
  ],
  'blur-brush': [
    { name: 'sigma', label: 'σ', type: 'range', min: 1, max: 6, step: 0.1, default: 3 },
    { name: 'iterations', label: '回数', type: 'number', min: 1, max: 3, step: 1, default: 1 },
    { name: 'spacingRatio', label: '間隔', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.6 },
  ],
  'chalk-pastel': [
    { name: 'brushSize', label: 'サイズ', type: 'range', min: 1, max: 64, step: 1, default: 16 },
    { name: 'primaryColor', label: '色', type: 'color', default: '#000000' },
    { name: 'paperScale', label: '紙目', type: 'range', min: 1, max: 2, step: 0.1, default: 1.3 },
    { name: 'opacityJitter', label: '不透明ジッタ', type: 'range', min: 0, max: 1, step: 0.05, default: 0.2 },
    { name: 'spacingRatio', label: '間隔', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.45 },
  ],
  'edge-aware-paint': [
    { name: 'primaryColor', label: '色', type: 'color', default: '#000000' },
    { name: 'tau', label: '勾配τ', type: 'range', min: 10, max: 100, step: 1, default: 30 },
    { name: 'radius', label: '半径', type: 'range', min: 1, max: 64, step: 1, default: 16 },
    { name: 'boundaryPad', label: '境界緩衝', type: 'range', min: 0, max: 5, step: 1, default: 1 },
    { name: 'strength', label: '強さ', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    { name: 'spacingRatio', label: '間隔', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.5 },
  ],
  'flow-guided-brush': [
    { name: 'brushSize', label: 'サイズ', type: 'range', min: 1, max: 64, step: 1, default: 16 },
    { name: 'primaryColor', label: '色', type: 'color', default: '#000000' },
    { name: 'spacingRatio', label: '間隔', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.5 },
    { name: 'lambda', label: '混合λ', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { name: 'fieldUpdateMs', label: '更新ms', type: 'number', min: 1, max: 100, step: 1, default: 16 },
    { name: 'fieldRadiusScale', label: '解析窓', type: 'range', min: 0.5, max: 3, step: 0.1, default: 1.5 },
    { name: 'dabLengthRatio', label: '長さ比', type: 'range', min: 0.1, max: 3, step: 0.1, default: 1 },
  ],
  'gradient-brush': [
    { name: 'brushSize', label: 'サイズ', type: 'range', min: 1, max: 64, step: 1, default: 16 },
    { name: 'primaryColor', label: '色1', type: 'color', default: '#000000' },
    { name: 'secondaryColor', label: '色2', type: 'color', default: '#ffffff' },
    { name: 'spacingRatio', label: '間隔', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.5 },
    { name: 'easing', label: '補間', type: 'select', options: [
        { value: 'linear', label: 'Linear' },
        { value: 'quad', label: 'Quad' },
        { value: 'cubic', label: 'Cubic' },
      ], default: 'linear' },
  ],
  hatching: [
    { name: 'brushSize', label: 'サイズ', type: 'range', min: 1, max: 64, step: 1, default: 16 },
    { name: 'primaryColor', label: '色', type: 'color', default: '#000000' },
    { name: 'crosshatch', label: 'クロス', type: 'checkbox', default: false },
    { name: 'hatchAngle', label: '角度', type: 'range', min: -180, max: 180, step: 1, default: 0 },
    { name: 'hatchDensity', label: '密度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { name: 'hatchWidth', label: '線幅', type: 'range', min: 0.5, max: 4, step: 0.1, default: 1 },
  ],
  'noise-displaced': [
    { name: 'brushSize', label: 'サイズ', type: 'range', min: 1, max: 64, step: 1, default: 4 },
    { name: 'primaryColor', label: '色', type: 'color', default: '#000000' },
    { name: 'ndAmplitude', label: '振幅', type: 'range', min: 0, max: 6, step: 0.1, default: 2 },
    { name: 'ndFrequency', label: '周波数', type: 'range', min: 0.02, max: 1, step: 0.02, default: 0.25 },
    { name: 'ndSeed', label: '種', type: 'number', step: 1, default: 0 },
  ],
  'pattern-art-brush': [
    { name: 'primaryColor', label: '色', type: 'color', default: '#000000' },
    { name: 'phase', label: '位相', type: 'number', min: 0, max: 100, step: 1, default: 0 },
    { name: 'stretchTol', label: '伸縮許容', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.1 },
    { name: 'tint', label: '着色', type: 'checkbox', default: true },
    { name: 'spacingScale', label: '間隔比', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.25 },
  ],
  'pixel-brush': [
    { name: 'pixelSize', label: 'ピクセル', type: 'number', min: 1, max: 32, step: 1, default: 1 },
    { name: 'primaryColor', label: '色', type: 'color', default: '#000000' },
  ],
  'symmetry-mirror': [
    { name: 'brushSize', label: 'サイズ', type: 'range', min: 1, max: 64, step: 1, default: 12 },
    { name: 'primaryColor', label: '色', type: 'color', default: '#000000' },
    { name: 'n', label: '分割数', type: 'number', min: 2, max: 12, step: 1, default: 6 },
    { name: 'mode', label: 'モード', type: 'select', options: [
        { value: 'rotate', label: '回転' },
        { value: 'dihedral', label: '対称' },
      ], default: 'dihedral' },
    { name: 'reflect', label: '鏡映', type: 'checkbox', default: true },
    { name: 'axisAngle', label: '基準角', type: 'range', min: 0, max: 360, step: 1, default: 0 },
  ],
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

export function initToolPropsPanel(store, engine) {
  const panel = document.getElementById('leftPanel');
  if (!panel) return;
  const body = panel.querySelector('.panel-body');
  if (!body) return;

  const render = (id) => {
    const defs = toolPropDefs[id] || [];
    body.innerHTML = '';
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
      const state = store.getToolState(id);
      const val = state[d.name] ?? d.default;
      if (d.type === 'checkbox') input.checked = !!val; else input.value = val;
      const evt = d.type === 'checkbox' ? 'change' : 'input';
      input.addEventListener(evt, () => {
        const v = d.type === 'checkbox' ? input.checked : (d.type === 'number' ? parseFloat(input.value) : input.value);
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
    panel.style.display = defs.length ? 'block' : 'none';
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
