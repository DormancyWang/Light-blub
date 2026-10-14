(() => {
  /**
   * AnnotationStore - 统一的状态管理中心
   * 职责：管理所有标注数据、处理存储同步、通知观察者
   */
  class AnnotationStore {
    constructor(storageKey) {
      this.storageKey = storageKey;
      this.annotations = new Map(); // id -> annotation
      this.listeners = new Set();
      this.syncInProgress = false;
    }

    // 观察者模式
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notify(event) {
      this.listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error("Listener error:", error);
        }
      });
    }

    // 添加标注
    async add(annotation) {
      this.annotations.set(annotation.id, annotation);
      await this.persist();
      this.notify({ type: "added", annotation });
    }

    // 更新标注
    async update(id, updates) {
      const annotation = this.annotations.get(id);
      if (!annotation) return;
      const updated = { ...annotation, ...updates };
      this.annotations.set(id, updated);
      await this.persist();
      this.notify({ type: "updated", annotation: updated, changes: updates });
    }

    // 删除标注
    async remove(id) {
      const annotation = this.annotations.get(id);
      if (!annotation) return;
      this.annotations.delete(id);
      await this.persist();
      this.notify({ type: "removed", annotation });
    }

    // 获取标注
    get(id) {
      return this.annotations.get(id);
    }

    // 获取所有标注
    getAll() {
      return Array.from(this.annotations.values());
    }

    // 持久化到存储
    async persist() {
      if (this.syncInProgress) return;
      try {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
        const data = this.getAll();
        if (data.length > 0) {
          await chrome.storage.local.set({ [this.storageKey]: data });
        } else {
          await chrome.storage.local.remove(this.storageKey);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("Extension context invalidated")) {
          return;
        }
        console.error("Storage persist error:", error);
      }
    }

    // 从存储加载
    async load() {
      try {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
        const result = await chrome.storage.local.get({ [this.storageKey]: [] });
        const data = result[this.storageKey];
        this.annotations.clear();
        data.forEach((annotation) => this.annotations.set(annotation.id, annotation));
        this.notify({ type: "loaded", annotations: data });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Extension context invalidated")) {
          return;
        }
        console.error("Storage load error:", error);
      }
    }

    // 处理外部存储变化
    handleExternalChange(newValue) {
      this.syncInProgress = true;
      const newAnnotations = new Map((newValue || []).map((a) => [a.id, a]));
      const oldIds = new Set(this.annotations.keys());
      const newIds = new Set(newAnnotations.keys());

      // 找出删除的
      for (const id of oldIds) {
        if (!newIds.has(id)) {
          const annotation = this.annotations.get(id);
          this.annotations.delete(id);
          this.notify({ type: "removed", annotation, external: true });
        }
      }

      // 找出新增或更新的
      for (const [id, annotation] of newAnnotations) {
        const old = this.annotations.get(id);
        if (!old) {
          this.annotations.set(id, annotation);
          this.notify({ type: "added", annotation, external: true });
        } else if (JSON.stringify(old) !== JSON.stringify(annotation)) {
          this.annotations.set(id, annotation);
          this.notify({ type: "updated", annotation, external: true });
        }
      }

      this.syncInProgress = false;
    }
  }

  globalThis.PageMarkerAnnotationStore = AnnotationStore;
})();
