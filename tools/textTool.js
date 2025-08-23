      function makeTextTool(store) {
        // 空contenteditableに即キャレットを出すヘルパ
        function focusEditable(el) {
          el.focus();
          const r = document.createRange();
          r.selectNodeContents(el);
          r.collapse(true); // 先頭にキャレット
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        }

        return {
          id: "text",
          cursor: "text",
          onPointerDown(ctx, ev, eng) {
            // 既存エディタ確定→新規開始
            cancelTextEditing(true);

            const left = Math.floor(ev.img.x),
              top = Math.floor(ev.img.y);
            const editor = document.createElement("div");
            editor.className = "text-editor";
            editor.contentEditable = "true";

            // 画像座標で配置（editorLayerはtranslate+scale済み）
            editor.style.left = left + "px";
            editor.style.top = top + "px";
            editor.style.minWidth = "80px";

            // フォント設定
            const ff = document.getElementById("fontFamily").value;
            let fs = parseFloat(
              document.getElementById("fontSize").value || "24"
            );
            if (isNaN(fs)) fs = 24;
            editor.style.fontFamily = ff;
            editor.style.fontSize = fs + "px";
            editor.style.lineHeight = Math.round(fs * 1.4) + "px";
            editor.style.color = store.getState().primaryColor;

            // ★ 空だとキャレットが出ないブラウザがあるので <br> を入れる
            editor.innerHTML = "<br>";

            editorLayer.appendChild(editor);
            activeEditor = editor;
            editorLayer.style.pointerEvents = "auto";

            // Undo用スナップショット
            engine.beginStrokeSnapshot();

            // ★ pointerdown の処理が終わってからフォーカス/キャレットを当てる
            setTimeout(() => {
              focusEditable(editor);
            }, 0);

            // Enterで確定 / Escで取消（IMEはTextBox側が処理するのでここは単純に）
            const onKey = (e) => {
              const isIme =
                e.isComposing || e.key === "Process" || e.keyCode === 229;
              if (e.key === "Enter" && !e.shiftKey && !isIme) {
                e.preventDefault();
                cancelTextEditing(true);
                engine.requestRepaint();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelTextEditing(false);
                engine.requestRepaint();
              }
            };
            editor.addEventListener("keydown", onKey);
            editor._onKey = onKey;
          },
          onPointerMove() {},
          onPointerUp() {},
        };
      }
