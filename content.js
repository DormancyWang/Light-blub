(() => {
  const hostId = "page-marker-notes-host";
  if (document.getElementById(hostId)) return;

  const storageKey = `page-marker:${location.origin}${location.pathname}${location.search}`;
  const colors = {
    yellow: "#ffe36e",
    mint: "#9fe3c1",
    coral: "#ffb6a6"
  };
  let annotations = [];
  let activeRange = null;
  let activeColor = "yellow";
  let popoverTargetId = null;
  let hidePopoverTimer = 0;

  async function withStorage(operation) {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.id) return null;
      return await operation();
    } catch (error) {
      if (error instanceof Error && error.message.includes("Extension context invalidated")) return null;
      throw error;
    }
  }

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

  const toolbar = shadow.querySelector(".toolbar");
  const noteInput = shadow.querySelector(".note");
  const notePopover = shadow.querySelector(".note-popover");
  const popoverEditor = shadow.querySelector(".popover-editor");
  const getSelection = () => window.getSelection();

  function isIgnoredTextNode(node) {
    const parent = node.parentElement;
    return !parent || parent.closest(`#${hostId}, script, style, noscript, textarea, input, select, option, [contenteditable="true"]`);
  }

  function textNodes() {
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!isIgnoredTextNode(node)) nodes.push(node);
    }
    return nodes;
  }

  function quoteForRange(range) {
    const text = range.toString();
    const nodes = textNodes();
    let joined = "";
    let index = -1;
    for (const node of nodes) {
      if (node === range.startContainer) index = joined.length + range.startOffset;
      joined += node.nodeValue;
    }
    if (index < 0 || joined.slice(index, index + text.length) !== text) index = joined.indexOf(text);
    if (index < 0) return { text, prefix: "", suffix: "" };
    return {
      text,
      prefix: joined.slice(Math.max(0, index - 40), index),
      suffix: joined.slice(index + text.length, index + text.length + 40)
    };
  }

  function wrapRange(range, annotation) {
    const nodes = textNodes().filter((node) => {
      try { return range.intersectsNode(node); } catch { return false; }
    });
    for (const node of nodes) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.length;
      if (end <= start) continue;
      const selected = node.splitText(start);
      selected.splitText(end - start);
      const mark = document.createElement("span");
      mark.className = "page-marker-highlight";
      mark.dataset.markerId = annotation.id;
      applyAnnotationStyle(mark, annotation);
      selected.parentNode.insertBefore(mark, selected);
      mark.append(selected);
    }
  }

  function applyAnnotationStyle(mark, annotation) {
    mark.style.backgroundColor = colors[annotation.color] || colors.yellow;
    mark.style.backgroundImage = "none";
  }

  async function updateAnnotationColor(color) {
    if (!popoverTargetId) return;
    annotations = annotations.map((item) => item.id === popoverTargetId ? { ...item, color } : item);
    const annotation = annotations.find((item) => item.id === popoverTargetId);
    document.querySelectorAll(".page-marker-highlight").forEach((mark) => {
      if (mark.dataset.markerId === popoverTargetId) applyAnnotationStyle(mark, annotation);
    });
    notePopover.querySelectorAll(".note-color").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.color === color));
    });
    await withStorage(() => chrome.storage.local.set({ [storageKey]: annotations }));
  }

  function unwrapAnnotation(id) {
    document.querySelectorAll(".page-marker-highlight").forEach((mark) => {
      if (mark.dataset.markerId !== id) return;
      const parent = mark.parentNode;
      mark.replaceWith(...mark.childNodes);
      parent.normalize();
    });
  }

  function hideNotePopover() {
    if (notePopover.classList.contains("editing")) return;
    notePopover.classList.remove("visible");
    popoverTargetId = null;
  }

  function showNotePopover(mark, pointer) {
    const annotation = annotations.find((item) => item.id === mark.dataset.markerId);
    if (!annotation) return;
    clearTimeout(hidePopoverTimer);
    popoverTargetId = annotation.id;
    shadow.querySelector(".popover-note").textContent = annotation.note || "没有附加笔记。";
    notePopover.querySelectorAll(".note-color").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.color === annotation.color));
    });
    if (!notePopover.classList.contains("editing")) popoverEditor.value = annotation.note || "";
    notePopover.classList.add("visible");
    const bounds = notePopover.getBoundingClientRect();
    const gap = 12;
    let left = pointer.clientX + gap;
    let top = pointer.clientY + gap;
    if (left + bounds.width + 8 > innerWidth) left = pointer.clientX - bounds.width - gap;
    if (top + bounds.height + 8 > innerHeight) top = pointer.clientY - bounds.height - gap;
    left = Math.max(8, Math.min(left, innerWidth - bounds.width - 8));
    top = Math.max(8, Math.min(top, innerHeight - bounds.height - 8));
    notePopover.style.left = `${left}px`;
    notePopover.style.top = `${top}px`;
  }

  function findRange(annotation) {
    const nodes = textNodes();
    let joined = "";
    const offsets = [];
    for (const node of nodes) {
      offsets.push({ node, start: joined.length, end: joined.length + node.length });
      joined += node.nodeValue;
    }
    let from = 0;
    while (from < joined.length) {
      const index = joined.indexOf(annotation.text, from);
      if (index < 0) return null;
      const prefix = joined.slice(Math.max(0, index - annotation.prefix.length), index);
      const suffix = joined.slice(index + annotation.text.length, index + annotation.text.length + annotation.suffix.length);
      if (prefix === annotation.prefix && suffix === annotation.suffix) {
        const start = offsets.find((item) => index >= item.start && index < item.end);
        const end = [...offsets].reverse().find((item) => index + annotation.text.length > item.start && index + annotation.text.length <= item.end);
        if (!start || !end) return null;
        const range = document.createRange();
        range.setStart(start.node, index - start.start);
        range.setEnd(end.node, index + annotation.text.length - end.start);
        return range;
      }
      from = index + annotation.text.length;
    }
    return null;
  }

  function hideToolbar() {
    toolbar.classList.remove("visible");
    activeRange = null;
  }

  async function saveAnnotation(color) {
    if (!activeRange || !activeRange.toString().trim()) return;
    const anchor = quoteForRange(activeRange);
    const annotation = {
      ...anchor,
      id: crypto.randomUUID(),
      color,
      note: noteInput.value.trim()
    };
    wrapRange(activeRange, annotation);
    annotations.push(annotation);
    await withStorage(() => chrome.storage.local.set({ [storageKey]: annotations }));
    getSelection()?.removeAllRanges();
    noteInput.value = "";
    hideToolbar();
  }

  function showToolbar(range, pointer) {
    activeRange = range.cloneRange();
    const rect = range.getBoundingClientRect();
    toolbar.classList.add("visible");
    const bounds = toolbar.getBoundingClientRect();
    const anchorX = pointer?.clientX ?? rect.right;
    const anchorY = pointer?.clientY ?? rect.bottom;
    let left = anchorX + 12;
    let top = anchorY + 12;
    if (left + bounds.width + 8 > innerWidth) left = anchorX - bounds.width - 12;
    if (top + bounds.height + 8 > innerHeight) top = anchorY - bounds.height - 12;
    left = Math.max(8, Math.min(left, innerWidth - bounds.width - 8));
    top = Math.max(8, Math.min(top, innerHeight - bounds.height - 8));
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }

  document.addEventListener("mouseup", (event) => {
    if (event.composedPath().includes(host)) return;
    const selection = getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      hideToolbar();
      return;
    }
    const range = selection.getRangeAt(0);
    if (host.contains(range.commonAncestorContainer)) return;
    showToolbar(range, event);
  });

  document.addEventListener("keyup", (event) => {
    if (event.composedPath().includes(host)) return;
    const selection = getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) showToolbar(selection.getRangeAt(0));
  });

  toolbar.querySelectorAll(".swatch").forEach((button) => {
    button.addEventListener("click", async () => {
      activeColor = button.dataset.color;
      await saveAnnotation(activeColor);
    });
  });
  shadow.querySelector(".cancel").addEventListener("click", hideToolbar);
  document.addEventListener("mouseover", (event) => {
    const mark = event.target.closest?.(".page-marker-highlight");
    if (mark && (!notePopover.classList.contains("editing") || mark.dataset.markerId === popoverTargetId)) showNotePopover(mark, event);
  });
  document.addEventListener("mouseout", (event) => {
    const mark = event.target.closest?.(".page-marker-highlight");
    if (!mark || (event.relatedTarget instanceof Node && mark.contains(event.relatedTarget))) return;
    hidePopoverTimer = setTimeout(hideNotePopover, 180);
  });
  notePopover.addEventListener("mouseenter", () => clearTimeout(hidePopoverTimer));
  notePopover.addEventListener("mouseleave", () => {
    hidePopoverTimer = setTimeout(hideNotePopover, 180);
  });
  notePopover.querySelectorAll(".note-color").forEach((button) => {
    button.addEventListener("click", () => updateAnnotationColor(button.dataset.color));
  });
  shadow.querySelector(".edit-note").addEventListener("click", () => {
    const annotation = annotations.find((item) => item.id === popoverTargetId);
    if (!annotation) return;
    popoverEditor.value = annotation.note || "";
    notePopover.classList.add("editing");
    popoverEditor.focus();
  });
  shadow.querySelector(".cancel-edit").addEventListener("click", () => {
    const annotation = annotations.find((item) => item.id === popoverTargetId);
    popoverEditor.value = annotation?.note || "";
    notePopover.classList.remove("editing");
  });
  shadow.querySelector(".save-note").addEventListener("click", async () => {
    if (!popoverTargetId) return;
    const id = popoverTargetId;
    const note = popoverEditor.value.trim();
    annotations = annotations.map((item) => item.id === id ? { ...item, note } : item);
    shadow.querySelector(".popover-note").textContent = note || "没有附加笔记。";
    notePopover.classList.remove("editing");
    await withStorage(() => chrome.storage.local.set({ [storageKey]: annotations }));
  });
  shadow.querySelector(".delete-mark").addEventListener("click", async () => {
    if (!popoverTargetId) return;
    const deletedId = popoverTargetId;
    annotations = annotations.filter((item) => item.id !== deletedId);
    unwrapAnnotation(deletedId);
    notePopover.classList.remove("editing");
    hideNotePopover();
    if (annotations.length) {
      await withStorage(() => chrome.storage.local.set({ [storageKey]: annotations }));
    } else {
      await withStorage(() => chrome.storage.local.remove(storageKey));
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[storageKey]) return;
    const nextAnnotations = changes[storageKey].newValue || [];
    const nextIds = new Set(nextAnnotations.map((item) => item.id));
    for (const annotation of annotations) {
      if (!nextIds.has(annotation.id)) unwrapAnnotation(annotation.id);
    }
    if (popoverTargetId && !nextIds.has(popoverTargetId)) {
      notePopover.classList.remove("editing");
      hideNotePopover();
    }
    annotations = nextAnnotations;
    const activeAnnotation = annotations.find((item) => item.id === popoverTargetId);
    if (activeAnnotation) {
      shadow.querySelector(".popover-note").textContent = activeAnnotation.note || "没有附加笔记。";
      notePopover.querySelectorAll(".note-color").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.color === activeAnnotation.color));
      });
      if (!notePopover.classList.contains("editing")) popoverEditor.value = activeAnnotation.note || "";
    }
  });

  withStorage(() => chrome.storage.local.get({ [storageKey]: [] })).then((result) => {
    if (!result) return;
    annotations = result[storageKey];
    for (const annotation of annotations) {
      const range = findRange(annotation);
      if (range) wrapRange(range, annotation);
    }
  });
})();