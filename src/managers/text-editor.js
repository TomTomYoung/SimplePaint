let activeEditor = null;

export function getActiveEditor() {
  return activeEditor;
}

export function isTextEditing() {
  return !!activeEditor;
}

export function createTextEditor(x, y, store, engine, editorLayer, layers, activeLayer) {
  const editor = document.createElement("div");
  editor.className = "text-editor";
  editor.contentEditable = "true";

  editor.style.left = Math.floor(x) + "px";
  editor.style.top = Math.floor(y) + "px";
  editor.style.minWidth = "80px";

  const ts = store.getToolState('text');
  const ff = ts.fontFamily;
  let fs = parseFloat(ts.fontSize || 24);
  if (isNaN(fs)) fs = 24;
  editor.style.fontFamily = ff;
  editor.style.fontSize = fs + 'px';
  editor.style.lineHeight = Math.round(fs * 1.4) + 'px';
  editor.style.color = ts.primaryColor;

  editor.innerHTML = "<br>";
  editorLayer.appendChild(editor);
  activeEditor = editor;
  editorLayer.style.pointerEvents = "auto";

  engine.beginStrokeSnapshot();

  function focusEditable(el) {
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
  setTimeout(() => focusEditable(editor), 0);

  const onKey = (e) => {
    const isIme = e.isComposing || e.key === "Process" || e.keyCode === 229;
    if (e.key === "Enter" && !e.shiftKey && !isIme) {
      e.preventDefault();
      cancelTextEditing(true, layers, activeLayer, engine);
      engine.requestRepaint();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelTextEditing(false, layers, activeLayer, engine);
      engine.requestRepaint();
    }
  };
  editor.addEventListener("keydown", onKey);
  editor._onKey = onKey;

  return editor;
}

export function cancelTextEditing(commit = false, layers, activeLayer, engine) {
  if (!activeEditor) return;

  if (commit) {
    const x = Math.round(parseFloat(activeEditor.style.left) || 0);
    const y = Math.round(parseFloat(activeEditor.style.top) || 0);
    const w = Math.ceil(activeEditor.offsetWidth);
    const h = Math.ceil(activeEditor.offsetHeight);

    const cs = getComputedStyle(activeEditor);
    const color = cs.color;
    const fontSizePx = parseFloat(cs.fontSize) || 16;
    const fontWeight = cs.fontWeight || "normal";
    const fontStyle = cs.fontStyle || "normal";
    const fontFamily = cs.fontFamily || "system-ui, sans-serif";
    const canvasFont = `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`;

    let lineHeightPx = parseFloat(cs.lineHeight);
    if (isNaN(lineHeightPx)) lineHeightPx = Math.round(fontSizePx * 1.4);

    const paddingX = 6,
      paddingY = 4;
    const lines = activeEditor.innerText.replace(/\r/g, "").split("\n");

    const ctx = layers[activeLayer].getContext("2d");
    ctx.save();
    ctx.font = canvasFont;
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    let ycur = y + paddingY;
    for (const line of lines) {
      ctx.fillText(line, x + paddingX, ycur);
      ycur += lineHeightPx;
    }
    ctx.restore();

    engine.expandPendingRectByRect(x, y, w, h);
    engine.finishStrokeToHistory();
  }

  if (activeEditor._onKey) {
    activeEditor.removeEventListener("keydown", activeEditor._onKey);
    delete activeEditor._onKey;
  }
  const editorLayer = activeEditor.parentElement;
  if (editorLayer) {
    editorLayer.removeChild(activeEditor);
    editorLayer.style.pointerEvents = "none";
  }
  activeEditor = null;
}
