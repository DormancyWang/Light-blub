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

  const { host, shadow, toolbar, noteInput, notePopover, popoverEditor } = PageMarkerContentUI.mount(hostId);
  const {
    applyAnnotationStyle,
    buildTextIndex,
    findRange,
    quoteForRange,
    updateNoteIndicator,
    unwrapAnnotation,
    wrapRange
  } = PageMarkerAnnotationDom.create(hostId, colors);
  const getSelection = () => window.getSelection();

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
    updateNoteIndicator(annotations.find((item) => item.id === id));
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
    annotations.forEach(updateNoteIndicator);
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
    const textIndex = buildTextIndex();
    const ranges = annotations.map((annotation) => [annotation, findRange(annotation, textIndex)]);
    for (const [annotation, range] of ranges) {
      if (range) wrapRange(range, annotation);
    }
  });
})();