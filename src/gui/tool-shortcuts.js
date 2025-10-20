const PRIMARY_TOOL_SHORTCUT_ENTRIES = Object.freeze([
  { code: 'KeyP', toolId: 'pencil' },
  { code: 'KeyB', toolId: 'brush' },
  { code: 'KeyE', toolId: 'eraser' },
  { code: 'KeyT', toolId: 'text' },
  { code: 'KeyM', toolId: 'select-rect' },
  { code: 'KeyI', toolId: 'eyedropper' },
  { code: 'KeyF', toolId: 'bucket' },
  { code: 'KeyL', toolId: 'line' },
  { code: 'KeyR', toolId: 'rect' },
  { code: 'KeyO', toolId: 'ellipse' },
  { code: 'KeyD', toolId: 'scatter' },
  { code: 'KeyG', toolId: 'smudge' },
  { code: 'KeyQ', toolId: 'quad' },
  { code: 'KeyC', toolId: 'cubic' },
  { code: 'KeyA', toolId: 'arc' },
  { code: 'KeyS', toolId: 'sector' },
  { code: 'KeyU', toolId: 'catmull' },
  { code: 'KeyN', toolId: 'nurbs' },
  { code: 'KeyK', toolId: 'vector-keep' },
  { code: 'KeyH', toolId: 'freehand' },
  { code: 'KeyV', toolId: 'vectorization' },
]);

const SHIFT_TOOL_SHORTCUT_ENTRIES = Object.freeze([
  { code: 'KeyP', toolId: 'pencil-click', modifiers: ['Shift'] },
  { code: 'KeyE', toolId: 'eraser-click', modifiers: ['Shift'] },
  { code: 'KeyH', toolId: 'freehand-click', modifiers: ['Shift'] },
  { code: 'KeyV', toolId: 'vector-edit', modifiers: ['Shift'] },
]);

const primaryShortcutLookup = buildLookup(PRIMARY_TOOL_SHORTCUT_ENTRIES);
const shiftShortcutLookup = buildLookup(SHIFT_TOOL_SHORTCUT_ENTRIES);

function buildLookup(entries) {
  const lookup = new Map();
  entries.forEach((entry) => {
    lookup.set(entry.code, entry.toolId);
  });
  return lookup;
}

function codeToDisplayLabel(code) {
  if (code.startsWith('Key')) {
    return code.slice(3);
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  switch (code) {
    case 'Minus':
      return '-';
    case 'Equal':
      return '=';
    default:
      return code;
  }
}

function describeShortcutEntry(entry) {
  const modifiers = entry.modifiers ?? [];
  const parts = [...modifiers, codeToDisplayLabel(entry.code)];
  return parts.join('+');
}

export function getPrimaryShortcutTool(code) {
  return primaryShortcutLookup.get(code) ?? null;
}

export function getShiftShortcutTool(code) {
  return shiftShortcutLookup.get(code) ?? null;
}

export function describeShortcutsForTool(toolId) {
  if (!toolId) {
    return [];
  }
  const descriptions = [];
  PRIMARY_TOOL_SHORTCUT_ENTRIES.forEach((entry) => {
    if (entry.toolId === toolId) {
      descriptions.push(describeShortcutEntry(entry));
    }
  });
  SHIFT_TOOL_SHORTCUT_ENTRIES.forEach((entry) => {
    if (entry.toolId === toolId) {
      descriptions.push(describeShortcutEntry(entry));
    }
  });
  return descriptions;
}

export const PRIMARY_TOOL_SHORTCUTS = PRIMARY_TOOL_SHORTCUT_ENTRIES;
export const SHIFT_TOOL_SHORTCUTS = SHIFT_TOOL_SHORTCUT_ENTRIES;
