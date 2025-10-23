import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockDomEnvironment } from '../helpers/mock-dom.js';
import { updateLayerList } from '../../src/gui/panels.js';

const createMockLayer = (env, index, overrides = {}) => {
  const layer = env.createCanvas({ label: `layer-${index}` });
  Object.assign(layer, {
    _id: `layer-${index}`,
    name: `Layer ${index + 1}`,
    visible: true,
    opacity: 1,
    mode: 'source-over',
    clip: false,
    layerType: index % 2 === 0 ? 'raster' : 'vector',
    width: 256,
    height: 256,
    ...overrides,
  });
  return layer;
};

test('updateLayerList renders layer rows without preview canvases', () => {
  const env = installMockDomEnvironment();
  try {
    const list = env.document.createElement('ul');
    list.id = 'layerList';
    list.className = 'layer-list';
    env.document._elements.layerList = list;

    const layers = [createMockLayer(env, 0), createMockLayer(env, 1)];

    updateLayerList(layers, 1, {});

    assert.strictEqual(list.childNodes.length, 2, 'renders one entry per layer');

    list.childNodes.forEach((item, index) => {
      assert.strictEqual(
        item.className.includes('active'),
        index === 1,
        'marks only the active layer row',
      );
      assert.strictEqual(String(item.dataset.index ?? ''), String(index));
      assert.strictEqual(item.dataset.layerId, layers[index]._id ?? String(index));

      const childClasses = item.childNodes.map(child => child.className);
      assert.deepStrictEqual(childClasses, ['layer-meta', 'layer-item-controls']);

      const meta = item.childNodes[0];
      assert.strictEqual(meta.className, 'layer-meta');
      const metaTop = meta.childNodes[0];
      assert.strictEqual(metaTop.className, 'layer-meta-top');
      const [handle, vis, name] = metaTop.childNodes;
      assert.strictEqual(handle.textContent, '≡');
      assert.strictEqual(vis.type, 'checkbox');
      assert.strictEqual(name.className, 'layer-name');

      const metaBottom = meta.childNodes[1];
      assert.strictEqual(metaBottom.className, 'layer-meta-bottom');
      const [typeLabel, sizeLabel] = metaBottom.childNodes;
      assert.strictEqual(typeLabel.className, 'layer-type');
      assert.match(typeLabel.textContent, /ラスター|ベクター|テキスト/);
      if (sizeLabel) {
        assert.strictEqual(sizeLabel.className, 'layer-size');
        assert.match(sizeLabel.textContent, /^\d+×\d+$/);
      }

      const visit = node => {
        if (!node || typeof node !== 'object') return;
        assert.notStrictEqual(node.className, 'layer-thumb');
        if (node.tagName === 'CANVAS') {
          assert.fail('layer preview canvas should be removed');
        }
        (node.childNodes || []).forEach(visit);
      };
      visit(item);

      const controls = item.childNodes[1];
      assert.strictEqual(controls.className, 'layer-item-controls');
      const [opacity, blend, clip] = controls.childNodes;
      assert.strictEqual(opacity.type, 'range');
      assert.strictEqual(blend.tagName, 'SELECT');
      assert.strictEqual(clip.type, 'checkbox');
    });
  } finally {
    env.restore();
  }
});

