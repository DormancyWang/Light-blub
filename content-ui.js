(() => {
  function mount(hostId) {
    const host = document.createElement("div");
    host.id = hostId;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .toolbar {
          position: fixed; z-index: 2147483647; display: none; flex-direction: column;
          gap: 8px; padding: 9px; border: 1px solid #d7dce2; border-radius: 8px;
          background: #fff; box-shadow: 0 5px 20px #17202a2b;
          color: #202a34; font: 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          pointer-events: auto; white-space: nowrap;
        }
        .toolbar.visible { display: flex; }
        .toolbar-colors { display: flex; align-items: center; gap: 9px; }
        .swatch {
          width: 20px; height: 20px; padding: 0; border: 2px solid transparent;
          border-radius: 50%; cursor: pointer; box-sizing: border-box;
        }
        .swatch[aria-pressed="true"] { outline: 2px solid #334155; outline-offset: 2px; }
        .cancel {
          height: 30px; padding: 0 9px; border: 1px solid #d7dce2; border-radius: 5px;
          background: #fff; color: inherit; cursor: pointer; font: inherit;
        }
        .note {
          width: 100%; height: 30px; padding: 0 8px; border: 1px solid #d7dce2;
          border-radius: 5px; box-sizing: border-box; font: inherit;
        }
        .note-popover {
          position: fixed; z-index: 2147483647; display: none; width: min(320px, calc(100vw - 16px));
          padding: 12px; border: 1px solid #d7dce2; border-radius: 8px; box-sizing: border-box;
          background: #fff; box-shadow: 0 5px 20px #17202a2b; color: #202a34;
          font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .note-popover.visible { display: block; }
        .popover-note { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
        .popover-colors { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
        .note-color {
          width: 20px; height: 20px; padding: 0; border: 2px solid transparent;
          border-radius: 50%; cursor: pointer; box-sizing: border-box;
        }
        .note-color[aria-pressed="true"] { outline: 2px solid #334155; outline-offset: 2px; }
        .popover-editor {
          display: none; width: 100%; min-height: 76px; padding: 8px; resize: vertical;
          border: 1px solid #d7dce2; border-radius: 5px; box-sizing: border-box;
          color: inherit; font: inherit;
        }
        .note-popover.editing .popover-note,
        .note-popover.editing .edit-note,
        .note-popover.editing .delete-mark { display: none; }
        .note-popover.editing .popover-editor { display: block; }
        .popover-footer { display: flex; justify-content: flex-end; gap: 6px; margin-top: 9px; }
        .popover-action {
          padding: 4px 8px; border: 1px solid #d7dce2; border-radius: 5px;
          background: #fff; color: inherit; cursor: pointer; font: inherit;
        }
        .popover-action.save-note { border-color: #263746; background: #263746; color: #fff; }
        .popover-action.delete-mark {
          padding: 4px 8px; border: 1px solid #e2b9b4; border-radius: 5px;
          background: #fff; color: #9f3028; cursor: pointer; font: inherit;
        }
        .note-popover:not(.editing) .save-note,
        .note-popover:not(.editing) .cancel-edit { display: none; }
        @media (max-width: 560px) {
          .toolbar { max-width: calc(100vw - 16px); white-space: normal; }
        }
      </style>
      <div class="toolbar" role="toolbar" aria-label="文本标记工具">
        <div class="toolbar-colors" aria-label="选择标记颜色">
          <button class="swatch" data-color="yellow" aria-label="黄色" title="黄色" style="background:#ffe36e"></button>
          <button class="swatch" data-color="mint" aria-label="绿色" title="绿色" style="background:#9fe3c1"></button>
          <button class="swatch" data-color="coral" aria-label="珊瑚色" title="珊瑚色" style="background:#ffb6a6"></button>
          <button class="cancel" aria-label="关闭">取消</button>
        </div>
        <input class="note" type="text" maxlength="300" placeholder="添加文字笔记（可选）" aria-label="文字笔记">
      </div>
      <aside class="note-popover" role="group" aria-label="标记笔记">
        <div class="popover-colors" aria-label="修改标记颜色">
          <button class="note-color" data-color="yellow" aria-label="改为黄色" title="改为黄色" style="background:#ffe36e"></button>
          <button class="note-color" data-color="mint" aria-label="改为绿色" title="改为绿色" style="background:#9fe3c1"></button>
          <button class="note-color" data-color="coral" aria-label="改为珊瑚色" title="改为珊瑚色" style="background:#ffb6a6"></button>
        </div>
        <p class="popover-note"></p>
        <textarea class="popover-editor" maxlength="300" aria-label="编辑文字笔记"></textarea>
        <div class="popover-footer">
          <button class="popover-action edit-note">修改笔记</button>
          <button class="popover-action save-note">保存</button>
          <button class="popover-action cancel-edit">取消</button>
          <button class="popover-action delete-mark">删除标记</button>
        </div>
      </aside>`;
    document.documentElement.append(host);

    return {
      host,
      shadow,
      toolbar: shadow.querySelector(".toolbar"),
      noteInput: shadow.querySelector(".note"),
      notePopover: shadow.querySelector(".note-popover"),
      popoverEditor: shadow.querySelector(".popover-editor")
    };
  }

  globalThis.PageMarkerContentUI = { mount };
})();