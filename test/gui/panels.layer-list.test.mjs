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

    const actionRow = document.createElement('div');
    actionRow.className = 'layer-action-row';
    const addButton = document.createElement('button');
    addButton.id = 'addLayerBtn';
    actionRow.appendChild(addButton);

    const list = document.createElement('ul');
    list.id = 'layerList';
    panel.appendChild(filterGroup);
    panel.appendChild(actionRow);
    panel.appendChild(list);
    document._elements.layerList = list;
    document.body.appendChild(panel);

    const layers = [createMockLayer(env, 0)];
    updateLayerList(layers, 0, {});

    assert.ok(
      filterGroup.childNodes.includes(filterSentinel),
      'layer filter controls remain attached',
    );
    assert.ok(
      actionRow.childNodes.includes(addButton),
      'layer action buttons remain attached',
    );
    assert.strictEqual(list.childNodes.length, 1, 'layer list still populated');
  } finally {
    env.restore();
  }
});
