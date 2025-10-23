import { describeShortcutsForTool } from './tool-shortcuts.js';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

let overlay = null;
let input = null;
let resultsList = null;
let emptyMessage = null;
let isInitialised = false;
let isOpen = false;
let lastFocused = null;
let locale = 'ja';

/** @type {Array<{ id: string, label: string, group: string, shortcuts: string[], keywords: string, order: number, element: HTMLElement }>} */
let entries = [];
/** @type {typeof entries} */
let filteredEntries = [];
let activeIndex = -1;

const isEditableTarget = target => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

const getLocale = () => document.documentElement.lang || navigator.language || 'ja';

const normalise = value => {
  if (value == null) return '';
  return value.toString().normalize('NFKC').toLocaleLowerCase(locale);
};

const getFocusableElements = () => {
  if (!overlay) return [];
  return Array.from(overlay.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    el => el instanceof HTMLElement && el.offsetParent !== null && el.getAttribute('aria-hidden') !== 'true',
  );
};

const collectEntries = () => {
  const buttons = Array.from(document.querySelectorAll('.tool[data-tool]'));
  const seen = new Set();
  entries = [];
  buttons.forEach((button, order) => {
    if (!(button instanceof HTMLElement)) return;
    const toolId = button.dataset.tool || '';
    if (!toolId || seen.has(toolId)) return;
    seen.add(toolId);
    const label = (button.dataset.label || button.textContent || toolId).trim();
    const dropdown = button.closest('.tool-dropdown');
    let group = '基本ツール';
    if (dropdown instanceof HTMLElement) {
      const summary = dropdown.querySelector('summary');
      if (summary) {
        group = summary.textContent?.trim() || group;
      }
    }
    const shortcuts = describeShortcutsForTool(toolId);
    const keywords = normalise(
      [label, toolId, group, button.title || '', shortcuts.join(' '), button.dataset.toolKeywords || ''].join(' '),
    );
    entries.push({
      id: toolId,
      label,
      group,
      shortcuts,
      keywords,
      order,
      element: button,
    });
  });
};

const computeRank = (entry, tokens) => {
  let score = entry.order;
  const labelNorm = normalise(entry.label);
  const idNorm = normalise(entry.id);
  tokens.forEach(token => {
    if (!token) return;
    if (labelNorm.startsWith(token)) {
      score -= 30;
    } else if (idNorm.startsWith(token)) {
      score -= 20;
    } else {
      score -= 5;
    }
  });
  if (entry.shortcuts.length) {
    score -= 2;
  }
  return score;
};

const filterEntries = query => {
  const tokens = normalise(query)
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);

  filteredEntries = entries.filter(entry => tokens.every(token => entry.keywords.includes(token)));

  if (tokens.length === 0) {
    filteredEntries.sort((a, b) => a.label.localeCompare(b.label, locale, { sensitivity: 'base' }));
  } else {
    filteredEntries.sort((a, b) => computeRank(a, tokens) - computeRank(b, tokens));
  }
};

const updateActiveState = () => {
  if (!resultsList) return;
  const buttons = resultsList.querySelectorAll('.tool-search-button');
  buttons.forEach(button => {
    if (!(button instanceof HTMLElement)) return;
    const index = Number(button.dataset.index);
    const isActive = index === activeIndex;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  const activeButton = resultsList.querySelector(`.tool-search-button[data-index="${activeIndex}"]`);
  if (activeButton instanceof HTMLElement) {
    resultsList.setAttribute('aria-activedescendant', activeButton.id);
  } else {
    resultsList.removeAttribute('aria-activedescendant');
  }
};

const renderResults = () => {
  if (!resultsList || !emptyMessage) return;
  const fragment = document.createDocumentFragment();
  filteredEntries.forEach((entry, index) => {
    const li = document.createElement('li');
    li.className = 'tool-search-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tool-search-button';
    button.dataset.index = String(index);
    button.id = `toolSearchOption-${entry.id}-${index}`;
    button.setAttribute('role', 'option');

    const name = document.createElement('span');
    name.className = 'tool-search-name';
    name.textContent = entry.label;

    const meta = document.createElement('span');
    meta.className = 'tool-search-meta';
    const metaParts = [];
    if (entry.group) {
      metaParts.push(entry.group);
    }
    if (entry.id) {
      metaParts.push(`#${entry.id}`);
    }
    if (entry.shortcuts.length) {
      metaParts.push(entry.shortcuts.join(' / '));
    }
    meta.textContent = metaParts.join(' · ');

    button.append(name, meta);
    li.append(button);
    fragment.append(li);
  });

  resultsList.replaceChildren(fragment);
  emptyMessage.hidden = filteredEntries.length > 0;
  resultsList.hidden = filteredEntries.length === 0;
  if (filteredEntries.length === 0) {
    resultsList.removeAttribute('aria-activedescendant');
  }

  updateActiveState();
};

const scrollActiveIntoView = () => {
  if (!resultsList) return;
  const activeButton = resultsList.querySelector(`.tool-search-button[data-index="${activeIndex}"]`);
  if (activeButton instanceof HTMLElement) {
    activeButton.scrollIntoView({ block: 'nearest' });
  }
};

const setActiveIndex = (nextIndex, { scroll = false } = {}) => {
  const clamped = Math.max(-1, Math.min(nextIndex, filteredEntries.length - 1));
  activeIndex = clamped;
  updateActiveState();
  if (scroll && activeIndex >= 0) {
    scrollActiveIntoView();
  }
};

const activateEntry = entry => {
  if (!entry) return;
  closeOverlay();
  requestAnimationFrame(() => {
    entry.element?.click?.();
  });
};

const activateActiveEntry = () => {
  if (activeIndex < 0 || activeIndex >= filteredEntries.length) return;
  activateEntry(filteredEntries[activeIndex]);
};

const handleOverlayKeydown = event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeOverlay();
    return;
  }

  if (event.key === 'Tab') {
    const focusables = getFocusableElements();
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first || !overlay?.contains(document.activeElement)) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (filteredEntries.length === 0) return;
    event.preventDefault();
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = activeIndex < 0 ? (delta > 0 ? 0 : filteredEntries.length - 1) : activeIndex + delta;
    const wrapped = (next + filteredEntries.length) % filteredEntries.length;
    setActiveIndex(wrapped, { scroll: true });
    return;
  }

  if (event.key === 'Enter') {
    if (document.activeElement === input || resultsList?.contains(document.activeElement)) {
      event.preventDefault();
      activateActiveEntry();
    }
  }
};

