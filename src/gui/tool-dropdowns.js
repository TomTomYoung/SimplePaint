// tool-dropdowns.js - ツールドロップダウンの配置と制御

function ensureDropdownLayer() {
  // オーバーレイ用の専用コンテナを使わず、body 直下に配置する
  // （reparent 時のイベントハンドラ切断を避けるための方針）。
  if (!(document.body instanceof HTMLElement)) return null;
  document.body.classList.add('tool-dropdown-layer');
  return document.body;
}

function hidePanel(panel) {
  panel.hidden = true;
  panel.removeAttribute('data-align');
  panel.style.removeProperty('left');
  panel.style.removeProperty('right');
  panel.style.removeProperty('top');
  panel.style.removeProperty('max-width');
  panel.style.removeProperty('max-height');
  panel.style.removeProperty('transform');
}

function alignPanel(dropdown, panels) {
  if (dropdown.dataset.inline === 'true') {
    return;
  }
  const panel = panels.get(dropdown);
  const summary = dropdown.querySelector('summary');
  if (!panel || !summary) return;
  panel.removeAttribute('data-align');

  const viewportWidth =
    document.documentElement?.clientWidth ||
    (typeof window !== 'undefined' ? window.innerWidth : 0);
  const viewportHeight =
    document.documentElement?.clientHeight ||
    (typeof window !== 'undefined' ? window.innerHeight : 0);
  if (!viewportWidth || !viewportHeight) return;

  const margin = 8;
  const gap = 6;

  const maxWidth = Math.min(520, viewportWidth - margin * 2);
  const maxHeight = Math.min(Math.round(viewportHeight * 0.6), 420);

  panel.style.maxWidth = `${maxWidth}px`;
  panel.style.maxHeight = `${maxHeight}px`;

  const summaryRect = summary.getBoundingClientRect();
  const panelWidth = Math.min(panel.offsetWidth || maxWidth, maxWidth);
  const desiredLeft = summaryRect.left;
  const desiredCenter = summaryRect.left + summaryRect.width / 2 - panelWidth / 2;

  let alignment = 'left';
  let left = Math.max(margin, Math.min(desiredLeft, viewportWidth - panelWidth - margin));

  if (panelWidth < viewportWidth - margin * 2) {
    const centeredLeft = Math.max(margin, Math.min(desiredCenter, viewportWidth - panelWidth - margin));
    const centerDelta = Math.abs(centeredLeft + panelWidth / 2 - (summaryRect.left + summaryRect.width / 2));
    const leftDelta = Math.abs(left + panelWidth / 2 - (summaryRect.left + summaryRect.width / 2));
    if (centerDelta < leftDelta) {
      left = centeredLeft;
      alignment = 'center';
    }
  }

  const rightAlignedLeft = summaryRect.right - panelWidth;
  if (rightAlignedLeft >= margin && rightAlignedLeft + panelWidth <= viewportWidth - margin) {
    const rightDelta = Math.abs(rightAlignedLeft + panelWidth / 2 - (summaryRect.left + summaryRect.width / 2));
    if (rightDelta < Math.abs(left + panelWidth / 2 - (summaryRect.left + summaryRect.width / 2))) {
      left = rightAlignedLeft;
      alignment = 'right';
    }
  }

  panel.style.left = `${left}px`;
  panel.style.top = `${summaryRect.bottom + gap}px`;
  panel.style.transform = 'none';

  if (alignment === 'center') {
    panel.dataset.align = 'center';
  } else if (alignment === 'right') {
    panel.dataset.align = 'right';
  }
}

function bindToggleHandlers(dropdowns, panels, schedule) {
  const closeOthers = current => {
    dropdowns.forEach(dd => {
      if (dd !== current) {
        dd.open = false;
        const panel = panels.get(dd);
        if (panel) hidePanel(panel);
      }
    });
  };

  dropdowns.forEach(dropdown => {
    dropdown.addEventListener('toggle', () => {
      const panel = panels.get(dropdown);
      const summary = dropdown.querySelector('summary');
      if (!panel) return;

      if (dropdown.open) {
        closeOthers(dropdown);
        panel.hidden = false;
        schedule(() => alignPanel(dropdown, panels));
      } else {
        hidePanel(panel);
      }

      if (summary) {
        summary.setAttribute('aria-expanded', dropdown.open ? 'true' : 'false');
      }
    });

    const panel = panels.get(dropdown);
    panel?.querySelectorAll('.tool').forEach(button => {
      button.addEventListener('click', () => {
        dropdown.open = false;
        dropdown.querySelector('summary')?.focus();
      });
    });
  });
}

function bindGlobalHandlers(dropdowns, panels, schedule) {
  document.addEventListener('click', event => {
    if (dropdowns.some(dd => dd.contains(event.target))) {
      return;
    }
    if (
      Array.from(panels.values()).some(
        panel => panel.contains(event.target instanceof Node ? event.target : null),
      )
    ) {
      return;
    }
    dropdowns.forEach(dd => {
      dd.open = false;
      const panel = panels.get(dd);
      if (panel) hidePanel(panel);
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    dropdowns.forEach(dd => {
      if (!dd.open) return;
      dd.open = false;
      const panel = panels.get(dd);
      if (panel) hidePanel(panel);
      dd.querySelector('summary')?.focus();
    });
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      if (!dropdowns.some(dd => dd.open)) return;
      schedule(() => {
        dropdowns.forEach(dd => {
          if (dd.open) alignPanel(dd, panels);
        });
      });
    });
  }
}

export function initToolDropdowns() {
  const dropdowns = Array.from(document.querySelectorAll('.tool-dropdown'));
  if (!dropdowns.length) return;

  const dropdownLayer = ensureDropdownLayer();
  if (!dropdownLayer) return;
  const panels = new Map();

  dropdowns.forEach((dropdown, index) => {
    const panel = dropdown.querySelector('.tool-dropdown-panel');
    const summary = dropdown.querySelector('summary');
    if (!(panel instanceof HTMLElement)) return;
    const inlineMode = dropdown.dataset.inline === 'true';

    const panelId = panel.id || `toolDropdownPanel-${index + 1}`;
    panel.id = panelId;
    dropdown.dataset.dropdownPanel = panelId;
    panels.set(dropdown, panel);

    if (summary) {
      summary.setAttribute('aria-controls', panelId);
      summary.setAttribute('aria-expanded', 'false');
    }

    panel.hidden = true;

    if (!inlineMode) {
      dropdownLayer.appendChild(panel);
    }
  });

  if (!panels.size) return;

  const schedule = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb => setTimeout(cb, 16));

  bindToggleHandlers(dropdowns, panels, schedule);
  bindGlobalHandlers(dropdowns, panels, schedule);
}