test('updateLayerList leaves surrounding panel controls intact', () => {
  const env = installMockDomEnvironment();
  try {
    const { document } = env;

    const panel = document.createElement('section');
    panel.id = 'layerPanel';

    const filterGroup = document.createElement('div');
    filterGroup.className = 'layer-filter-group';
    const filterSentinel = document.createElement('span');
    filterSentinel.textContent = 'filters';
    filterGroup.appendChild(filterSentinel);
    ['all', 'raster', 'vector', 'text'].forEach(value => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'layer-filter';
      button.dataset.layerFilter = value;
      button.textContent = value;
      filterGroup.appendChild(button);
    });

    const searchLabel = document.createElement('label');
    const searchInput = document.createElement('input');
    searchInput.id = 'layerSearch';
    searchInput.type = 'search';
    document._elements.layerSearch = searchInput;
    searchLabel.appendChild(searchInput);

    const actionRow = document.createElement('div');
    actionRow.className = 'layer-action-row';
    const addButton = document.createElement('button');
    addButton.id = 'addLayerBtn';
    actionRow.appendChild(addButton);
    const addVectorButton = document.createElement('button');
    addVectorButton.id = 'addVectorLayerBtn';
    document._elements.addVectorLayerBtn = addVectorButton;
    actionRow.appendChild(addVectorButton);

    const list = document.createElement('ul');
    list.id = 'layerList';
    filterGroup.appendChild(searchLabel);
    panel.appendChild(filterGroup);
    panel.appendChild(actionRow);
    panel.appendChild(list);
    document._elements.layerList = list;
    document.body.appendChild(panel);

    const layers = [createMockLayer(env, 0)];
    updateLayerList(layers, 0, {});

    const filterButtons = filterGroup.childNodes.filter(
      node => node.className === 'layer-filter'
    );
    assert.strictEqual(filterButtons.length, 4, 'keeps all layer filter buttons rendered');
    filterButtons.forEach(button => {
      assert.strictEqual(button.tagName, 'BUTTON');
      assert.ok(button.textContent.trim().length > 0, 'each filter button has a label');
    });

    assert.ok(
      filterGroup.childNodes.includes(filterSentinel),
      'layer filter controls remain attached',
    );
    assert.ok(
      actionRow.childNodes.includes(addButton),
      'layer action buttons remain attached',
    );

    const searchInputRef = document.getElementById('layerSearch');
    assert.ok(searchInputRef, 'layer search input still exists');
    assert.strictEqual(searchInputRef.type, 'search');

    const vectorAddButton = document.getElementById('addVectorLayerBtn');
    assert.ok(vectorAddButton, 'vector layer add button is still rendered');
    assert.strictEqual(vectorAddButton.tagName, 'BUTTON');

    assert.strictEqual(list.childNodes.length, 1, 'layer list still populated');
  } finally {
    env.restore();
  }
});

test('updateLayerList preserves layer properties scaffolding', () => {
  const env = installMockDomEnvironment();
  try {
    const { document } = env;

    const list = document.createElement('ul');
    list.id = 'layerList';
    document._elements.layerList = list;
    document.body.appendChild(list);

    const properties = document.createElement('section');
    properties.id = 'layerProperties';
    document._elements.layerProperties = properties;
    document.body.appendChild(properties);

    const typeLabel = document.createElement('strong');
    typeLabel.id = 'layerTypeLabel';
    typeLabel.textContent = '—';
    document._elements.layerTypeLabel = typeLabel;
    properties.appendChild(typeLabel);

    const vectorControls = document.createElement('div');
    vectorControls.id = 'vectorLayerControls';
    document._elements.vectorLayerControls = vectorControls;
    properties.appendChild(vectorControls);

    const color = document.createElement('input');
    color.id = 'vectorLayerColor';
    color.type = 'color';
    document._elements.vectorLayerColor = color;
    vectorControls.appendChild(color);

    const width = document.createElement('input');
    width.id = 'vectorLayerWidth';
    width.type = 'number';
    document._elements.vectorLayerWidth = width;
    vectorControls.appendChild(width);

    const dash = document.createElement('input');
    dash.id = 'vectorLayerDash';
    dash.type = 'text';
    document._elements.vectorLayerDash = dash;
    vectorControls.appendChild(dash);

    const cap = document.createElement('select');
    cap.id = 'vectorLayerCap';
    document._elements.vectorLayerCap = cap;
    vectorControls.appendChild(cap);

    const apply = document.createElement('button');
    apply.id = 'vectorLayerApplyAll';
    apply.type = 'button';
    document._elements.vectorLayerApplyAll = apply;
    vectorControls.appendChild(apply);

    const layers = [createMockLayer(env, 0, { layerType: 'vector' })];
    updateLayerList(layers, 0, {});

    assert.strictEqual(
      document.getElementById('layerProperties'),
      properties,
      'layer properties container remains attached',
    );
    assert.strictEqual(
      document.getElementById('layerTypeLabel'),
      typeLabel,
      'layer type label stays registered',
    );
    assert.strictEqual(
      document.getElementById('vectorLayerControls'),
      vectorControls,
      'vector controls container remains registered',
    );

    const vectorInputs = [
      ['vectorLayerColor', color, 'INPUT'],
      ['vectorLayerWidth', width, 'INPUT'],
      ['vectorLayerDash', dash, 'INPUT'],
      ['vectorLayerCap', cap, 'SELECT'],
      ['vectorLayerApplyAll', apply, 'BUTTON'],
    ];

    vectorInputs.forEach(([id, node, tag]) => {
      const element = document.getElementById(id);
      assert.strictEqual(element, node, `${id} remains connected`);
      assert.strictEqual(element.tagName, tag, `${id} keeps expected tag`);
    });

    assert.strictEqual(list.childNodes.length, 1, 'layer list still renders entries');
  } finally {
    env.restore();
  }
});
