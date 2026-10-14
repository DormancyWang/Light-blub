(() => {
  function create(hostId, colors) {
    const noteIndicatorStyle = document.createElement("style");
    noteIndicatorStyle.textContent = `
      .page-marker-highlight[data-has-note="true"] { position: relative; }
      .page-marker-highlight[data-has-note="true"]::after {
        position: absolute; top: -0.65em; right: -0.55em; z-index: 1;
        content: "\\1F4A1"; font: 11px/1 sans-serif; pointer-events: none;
      }
    `;
    document.documentElement.append(noteIndicatorStyle);

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

    function textNodesInRange(range) {
      const root = range.commonAncestorContainer;
      if (root.nodeType === Node.TEXT_NODE) return isIgnoredTextNode(root) ? [] : [root];

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const start = range.startContainer;
      walker.currentNode = start;
      let node = start.nodeType === Node.TEXT_NODE ? start : walker.nextNode();
      const nodes = [];
      while (node) {
        if (range.comparePoint(node, 0) === 1) break;
        try {
          if (!isIgnoredTextNode(node) && range.intersectsNode(node)) nodes.push(node);
        } catch {
        }
        node = walker.nextNode();
      }
      return nodes;
    }

    function textContext(node, offset, direction) {
      if (node.nodeType !== Node.TEXT_NODE) return "";
      const isPrefix = direction === "backward";
      let context = isPrefix ? node.nodeValue.slice(0, offset) : node.nodeValue.slice(offset);
      const root = document.body || document.documentElement;
      if (context.length < 40 && root.contains(node)) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        walker.currentNode = node;
        let adjacent;
        while (context.length < 40 && (adjacent = isPrefix ? walker.previousNode() : walker.nextNode())) {
          if (isIgnoredTextNode(adjacent)) continue;
          const remaining = 40 - context.length;
          const value = adjacent.nodeValue;
          context = isPrefix
            ? value.slice(-remaining) + context
            : context + value.slice(0, remaining);
        }
      }
      return isPrefix ? context.slice(-40) : context.slice(0, 40);
    }

    function quoteForRange(range) {
      return {
        text: range.toString(),
        prefix: textContext(range.startContainer, range.startOffset, "backward"),
        suffix: textContext(range.endContainer, range.endOffset, "forward")
      };
    }

    function updateNoteIndicator(annotation) {
      if (!annotation) return;
      const marks = [...document.querySelectorAll(".page-marker-highlight")]
        .filter((mark) => mark.dataset.markerId === annotation.id);
      marks.forEach((mark) => mark.removeAttribute("data-has-note"));
      if (annotation.note?.trim() && marks.length) {
        marks[marks.length - 1].dataset.hasNote = "true";
      }
    }

    function applyAnnotationStyle(mark, annotation) {
      mark.style.backgroundColor = colors[annotation.color] || colors.yellow;
      mark.style.backgroundImage = "none";
    }

    function wrapRange(range, annotation) {
      const nodes = textNodesInRange(range);
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
      updateNoteIndicator(annotation);
    }

    function unwrapAnnotation(id) {
      document.querySelectorAll(".page-marker-highlight").forEach((mark) => {
        if (mark.dataset.markerId !== id) return;
        const parent = mark.parentNode;
        mark.replaceWith(...mark.childNodes);
        parent.normalize();
      });
    }

    function buildTextIndex() {
      const nodes = textNodes();
      let joined = "";
      const offsets = [];
      for (const node of nodes) {
        offsets.push({ node, start: joined.length, end: joined.length + node.length });
        joined += node.nodeValue;
      }
      return { joined, offsets };
    }

    function findRange(annotation, textIndex) {
      const { joined, offsets } = textIndex;
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

    return {
      applyAnnotationStyle,
      buildTextIndex,
      findRange,
      quoteForRange,
      updateNoteIndicator,
      unwrapAnnotation,
      wrapRange
    };
  }

  globalThis.PageMarkerAnnotationDom = { create };
})();