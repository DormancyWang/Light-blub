# browserNote - 网页标记扩展

## 技术栈
- 原生 JavaScript（无框架）
- Chrome Extension Manifest V3
- Web Components (Shadow DOM)
- Node.js (测试用)

## 开发命令
```bash
npm test           # 运行所有测试（使用 jsdom）
npm run lint       # 如果配置了 linter
```

## 架构设计

### 分层架构（2024重构后）
```
AnnotationStore (状态管理)
    ↓
TextMatcher (文本匹配) + AnnotationRenderer (DOM渲染)
    ↓
UIController (用户交互)
```

**加载顺序很重要：**
```json
"js": [
  "annotation-store.js",    // 必须最先加载
  "text-matcher.js",
  "annotation-renderer.js",
  "content-ui.js",
  "content-new.js"          // 控制器最后加载
]
```

### 核心模块职责
- `AnnotationStore`: 唯一的状态来源，使用观察者模式
- `TextMatcher`: 纯函数，负责文本索引和 Range 查找
- `AnnotationRenderer`: 管理 DOM 和缓存，不持有状态
- `content-new.js`: 协调各层，处理用户交互

## 编码约定

### 数据结构
```javascript
// Annotation 格式（不要改变，影响存储兼容性）
{
  id: string,           // UUID
  text: string,         // 选中的文本
  prefix: string,       // 前 40 字符上下文
  suffix: string,       // 后 40 字符上下文
  color: "yellow"|"mint"|"coral",
  note: string          // 可选笔记
}
```

### 样式规范
- 使用 Shadow DOM 隔离样式
- 颜色值必须与 colors 对象一致
- z-index: 2147483647 用于顶层 UI

### 事件处理
- 使用事件委托而不是直接绑定
- 所有 async 函数必须有错误处理
- Storage 操作必须通过 `withStorage()` 包装

## 测试要求

- 修改核心逻辑后必须运行 `npm test`
- 测试使用 jsdom 模拟浏览器环境
- 不要依赖真实的 Chrome API（测试中有 mock）

## 注意事项

### 文本节点处理
- 忽略以下节点：`script, style, noscript, textarea, input, select, option, [contenteditable="true"]`
- 必须检查节点的 `isConnected` 状态
- splitText 操作会改变 DOM 结构，注意缓存失效

### 性能关键点
- **禁止** 使用 `querySelectorAll(".page-marker-highlight")` 遍历整个 DOM
- **必须** 使用 `markCache` 进行 O(1) 查找
- TreeWalker 必须使用 acceptNode 过滤器

### 存储同步
- 使用 `chrome.storage.local`，不是 `sync`（避免配额问题）
- Storage key 格式：`page-marker:{origin}{pathname}{search}`
- 多标签同步通过 `storage.onChanged` 监听

### 兼容性
- 数据格式向后兼容，不要改变 annotation 的字段名
- 旧版本数据必须能在新版本中正常加载

## 禁止事项

- ❌ 不要在 Store 之外修改 annotations 数组
- ❌ 不要在 Renderer 中直接操作 Store
- ❌ 不要在测试中使用真实的 Chrome Storage
- ❌ 不要为了"优化"而过早引入复杂的库
- ❌ 不要修改已存在的 annotation 的 id、text、prefix、suffix

## 调试技巧

```javascript
// 查看当前所有标注
chrome.storage.local.get(null, console.log)

// 清除当前页面的标注
chrome.storage.local.remove(`page-marker:${location.origin}${location.pathname}${location.search}`)
```
