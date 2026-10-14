(() => {
  /**
   * AnnotationRenderer - DOM渲染层
   * 职责：创建、更新、删除标记元素，维护DOM缓存
   */
  class AnnotationRenderer {
    constructor(hostId, colors, textMatcher) {
      this.hostId = hostId;
      this.colors = colors;
      this.textMatcher = textMatcher;
      this.markCache = new Map(); // annotationId -> Set<Element>
      this.initStyles();
    }

    // 初始化样式
    initStyles() {
      const style = document.createElement("style");
      style.textContent = `
        .page-marker-highlight {
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .page-marker-highlight:hover {
          opacity: 0.8;
        }
        .page-marker-highlight[data-has-note="true"] {
          position: relative;
        }
        .page-marker-highlight[data-has-note="true"]::after {
          position: absolute;
          top: -0.65em;
          right: -0.55em;
          z-index: 1;
          content: "\\1F4A1";
          font: 11px/1 sans-serif;
          pointer-events: none;
        }
      `;
      document.documentElement.append(style);
    }

    // 应用标注样式
    applyStyle(mark, annotation) {
      mark.style.backgroundColor = this.colors[annotation.color] || this.colors.yellow;
      mark.style.backgroundImage = "none";
    }

    // 创建标记元素
    createMark(annotation) {
      const mark = document.createElement("span");
      mark.className = "page-marker-highlight";
      mark.dataset.markerId = annotation.id;
      this.applyStyle(mark, annotation);
      return mark;
    }

    // 渲染标注到DOM
    render(annotation, range) {
      if (!range) return false;

      const nodes = this.textMatcher.getTextNodesInRange(range);
      if (nodes.length === 0) return false;

      const marks = new Set();

      for (const node of nodes) {
        const start = node === range.startContainer ? range.startOffset : 0;
        const end = node === range.endContainer ? range.endOffset : node.length;

        if (end <= start) continue;

        // 分割文本节点
        const selected = node.splitText(start);
        selected.splitText(end - start);

        // 创建并插入标记元素
        const mark = this.createMark(annotation);
        const parent = selected.parentNode;
        if (!parent) continue;

        parent.insertBefore(mark, selected);
        mark.append(selected);
        marks.add(mark);
      }

      this.markCache.set(annotation.id, marks);
      this.updateNoteIndicator(annotation);
      return true;
    }

    // 更新标注（颜色或笔记）
    update(annotation) {
      const marks = this.markCache.get(annotation.id);
      if (!marks) return;

      marks.forEach((mark) => {
        if (mark.isConnected) {
          this.applyStyle(mark, annotation);
        }
      });

      this.updateNoteIndicator(annotation);
    }

    // 移除标注
    remove(annotationId) {
      const marks = this.markCache.get(annotationId);
      if (!marks) return;

      marks.forEach((mark) => {
        if (!mark.isConnected) return;

        const parent = mark.parentNode;
        if (parent) {
          // 将标记元素替换为其子节点
          mark.replaceWith(...mark.childNodes);
          // 合并相邻的文本节点
          parent.normalize();
        }
      });

      this.markCache.delete(annotationId);
    }

    // 更新笔记指示器
    updateNoteIndicator(annotation) {
      const marks = this.markCache.get(annotation.id);
      if (!marks || marks.size === 0) return;

      // 移除所有标记的笔记指示器
      marks.forEach((mark) => {
        if (mark.isConnected) {
          mark.removeAttribute("data-has-note");
        }
      });

      // 如果有笔记，在最后一个标记上显示指示器
      if (annotation.note?.trim()) {
        const connectedMarks = [...marks].filter((m) => m.isConnected);
        if (connectedMarks.length > 0) {
          connectedMarks[connectedMarks.length - 1].dataset.hasNote = "true";
        }
      }
    }

    // 获取标注的所有标记元素
    getMarks(annotationId) {
      return this.markCache.get(annotationId) || new Set();
    }

    // 清理无效的标记（已从DOM中移除的）
    cleanup() {
      for (const [id, marks] of this.markCache.entries()) {
        const validMarks = new Set([...marks].filter((m) => m.isConnected));
        if (validMarks.size === 0) {
          this.markCache.delete(id);
        } else if (validMarks.size !== marks.size) {
          this.markCache.set(id, validMarks);
        }
      }
    }
  }

  globalThis.PageMarkerAnnotationRenderer = AnnotationRenderer;
})();
