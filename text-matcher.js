(() => {
  /**
   * TextMatcher - 纯文本匹配工具
   * 职责：构建文本索引、查找Range、生成anchor
   */
  class TextMatcher {
    constructor(hostId) {
      this.hostId = hostId;
    }

    // 判断是否应该忽略的文本节点
    isIgnoredNode(node) {
      if (node.nodeType !== Node.TEXT_NODE) return true;
      const parent = node.parentElement;
      return !parent || parent.closest(
        `#${this.hostId}, script, style, noscript, textarea, input, select, option, [contenteditable="true"]`
      );
    }

    // 获取所有有效文本节点
    getTextNodes() {
      const walker = document.createTreeWalker(
        document.body || document.documentElement,
        NodeFilter.SHOW_TEXT,
        { acceptNode: (node) => this.isIgnoredNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }
      );
      const nodes = [];
      let node;
      while ((node = walker.nextNode())) {
        nodes.push(node);
      }
      return nodes;
    }

    // 获取Range中的文本节点
    getTextNodesInRange(range) {
      const root = range.commonAncestorContainer;

      // 特殊情况：root本身就是文本节点
      if (root.nodeType === Node.TEXT_NODE) {
        return this.isIgnoredNode(root) ? [] : [root];
      }

      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        { acceptNode: (node) => this.isIgnoredNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }
      );

      const start = range.startContainer;
      walker.currentNode = start;
      let node = start.nodeType === Node.TEXT_NODE ? start : walker.nextNode();
      const nodes = [];

      while (node) {
        // 超出range范围就停止
        if (range.comparePoint(node, 0) === 1) break;

        try {
          if (range.intersectsNode(node)) {
            nodes.push(node);
          }
        } catch {
          // intersectsNode可能在某些边界情况下抛出异常
        }

        node = walker.nextNode();
      }

      return nodes;
    }

    // 获取文本上下文（用于精确定位）
    getTextContext(node, offset, direction) {
      if (node.nodeType !== Node.TEXT_NODE) return "";

      const isPrefix = direction === "backward";
      let context = isPrefix
        ? node.nodeValue.slice(0, offset)
        : node.nodeValue.slice(offset);

      const root = document.body || document.documentElement;
      const contextLength = 40;

      // 如果当前节点的文本不够长，从相邻节点补充
      if (context.length < contextLength && root.contains(node)) {
        const walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT,
          { acceptNode: (node) => this.isIgnoredNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }
        );
        walker.currentNode = node;

        let adjacent;
        while (context.length < contextLength &&
               (adjacent = isPrefix ? walker.previousNode() : walker.nextNode())) {
          const remaining = contextLength - context.length;
          const value = adjacent.nodeValue;
          context = isPrefix
            ? value.slice(-remaining) + context
            : context + value.slice(0, remaining);
        }
      }

      return isPrefix ? context.slice(-contextLength) : context.slice(0, contextLength);
    }

    // 为Range生成anchor（用于持久化）
    createAnchor(range) {
      return {
        text: range.toString(),
        prefix: this.getTextContext(range.startContainer, range.startOffset, "backward"),
        suffix: this.getTextContext(range.endContainer, range.endOffset, "forward")
      };
    }

    // 构建文本索引（用于快速查找）
    buildTextIndex() {
      const nodes = this.getTextNodes();
      let joined = "";
      const offsets = [];

      for (const node of nodes) {
        const start = joined.length;
        const text = node.nodeValue;
        offsets.push({ node, start, end: start + text.length });
        joined += text;
      }

      return { joined, offsets };
    }

    // 根据anchor查找Range
    findRange(anchor, textIndex = null) {
      const index = textIndex || this.buildTextIndex();
      const { joined, offsets } = index;

      let searchFrom = 0;

      // 在拼接的文本中查找匹配
      while (searchFrom < joined.length) {
        const textIndex = joined.indexOf(anchor.text, searchFrom);
        if (textIndex < 0) return null;

        // 验证前后文是否匹配
        const prefixStart = Math.max(0, textIndex - anchor.prefix.length);
        const prefix = joined.slice(prefixStart, textIndex);
        const suffixEnd = textIndex + anchor.text.length + anchor.suffix.length;
        const suffix = joined.slice(textIndex + anchor.text.length, suffixEnd);

        if (prefix === anchor.prefix && suffix === anchor.suffix) {
          // 找到了匹配的文本，现在定位到具体的节点和偏移
          const startEntry = offsets.find((item) =>
            textIndex >= item.start && textIndex < item.end
          );
          const endIndex = textIndex + anchor.text.length;
          const endEntry = [...offsets].reverse().find((item) =>
            endIndex > item.start && endIndex <= item.end
          );

          if (!startEntry || !endEntry) return null;

          const range = document.createRange();
          range.setStart(startEntry.node, textIndex - startEntry.start);
          range.setEnd(endEntry.node, endIndex - endEntry.start);
          return range;
        }

        // 继续查找下一个匹配
        searchFrom = textIndex + anchor.text.length;
      }

      return null;
    }
  }

  globalThis.PageMarkerTextMatcher = TextMatcher;
})();
