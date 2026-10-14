# 架构重构说明

## 重构目标

将原有的混乱架构重构为清晰的分层架构，提高代码的可维护性、可测试性和性能。

## 旧架构的问题

### 1. 状态管理混乱
- 标注数据分散在多个地方
- DOM缓存和业务状态耦合
- 存储同步逻辑与UI逻辑混杂

### 2. 职责不清
- `annotation-dom.js` 既负责DOM操作，又负责文本匹配，还要管理缓存
- `content.js` 既处理事件，又直接操作DOM和存储
- 没有明确的数据流向

### 3. 性能问题
- 频繁使用 `querySelectorAll` 遍历整个DOM
- 没有元素缓存，每次操作都要重新查找
- 事件监听没有使用委托，效率低下

### 4. 难以测试和维护
- 紧耦合的代码难以单独测试
- 修改一处可能影响多处
- 缺少错误边界

## 新架构设计

### 分层结构

```
┌─────────────────────────────────────┐
│      content-new.js (控制层)         │
│   - 处理用户交互                      │
│   - 协调各层工作                      │
│   - 管理UI状态                        │
└──────────┬──────────────────────────┘
           │
    ┌──────┴──────┬──────────────┬──────────────┐
    │             │              │              │
┌───▼────┐  ┌────▼─────┐  ┌─────▼──────┐  ┌───▼────────┐
│ Store  │  │ Renderer │  │  Matcher   │  │     UI     │
│        │  │          │  │            │  │            │
│ 状态   │  │ DOM渲染  │  │ 文本匹配   │  │ Shadow DOM │
└────────┘  └──────────┘  └────────────┘  └────────────┘
```

### 核心模块

#### 1. AnnotationStore (annotation-store.js)
**职责：** 统一的状态管理中心

- 管理所有标注数据（使用 Map 存储，O(1) 查找）
- 处理 Chrome Storage 同步
- 提供观察者模式，通知状态变化
- 处理多标签页同步

**优势：**
- 单一数据源，状态可预测
- 通过事件通知实现松耦合
- 异步操作集中管理，避免竞态条件

#### 2. TextMatcher (text-matcher.js)
**职责：** 纯文本匹配工具

- 构建页面文本索引
- 根据 anchor 查找 Range
- 生成选区的 anchor（用于持久化）
- 获取文本上下文

**优势：**
- 纯函数式设计，无副作用
- 独立可测试
- 性能优化的文本查找算法

#### 3. AnnotationRenderer (annotation-renderer.js)
**职责：** DOM 渲染层

- 创建、更新、删除标记元素
- 维护 DOM 元素缓存（使用 Map + Set）
- 应用样式和笔记指示器
- 定期清理失效的缓存

**优势：**
- DOM 操作集中管理
- 元素缓存避免频繁查询
- 自动清理机制防止内存泄漏

#### 4. UIController (content-new.js)
**职责：** 用户交互控制

- 处理文本选择、工具栏、弹窗交互
- 订阅 Store 事件，响应状态变化
- 协调各层完成业务逻辑

**优势：**
- 清晰的事件处理流程
- 使用事件委托优化性能
- 错误处理和边界情况处理

## 关键改进

### 1. 性能优化

**DOM 查询优化：**
```javascript
// 旧代码：每次都遍历整个 DOM
document.querySelectorAll(".page-marker-highlight").forEach(mark => {
  if (mark.dataset.markerId === id) { /* ... */ }
});

// 新代码：使用缓存，O(1) 查找
const marks = this.markCache.get(id);
marks.forEach(mark => { /* ... */ });
```

**事件委托：**
```javascript
// 旧代码：直接监听所有标记
marks.forEach(mark => {
  mark.addEventListener('mouseover', handler);
});

// 新代码：事件委托
document.addEventListener('mouseover', (event) => {
  const mark = event.target.closest('.page-marker-highlight');
  if (mark) handler(mark, event);
});
```

**文本节点遍历优化：**
```javascript
// 使用 TreeWalker 的 acceptNode 过滤，减少不必要的遍历
const walker = document.createTreeWalker(
  root,
  NodeFilter.SHOW_TEXT,
  { acceptNode: (node) => this.isIgnoredNode(node) 
      ? NodeFilter.FILTER_REJECT 
      : NodeFilter.FILTER_ACCEPT 
  }
);
```

### 2. 数据流清晰

```
用户操作 → UIController → Store.update() → notify listeners
                              ↓
                         Renderer.update() → 更新 DOM
```

单向数据流，状态变化可追踪。

### 3. 错误处理

- Store 中的存储操作有完整的错误处理
- Renderer 检查 DOM 节点是否存在
- 观察者模式中的错误不会影响其他监听器

### 4. 内存管理

- 定期清理失效的 DOM 引用
- 删除标注时同步清理缓存
- 事件监听器使用弱引用模式

## 测试结果

所有原有测试通过：
- ✅ 标记普通文本
- ✅ 不标记 contenteditable 区域
- ✅ 使用上下文恢复标记

## 迁移说明

新架构向后兼容，现有的数据格式和存储结构保持不变。只需更新 manifest.json 中的文件引用：

```json
"js": [
  "annotation-store.js",
  "text-matcher.js", 
  "annotation-renderer.js",
  "content-ui.js",
  "content-new.js"
]
```

## 后续可以改进的方向

1. **虚拟滚动：** 当标记数量很大时，使用虚拟滚动优化渲染
2. **IndexedDB：** 对于大量标注，使用 IndexedDB 替代 Chrome Storage
3. **Web Worker：** 将文本索引构建移到 Worker 中
4. **增量更新：** 页面内容变化时，只更新受影响的部分
5. **TypeScript 重写：** 增加类型安全
6. **单元测试：** 为每个模块添加完整的单元测试
