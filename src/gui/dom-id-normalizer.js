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
    const toolbarButton = root.getElementById?.(toolbarId) ?? null;
    const panelButton = root.getElementById?.(panelId) ?? null;

    if (toolbarButton) {
      tagButton(toolbarButton, action, 'toolbar');
    }
    if (panelButton) {
      tagButton(panelButton, action, 'panel');
    }

    const matches = Array.from(root.querySelectorAll(`#${legacyId}`));
    if (matches.length < 2) return;

    const [legacyToolbarButton, legacyPanelButton] = matches;
    if (legacyToolbarButton) {
      legacyToolbarButton.id = toolbarId;
      tagButton(legacyToolbarButton, action, 'toolbar');
    }
    if (legacyPanelButton) {
      legacyPanelButton.id = panelId;
      tagButton(legacyPanelButton, action, 'panel');
    }
  });
}

export function normaliseRuntimeDom(root = document) {
  normalizeDuplicateIds(root);
}

if (typeof document !== 'undefined') {
  normaliseRuntimeDom(document);
}