const handleGlobalKeydown = event => {
  if (event.defaultPrevented) return;
  if (isOpen && event.key === 'Escape') {
    if (isEditableTarget(event.target) && !overlay?.contains(event.target)) return;
    event.preventDefault();
    closeOverlay();
    return;
  }

  const key = event.key?.toLowerCase();
  if (key !== 'k') return;
  const isShortcut = (event.ctrlKey || event.metaKey) && !event.altKey;
  if (!isShortcut || isOpen) return;
  if (isEditableTarget(event.target)) return;
  event.preventDefault();
  openOverlay();
};

const handleResultsClick = event => {
  const button = event.target instanceof HTMLElement ? event.target.closest('.tool-search-button') : null;
  if (!(button instanceof HTMLElement)) return;
  const index = Number(button.dataset.index);
  if (Number.isNaN(index)) return;
  setActiveIndex(index);
  activateActiveEntry();
};

const handleResultsMouseMove = event => {
  const button = event.target instanceof HTMLElement ? event.target.closest('.tool-search-button') : null;
  if (!(button instanceof HTMLElement)) return;
  const index = Number(button.dataset.index);
  if (!Number.isNaN(index) && index !== activeIndex) {
    setActiveIndex(index);
  }
};

const openOverlay = trigger => {
  if (!overlay || isOpen) return;
  locale = getLocale();
  collectEntries();
  filterEntries('');
  renderResults();
  setActiveIndex(filteredEntries.length ? 0 : -1);
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  isOpen = true;
  lastFocused = trigger instanceof HTMLElement ? trigger : document.activeElement;
  requestAnimationFrame(() => {
    input?.focus({ preventScroll: true });
    input?.select?.();
  });
};

const closeOverlay = () => {
  if (!overlay || !isOpen) return;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  isOpen = false;
  activeIndex = -1;
  if (input) {
    input.value = '';
  }
  filteredEntries = [];
  if (resultsList) {
    resultsList.innerHTML = '';
    resultsList.hidden = true;
    resultsList.removeAttribute('aria-activedescendant');
  }
  if (emptyMessage) {
    emptyMessage.hidden = true;
  }
  const focusTarget = lastFocused;
  lastFocused = null;
  if (focusTarget instanceof HTMLElement) {
    requestAnimationFrame(() => {
      focusTarget.focus?.({ preventScroll: true });
    });
  }
};

export function initToolSearchOverlay() {
  if (isInitialised) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  overlay = document.getElementById('toolSearchOverlay');
  input = overlay?.querySelector('#toolSearchInput') ?? null;
  resultsList = overlay?.querySelector('#toolSearchResults') ?? null;
  emptyMessage = overlay?.querySelector('#toolSearchEmpty') ?? null;

  if (!overlay || !input || !resultsList || !emptyMessage) {
    overlay = null;
    input = null;
    resultsList = null;
    emptyMessage = null;
    return;
  }

  overlay.setAttribute('aria-hidden', 'true');
  overlay.addEventListener('keydown', handleOverlayKeydown);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) {
      closeOverlay();
    }
  });

  input.addEventListener('input', () => {
    filterEntries(input.value);
    renderResults();
    setActiveIndex(filteredEntries.length ? 0 : -1);
  });

  resultsList.addEventListener('click', handleResultsClick);
  resultsList.addEventListener('mousemove', handleResultsMouseMove);

  overlay.querySelectorAll('[data-tool-search-dismiss]').forEach(button => {
    button.addEventListener('click', () => closeOverlay());
  });

  document.querySelectorAll('[data-action="show-tool-search"]').forEach(button => {
    if (button instanceof HTMLElement) {
      button.addEventListener('click', () => openOverlay(button));
    }
  });

  document.addEventListener('keydown', handleGlobalKeydown);

  isInitialised = true;
}

window.initToolSearchOverlay = initToolSearchOverlay;
