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

  const render = (id) => {
    const defs = toolPropDefs[id] || [];
    panel.innerHTML = '';
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
      panel.appendChild(wrap);
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
