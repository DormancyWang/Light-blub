(() => {
  const hostId = "page-marker-notes-host";
  if (document.getElementById(hostId)) return;

  const storageKey = `page-marker:${location.origin}${location.pathname}${location.search}`;
  const colors = {
    yellow: "#ffe36e",
    mint: "#9fe3c1",
    coral: "#ffb6a6"
  };

  // 初始化各层
  const store = new PageMarkerAnnotationStore(storageKey);
  const textMatcher = new PageMarkerTextMatcher(hostId);
  const renderer = new PageMarkerAnnotationRenderer(hostId, colors, textMatcher);
  const ui = PageMarkerContentUI.mount(hostId);

  // UI控制器状态
  let activeRange = null;
  let activeColor = "yellow";
  let activeAnnotationId = null;
  let hidePopoverTimer = 0;

  /**
   * 工具栏控制
   */
  function showToolbar(range, pointer) {
    activeRange = range.cloneRange();
    const rect = range.getBoundingClientRect();
    ui.toolbar.classList.add("visible");

    const bounds = ui.toolbar.getBoundingClientRect();
    const anchorX = pointer?.clientX ?? rect.right;
    const anchorY = pointer?.clientY ?? rect.bottom;

    let left = anchorX + 12;
    let top = anchorY + 12;

    // 边界检测
    if (left + bounds.width + 8 > innerWidth) {
      left = anchorX - bounds.width - 12;
    }
    if (top + bounds.height + 8 > innerHeight) {
      top = anchorY - bounds.height - 12;
    }

    left = Math.max(8, Math.min(left, innerWidth - bounds.width - 8));
    top = Math.max(8, Math.min(top, innerHeight - bounds.height - 8));

    ui.toolbar.style.left = `${left}px`;
    ui.toolbar.style.top = `${top}px`;
  }

  function hideToolbar() {
    ui.toolbar.classList.remove("visible");
    activeRange = null;
  }

  async function saveAnnotation() {
    if (!activeRange || !activeRange.toString().trim()) return;

    const anchor = textMatcher.createAnchor(activeRange);
    const annotation = {
      ...anchor,
      id: crypto.randomUUID(),
      color: activeColor,
      note: ui.noteInput.value.trim()
    };

    // 先渲染到DOM
    const success = renderer.render(annotation, activeRange);
    if (!success) {
      console.error("Failed to render annotation");
      return;
    }

    // 再保存到store
    await store.add(annotation);

    // 清理UI
    window.getSelection()?.removeAllRanges();
    ui.noteInput.value = "";
    hideToolbar();
  }

  /**
   * 弹窗控制
   */
  function showNotePopover(mark, pointer) {
    const annotationId = mark.dataset.markerId;
    const annotation = store.get(annotationId);
    if (!annotation) return;

    clearTimeout(hidePopoverTimer);
    activeAnnotationId = annotationId;

    // 更新内容
    ui.shadow.querySelector(".popover-note").textContent =
      annotation.note || "没有附加笔记。";

    // 更新颜色选择器
    ui.notePopover.querySelectorAll(".note-color").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.color === annotation.color)
      );
    });

    // 更新编辑器（如果不在编辑状态）
    if (!ui.notePopover.classList.contains("editing")) {
      ui.popoverEditor.value = annotation.note || "";
    }

    ui.notePopover.classList.add("visible");

    // 计算位置
    const bounds = ui.notePopover.getBoundingClientRect();
    const gap = 12;
    let left = pointer.clientX + gap;
    let top = pointer.clientY + gap;

    if (left + bounds.width + 8 > innerWidth) {
      left = pointer.clientX - bounds.width - gap;
    }
    if (top + bounds.height + 8 > innerHeight) {
      top = pointer.clientY - bounds.height - gap;
    }

    left = Math.max(8, Math.min(left, innerWidth - bounds.width - 8));
    top = Math.max(8, Math.min(top, innerHeight - bounds.height - 8));

    ui.notePopover.style.left = `${left}px`;
    ui.notePopover.style.top = `${top}px`;
  }

  function hideNotePopover() {
    if (ui.notePopover.classList.contains("editing")) return;
    ui.notePopover.classList.remove("visible");
    activeAnnotationId = null;
  }

  /**
   * 事件处理 - 文本选择
   */
  function handleTextSelection(event) {
    // 忽略UI内部的选择
    if (event && event.composedPath().includes(ui.host)) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      hideToolbar();
      return;
    }

    const range = selection.getRangeAt(0);
    // 确保选择不在UI内部
    if (ui.host.contains(range.commonAncestorContainer)) return;

    showToolbar(range, event);
  }

  document.addEventListener("mouseup", handleTextSelection);
  document.addEventListener("keyup", handleTextSelection);

  /**
   * 事件处理 - 工具栏按钮
   */
  ui.toolbar.querySelectorAll(".swatch").forEach((button) => {
    button.addEventListener("click", async () => {
      activeColor = button.dataset.color;
      await saveAnnotation();
    });
  });

  ui.shadow.querySelector(".cancel").addEventListener("click", hideToolbar);

  /**
   * 事件处理 - 标记悬停（使用事件委托）
   */
  document.addEventListener("mouseover", (event) => {
    const mark = event.target.closest?.(".page-marker-highlight");
    if (!mark) return;

    // 如果正在编辑其他标记，不显示
    if (
      ui.notePopover.classList.contains("editing") &&
      mark.dataset.markerId !== activeAnnotationId
    ) {
      return;
    }

    showNotePopover(mark, event);
  });

  document.addEventListener("mouseout", (event) => {
    const mark = event.target.closest?.(".page-marker-highlight");
    if (!mark) return;

    // 如果鼠标移到了标记的子元素，不隐藏
    if (event.relatedTarget instanceof Node && mark.contains(event.relatedTarget)) {
      return;
    }

    hidePopoverTimer = setTimeout(hideNotePopover, 180);
  });

  ui.notePopover.addEventListener("mouseenter", () => {
    clearTimeout(hidePopoverTimer);
  });

  ui.notePopover.addEventListener("mouseleave", () => {
    hidePopoverTimer = setTimeout(hideNotePopover, 180);
  });

  /**
   * 事件处理 - 弹窗操作
   */
  ui.notePopover.querySelectorAll(".note-color").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!activeAnnotationId) return;
      await store.update(activeAnnotationId, { color: button.dataset.color });
    });
  });

  ui.shadow.querySelector(".edit-note").addEventListener("click", () => {
    const annotation = store.get(activeAnnotationId);
    if (!annotation) return;

    ui.popoverEditor.value = annotation.note || "";
    ui.notePopover.classList.add("editing");
    ui.popoverEditor.focus();
  });

  ui.shadow.querySelector(".cancel-edit").addEventListener("click", () => {
    const annotation = store.get(activeAnnotationId);
    ui.popoverEditor.value = annotation?.note || "";
    ui.notePopover.classList.remove("editing");
  });

  ui.shadow.querySelector(".save-note").addEventListener("click", async () => {
    if (!activeAnnotationId) return;

    const note = ui.popoverEditor.value.trim();
    await store.update(activeAnnotationId, { note });

    ui.shadow.querySelector(".popover-note").textContent =
      note || "没有附加笔记。";
    ui.notePopover.classList.remove("editing");
  });

  ui.shadow.querySelector(".delete-mark").addEventListener("click", async () => {
    if (!activeAnnotationId) return;

    await store.remove(activeAnnotationId);
    ui.notePopover.classList.remove("editing");
    hideNotePopover();
  });

  /**
   * Store事件监听 - 响应状态变化
   */
  store.subscribe((event) => {
    const { type, annotation } = event;

    switch (type) {
      case "added":
        // 新增的标注已经在saveAnnotation中渲染了
        break;

      case "updated":
        renderer.update(annotation);
        // 如果当前正在查看这个标注，更新UI
        if (annotation.id === activeAnnotationId) {
          ui.notePopover.querySelectorAll(".note-color").forEach((button) => {
            button.setAttribute(
              "aria-pressed",
              String(button.dataset.color === annotation.color)
            );
          });
          if (!ui.notePopover.classList.contains("editing")) {
            ui.popoverEditor.value = annotation.note || "";
          }
        }
        break;

      case "removed":
        renderer.remove(annotation.id);
        // 如果正在查看被删除的标注，关闭弹窗
        if (annotation.id === activeAnnotationId) {
          ui.notePopover.classList.remove("editing");
          hideNotePopover();
        }
        break;

      case "loaded":
        // 页面加载时恢复标注
        const textIndex = textMatcher.buildTextIndex();
        event.annotations.forEach((annotation) => {
          const range = textMatcher.findRange(annotation, textIndex);
          if (range) {
            renderer.render(annotation, range);
          }
        });
        break;
    }
  });

  /**
   * 监听外部存储变化（多标签同步）
   */
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[storageKey]) return;
    store.handleExternalChange(changes[storageKey].newValue);
  });

  /**
   * 初始化加载
   */
  store.load();

  /**
   * 定期清理无效的DOM缓存
   */
  setInterval(() => {
    renderer.cleanup();
  }, 60000); // 每分钟清理一次
})();
