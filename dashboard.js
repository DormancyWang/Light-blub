const storagePrefix = "page-marker:";
const groupsContainer = document.querySelector("#groups");
const countLabel = document.querySelector("#count");
const searchInput = document.querySelector("#search");
const markerColors = {
  yellow: "#ffe36e",
  mint: "#9fe3c1",
  coral: "#ffb6a6"
};
let pageGroups = [];
const expandedPages = new Set();

function pageDetails(urlText) {
  try {
    const url = new URL(urlText);
    return {
      domain: url.host,
      path: `${url.pathname}${url.search}` || "/",
      label: urlText
    };
  } catch {
    return { domain: urlText, path: "", label: urlText };
  }
}

async function removeAnnotation(storageKey, id) {
  const stored = await chrome.storage.local.get(storageKey);
  const remaining = (stored[storageKey] || []).filter((item) => item.id !== id);
  if (remaining.length) {
    await chrome.storage.local.set({ [storageKey]: remaining });
  } else {
    await chrome.storage.local.remove(storageKey);
  }
  await loadDashboard();
}

async function updateAnnotationNote(storageKey, id, note) {
  const stored = await chrome.storage.local.get(storageKey);
  const annotations = stored[storageKey] || [];
  if (!annotations.some((item) => item.id === id)) return;
  await chrome.storage.local.set({
    [storageKey]: annotations.map((item) => item.id === id ? { ...item, note } : item)
  });
  await loadDashboard();
}

function createItem(annotation, storageKey) {
  const item = document.createElement("li");
  item.className = "item";
  item.dataset.style = annotation.style;
  item.setAttribute("role", "treeitem");
  item.style.setProperty("--marker-color", markerColors[annotation.color] || markerColors.yellow);

  const excerpt = document.createElement("p");
  excerpt.className = "excerpt";
  excerpt.textContent = annotation.text;
  item.append(excerpt);

  if (annotation.note) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = annotation.note;
    item.append(note);
  }

  const editor = document.createElement("textarea");
  editor.className = "note-editor";
  editor.maxLength = 300;
  editor.rows = 3;
  editor.setAttribute("aria-label", "编辑文字笔记");
  editor.placeholder = "输入文字笔记";
  editor.value = annotation.note || "";
  item.append(editor);

  const editButton = document.createElement("button");
  editButton.className = "edit-note";
  editButton.type = "button";
  editButton.textContent = annotation.note ? "编辑笔记" : "添加笔记";
  editButton.addEventListener("click", () => {
    item.classList.add("editing");
    editor.value = annotation.note || "";
    editor.focus();
  });
  item.append(editButton);

  const noteActions = document.createElement("div");
  noteActions.className = "note-actions";
  const saveButton = document.createElement("button");
  saveButton.className = "save-note";
  saveButton.type = "button";
  saveButton.textContent = "保存";
  saveButton.addEventListener("click", () => updateAnnotationNote(storageKey, annotation.id, editor.value.trim()));
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "取消";
  cancelButton.addEventListener("click", () => {
    editor.value = annotation.note || "";
    item.classList.remove("editing");
  });
  noteActions.append(saveButton, cancelButton);
  item.append(noteActions);

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete";
  deleteButton.type = "button";
  deleteButton.textContent = "×";
  deleteButton.title = "删除此标记";
  deleteButton.setAttribute("aria-label", "删除此标记");
  deleteButton.addEventListener("click", () => removeAnnotation(storageKey, annotation.id));
  item.append(deleteButton);
  return item;
}

function renderDashboard() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const groups = pageGroups.map((group) => {
    const matchesUrl = group.url.toLocaleLowerCase().includes(query);
    const annotations = matchesUrl
      ? group.annotations
      : group.annotations.filter((annotation) => `${annotation.text}\n${annotation.note || ""}`.toLocaleLowerCase().includes(query));
    return { ...group, annotations };
  }).filter((group) => group.annotations.length > 0);

  const total = groups.reduce((sum, group) => sum + group.annotations.length, 0);
  countLabel.textContent = query
    ? `${total} 条匹配标记，分布在 ${groups.length} 个页面`
    : `${total} 条标记，分布在 ${groups.length} 个页面`;
  groupsContainer.replaceChildren();

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = query
      ? "没有找到匹配的片段或 URL。"
      : "还没有标记。打开文档页面，选中文字即可开始整理。";
    groupsContainer.append(empty);
    return;
  }

  const tree = document.createElement("ul");
  tree.className = "tree";
  tree.setAttribute("role", "tree");
  for (const group of groups) {
    const pageNode = document.createElement("li");
    pageNode.className = "tree-node";
    pageNode.setAttribute("role", "none");
    const details = document.createElement("details");
    details.className = "group";
    details.open = Boolean(query) || expandedPages.has(group.key);
    details.addEventListener("toggle", () => {
      if (details.open) expandedPages.add(group.key);
      else expandedPages.delete(group.key);
    });

    const summary = document.createElement("summary");
    const page = pageDetails(group.url);
    const domain = document.createElement("span");
    domain.className = "domain";
    domain.textContent = page.domain;
    const path = document.createElement("span");
    path.className = "page-path";
    path.textContent = page.path;
    path.title = page.label;
    const groupCount = document.createElement("span");
    groupCount.className = "group-count";
    groupCount.textContent = `${group.annotations.length} 条`;
    summary.append(domain, path, groupCount);
    details.append(summary);

    const items = document.createElement("ul");
    items.className = "items";
    items.setAttribute("role", "group");
    group.annotations.forEach((annotation) => items.append(createItem(annotation, group.key)));
    details.append(items);
    pageNode.append(details);
    tree.append(pageNode);
  }
  groupsContainer.append(tree);
}

async function loadDashboard() {
  const allStored = await chrome.storage.local.get(null);
  pageGroups = Object.entries(allStored)
    .filter(([key, value]) => key.startsWith(storagePrefix) && Array.isArray(value) && value.length)
    .map(([key, annotations]) => ({ key, url: key.slice(storagePrefix.length), annotations }))
    .sort((first, second) => first.url.localeCompare(second.url));
  renderDashboard();
}

searchInput.addEventListener("input", renderDashboard);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && Object.keys(changes).some((key) => key.startsWith(storagePrefix))) {
    loadDashboard();
  }
});

loadDashboard();