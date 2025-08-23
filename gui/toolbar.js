export function initToolbar() {
  document.querySelectorAll('.tool').forEach((b) =>
    b.addEventListener('click', () => {
      if (window.selectTool) {
        window.selectTool(b.dataset.tool);
      }
    })
  );
}

export function updateToolbar(state) {
  // ここでは現在特別な処理は行っていません
}
