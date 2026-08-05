# 糖果图库 · 配色精简方案

## 核心建议

把界面主色压缩到 **4 种**，去掉所有渐变和背景装饰点：

| 角色 | 色值 | 用途 |
|------|------|------|
| 奶油底 | `#FFF9E6` | 页面背景 |
| 卡片白 | `#FFFFFF` | 卡片、弹窗、按钮默认态 |
| 点缀粉 | `#FFADAD` | 主按钮、选中态、Logo、强调 |
| 描边/文字 | `#4A3B32` | 所有描边、标题、正文 |

> 深色文字建议用 `#2E2019`（已存在的 `--cartoon-ink`），可视作棕色的深色调，不额外算一种颜色。

## 原型文件

- **`color-variants-index.html`**：4 个风格版本的索引对比页，点击卡片进入对应原型。
- **`color-cartoon-angular.html`**：版本 0 · 卡通 Angular，胶带贴纸 + 偏移硬阴影 + 波点背景 + 小圆角。
- **`color-variant-sketch.html`**：版本 A · 手绘涂鸦，笔记本网格背景 + 蓝色点缀 + 虚线边框。
- **`color-variant-pixel.html`**：版本 B · 复古像素，零圆角 + 4px 粗描边 + 棋盘格背景。
- **`color-variant-collage.html`**：版本 C · 剪纸拼贴，错位阴影 + 胶带 + 薄荷绿点缀 + 波点背景。
- **`color-restricted.html`**：左右对照原型，默认展示改后纯平色版本。
- **`color-flat-only.html`**：纯平 4 色版完整原型，全程 0 渐变。

## 当前问题统计

- `client/src/styles/cartoon.css` 中定义了 11 个糖果色变量。
- 代码中实际出现约 30+ 个不同色值（含渐变插值、半透明）。
- 渐变重灾区：
  - 通用按钮 `.cartoon-btn`（黄渐变）
  - Element Plus 按钮（蓝/绿/粉/黄渐变）
  - 对话框头部（粉渐变）
  - 上传拖拽区（粉黄渐变）
  - 进度条（四色渐变）
  - 页面 body 背景（4 层径向渐变装饰点）

## 需要修改的文件

### 1. `client/src/styles/cartoon.css`

```css
:root {
  --cartoon-bg: #FFF9E6;
  --cartoon-brown: #4A3B32;
  --cartoon-ink: #2E2019;
  --cartoon-accent: #FFADAD;
  --cartoon-white: #FFFFFF;
}

body {
  background-color: var(--cartoon-bg);
  /* 删除 radial-gradient 装饰点 */
}

.cartoon-btn {
  background: var(--cartoon-white);
}
.cartoon-btn.primary {
  background: var(--cartoon-accent);
}

.el-button--primary { background: var(--cartoon-accent) !important; }
.el-button--success { background: var(--cartoon-white) !important; }
.el-button--danger  { background: var(--cartoon-white) !important; }
.el-button--warning { background: var(--cartoon-white) !important; }

.el-dialog__header {
  background: var(--cartoon-white) !important;
}

.el-upload-dragger {
  background: var(--cartoon-white) !important;
}
.el-upload-dragger:hover {
  background: var(--cartoon-bg) !important;
}

.el-progress-bar__inner {
  background: var(--cartoon-accent) !important;
}
```

### 2. `client/src/components/AppHeader.vue`

头部背景从粉渐变改成纯白或奶油：

```css
.app-header {
  background: var(--cartoon-white);
}
```

### 3. `client/src/components/ImageCard.vue`

- 卡片缩略图占位背景从渐变改成 `--cartoon-bg`。
- 媒体类型角标统一用白底 + 粉强调，不再用多色渐变。

### 4. `client/src/views/GalleryView.vue`

- 预览弹窗头部去掉渐变。
- 空状态/骨架屏 shimmer 用单色调 shimmer（`#FFF9E6 → #FFF0F5 → #FFF9E6`）。

### 5. `client/src/views/UploadView.vue`

- 上传区背景去掉渐变，用纯色白底，hover 用奶油底。

## 可以保留的例外

1. **分类管理色板**：用户自定义分类颜色是功能色，不是界面主色，8 色色板可以保留。
2. **状态提示**：成功/警告/错误消息提示如果统一成单色会削弱语义，建议保留小幅差异或用图标区分。
3. **插画与 emoji**：空状态、吉祥物、emoji 可以多彩，反而能凸显「内容多彩、界面克制」的层次感。

## 视觉收益

- 页面焦点从「颜色装饰」回到「图片内容」。
- 粗描边 + 少色更有贴纸感，不会显得廉价。
- 新增组件不再纠结配色，开发维护成本更低。
- 可访问性提升：颜色语义明确（粉 = 主要/选中，棕 = 结构）。
