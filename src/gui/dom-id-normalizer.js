// Normalise duplicated DOM identifiers that still exist in legacy markup.
// This keeps runtime DOM IDs unique before the app wires toolbar and panel events.

const LAYER_BUTTON_ID_PLAN = Object.freeze([
  {
    legacyId: 'addLayerBtn',
    toolbarId: 'toolbarAddLayerBtn',
    panelId: 'addLayerBtn',
    action: 'add-layer',
  },
  {
    legacyId: 'addVectorLayerBtn',
    toolbarId: 'toolbarAddVectorLayerBtn',
    panelId: 'addVectorLayerBtn',
    action: 'add-vector-layer',
  },
]);

function tagButton(button, action, role) {
  if (!button) return;
  button.dataset.action = action;
  button.dataset.actionRole = role;
}

export function normalizeDuplicateIds(root = document) {
  if (!root?.querySelectorAll) return;

  LAYER_BUTTON_ID_PLAN.forEach(({ legacyId, toolbarId, panelId, action }) => {
    const matches = Array.from(root.querySelectorAll(`#${legacyId}`));
    if (matches.length === 0) return;

    const [toolbarButton, panelButton] = matches;
    if (toolbarButton) {
      toolbarButton.id = toolbarId;
      tagButton(toolbarButton, action, 'toolbar');
    }
    if (panelButton) {
      panelButton.id = panelId;
      tagButton(panelButton, action, 'panel');
    }
  });
}

export function installLayerToolbarProxies(root = document) {
  if (!root?.getElementById) return;

  LAYER_BUTTON_ID_PLAN.forEach(({ toolbarId, panelId }) => {
    const toolbarButton = root.getElementById(toolbarId);
    const panelButton = root.getElementById(panelId);
    if (!toolbarButton || !panelButton) return;
    if (toolbarButton.dataset.proxyInstalled === 'true') return;

    toolbarButton.dataset.proxyInstalled = 'true';
    toolbarButton.addEventListener('click', () => {
      panelButton.click();
    });
  });
}

export function normaliseRuntimeDom(root = document) {
  normalizeDuplicateIds(root);
  installLayerToolbarProxies(root);
}

if (typeof document !== 'undefined') {
  normaliseRuntimeDom(document);
}
