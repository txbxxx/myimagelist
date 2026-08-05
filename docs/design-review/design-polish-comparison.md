# 糖果图库 · 细节优化对比

> 文件：`docs/design-review/design-polish-comparison.html`  
> 日期：2026-08-05  
> 背景：基于 `design-review/report.md` 与已落地的代码优化，仍有 4 处细节可以继续打磨。本文档说明每一处的问题、目标方案与预期收益。

---

## 1. 上传区 drag-over 反馈

### 现状
`UploadView.vue` 已使用 `el-upload` 的拖拽上传，但当用户把文件拖入区域时，上传区没有任何视觉变化，用户不确定系统是否识别到了拖拽。

### 目标
拖入文件时，上传区边框由虚线变实线、背景变为薄荷绿、整体轻微放大，给出明确反馈。

### 实现建议
在 `client/src/styles/cartoon.css` 或 `UploadView.vue` 的 `<style>` 中补充：

```css
.drop-zone .el-upload-dragger.is-dragover {
  border-style: solid;
  background: var(--cartoon-mint);
  transform: scale(1.02);
}
```

### 优先级
中

---

## 2. 编辑分类时色点加 aria-label

### 现状
新建分类的颜色选择器已经带有 `aria-label`，但分类列表进入编辑模式后，展开的颜色选择器里的色点没有标签，屏幕阅读器用户无法知道当前选中的颜色。

### 目标
编辑模式下每个颜色圆点都携带 `aria-label`，例如「颜色 柠檬黄，对比度 4.9 比 1」。

### 实现建议
在 `CategoryManage.vue` 的 `edit-colors` 循环中，给 `button.color-dot.small` 绑定与新建区一致的 `aria-label`：

```vue
<button
  v-for="c in palette"
  :key="c"
  class="color-dot small"
  :aria-label="`颜色 ${c}（${contrastLabel(c)}）`"
  ...
/>
```

### 优先级
低

---

## 3. 移动端顶部导航防换行

### 现状
`AppHeader.vue` 使用 `flex + space-between`，在 375px 等小屏下，右侧用户区（用户名 + 退出按钮）容易被挤到第二行，与装饰条贴得太近。

### 目标
小屏下保持 Logo、导航、用户操作在一行内稳定排列；若空间不足，优先让导航内部换行或收起用户区。

### 实现建议
在 `@media (max-width: 600px)` 中把 `.header-inner` 改为 grid 三列布局：

```css
@media (max-width: 600px) {
  .header-inner {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
  }
  .nav { justify-self: end; }
  .user-greeting { display: none; } /* 只保留退出按钮 */
}
```

更激进的方案：把用户区收进头像下拉菜单，导航使用 icon-only。

### 优先级
中

---

## 4. 页面术语统一

### 现状
- 画廊页标题：「我的糖果图库」
- 上传页标题：「把图片传上来吧～」
- 空态文案：「画廊还是空的～去上传第一张图吧！」

品牌名、页面名、提示语混用了不同风格，可爱但略显散乱。

### 目标
标题统一为功能名（画廊 / 上传图片 / 分类管理），空态保留可爱但减少无意义语气词。

### 建议文案

| 位置 | 当前 | 建议 |
|------|------|------|
| 画廊标题 | 我的糖果图库 | 画廊 |
| 上传标题 | 把图片传上来吧～ | 上传图片 |
| 空态 | 画廊还是空的～去上传第一张图吧！ | 还没有图片，去上传第一张吧 🐰 |

若希望保留品牌个性，可只定规则：页面标题 = 功能名，副标题/空态可以再活泼。

### 优先级
低

---

## 附录：对比原型使用方法

直接用浏览器打开 `design-polish-comparison.html`，每处改进都有「改前 / 改后」双栏展示，其中上传 drag-over 可以通过按钮模拟交互。
