import { describeShortcutsForTool } from './tool-shortcuts.js';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

let overlay = null;
let panel = null;
let toolTable = null;
let isInitialised = false;
let isOpen = false;
let lastFocused = null;

const isEditableTarget = target => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

const getLocale = () => document.documentElement.lang || navigator.language || 'ja';

const getFocusableElements = () => {
  if (!overlay) return [];
  return Array.from(overlay.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el =>
    el.offsetParent !== null && el.getAttribute('aria-hidden') !== 'true',
  );
};

const closeOverlay = () => {
  if (!overlay || !isOpen) return;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  overlay.classList.remove('is-open');
  isOpen = false;
  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
  }
  lastFocused = null;
};

const ensureToolTable = () => {
  if (!toolTable) return;

  const toolButtons = Array.from(document.querySelectorAll('.tool[data-tool]'));
  if (toolButtons.length === 0) {
    toolTable.innerHTML =
      '<tr><td class="shortcut-empty" colspan="2">ショートカットが定義されていません。</td></tr>';
    return;
  }

  const entries = new Map();
  toolButtons.forEach(button => {
    const toolId = button.dataset.tool;
    if (!toolId) return;
    const label = (button.dataset.label || button.textContent || '').trim() || toolId;
    const shortcuts = describeShortcutsForTool(toolId);
    if (!Array.isArray(shortcuts) || shortcuts.length === 0) return;
    if (!entries.has(toolId)) {
      entries.set(toolId, { label, shortcuts: new Set() });
    }
    const record = entries.get(toolId);
    shortcuts.forEach(shortcut => record.shortcuts.add(shortcut));
  });

  if (entries.size === 0) {
    toolTable.innerHTML =
      '<tr><td class="shortcut-empty" colspan="2">ショートカットが定義されていません。</td></tr>';
    return;
  }

  const locale = getLocale();
  const fragment = document.createDocumentFragment();
  Array.from(entries.values())
    .sort((a, b) => a.label.localeCompare(b.label, locale, { sensitivity: 'base' }))
    .forEach(entry => {
      const tr = document.createElement('tr');
      const toolCell = document.createElement('th');
      toolCell.scope = 'row';
      toolCell.textContent = entry.label;
      const shortcutCell = document.createElement('td');
      shortcutCell.textContent = Array.from(entry.shortcuts).join(' / ');
      tr.append(toolCell, shortcutCell);
      fragment.appendChild(tr);
    });

  toolTable.replaceChildren(fragment);
};

const openOverlay = trigger => {
  if (!overlay || isOpen) return;
  ensureToolTable();
  overlay.hidden = false;
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
  isOpen = true;
  lastFocused = trigger instanceof HTMLElement ? trigger : document.activeElement;
  const focusables = getFocusableElements();
  const firstFocusable = focusables.find(el => overlay.contains(el));
  if (firstFocusable) {
    requestAnimationFrame(() => firstFocusable.focus());
  }
};

const handleOverlayKeydown = event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeOverlay();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusables = getFocusableElements();
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey) {
    if (document.activeElement === first || !overlay.contains(document.activeElement)) {
      event.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

const handleGlobalKeydown = event => {
  if (event.defaultPrevented) return;
  const key = event.key;
  if ((key === '?' || (key === '/' && event.shiftKey)) && !isOpen) {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    openOverlay();
    return;
  }
  if (key === 'Escape' && isOpen) {
    if (isEditableTarget(event.target) && !overlay.contains(event.target)) return;
    event.preventDefault();
    closeOverlay();
  }
};

export function initShortcutOverlay() {
  if (isInitialised) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  overlay = document.getElementById('shortcutOverlay');
  panel = overlay?.querySelector('.shortcut-overlay-panel') ?? null;
  toolTable = overlay?.querySelector('#shortcutToolTable') ?? null;

  if (!overlay || !panel || !toolTable) {
    overlay = null;
    panel = null;
    toolTable = null;
    return;
  }

  overlay.setAttribute('aria-hidden', 'true');
  overlay.addEventListener('keydown', handleOverlayKeydown);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      closeOverlay();
    }
  });

  overlay.querySelectorAll('[data-shortcut-dismiss]').forEach(button => {
    button.addEventListener('click', () => closeOverlay());
  });

  document
    .querySelectorAll('[data-action="show-shortcut-overlay"]')
    .forEach(button => {
      button.addEventListener('click', () => openOverlay(button));
    });

  document.addEventListener('keydown', handleGlobalKeydown);

  isInitialised = true;
}
