# 🐰 糖果图库 My Photo Gallery

一个**卡通风格**的前后端在线图库应用。前端 Vue 3，后端 Node.js + Express，
数据库用 **Node 内置 SQLite**（`node:sqlite`，零原生依赖）。

## ✨ 核心功能

- 🖼️ **图片 / 视频上传**：多文件拖拽 / 选择，图片支持 jpg/png/gif/webp，视频支持 mp4/webm/ogg/mov（最大 100MB）
- 🌈 **画廊展示**：响应式网格（PC 4 列 / 平板 3 列 / 手机 1 列），视频 / 动图 / 静态图各自有专属角标
- 🔍 **大图预览**：点击图片弹卡通对话框，键盘 ← / → 切换、Esc 关闭
- 🔎 **图片缩放**：0.5x ~ 5x 范围，➕/➖ 按钮、滚轮以鼠标为锚点、双击切换 1x↔2x、拖动平移、键盘 `+`/`-`/`0` 快捷键
- ⬇️ **下载原图**：卡片悬浮按钮 + 预览框醒目按钮，保留中文文件名
- 🏷️ **分类管理**：增 / 删 / 改 / 颜色选择，删除前确认，关联图片时拒绝删除
- 👤 **多用户 + JWT**：注册 / 登录 / Token 鉴权 / 「记住我」自动登录 / bcrypt 加密
- ☁️ **存储可插拔**：默认本地磁盘，可一键切换到腾讯云 COS（`STORAGE_TYPE=cos`）
- 🎨 **卡通主题**：手绘风 emoji、粗描边、硬阴影、圆角、糖果配色

## 🧰 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 (Composition API) + Vite + Pinia + Vue Router + Axios |
| UI | Element Plus（深度覆盖 CSS 实现卡通主题） |
| 后端 | Node.js + Express + multer |
| 数据库 | Node 内置 `node:sqlite`（Node 22.5+，零外部依赖） |
| 进程管理 | `concurrently` 一键起前后端 |

> 💡 切换到 MySQL / MariaDB：只改 `server/db.js` 一个文件，路由层零改动。
> 💡 切换到腾讯云 COS：环境变量 `STORAGE_TYPE=cos` + 4 个 COS_* 变量，路由层零改动。

## 📁 项目结构

```
my-photo-gallery/
├── package.json                # 根，含 concurrently 脚本
├── .env.example                # 环境变量样板（无敏感值）
├── docker-compose.yml          # 一键起 server + client
├── .dockerignore
├── server/
│   ├── package.json
│   ├── Dockerfile              # node:22-alpine 多阶段
│   ├── index.js                # Express 路由
│   ├── db.js                   # ⭐ 数据库访问层（适配器模式）
│   ├── storage.js              # ⭐ 存储抽象层（Local / COS）
│   ├── db.sqlite               # SQLite 数据文件
│   └── uploads/                # 上传的文件（Local 模式）
└── client/
    ├── package.json
    ├── Dockerfile              # node build → nginx 托管
    ├── nginx.conf              # SPA fallback + /api、/uploads 反代
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.js
        ├── App.vue
        ├── router/index.js
        ├── stores/gallery.js       # Pinia store
        ├── styles/cartoon.css      # ⭐ 卡通主题全局样式
        ├── views/
        │   ├── GalleryView.vue     # 画廊
        │   ├── UploadView.vue      # 上传
        │   └── CategoryManage.vue  # 分类管理
        └── components/
            ├── ImageCard.vue
            └── AppHeader.vue
```

## 🚀 快速开始

```bash
# 1. 安装依赖（推荐用 pnpm，也可以用 npm/yarn）
npm install -g pnpm
pnpm install
pnpm --prefix server install
pnpm --prefix client install

# 2. 启动（同时拉起前后端）
pnpm run dev
```

然后访问：
- 前端：**http://localhost:5173**
- 后端 API：**http://localhost:3000**

第一次启动会自动：
- 创建 `server/db.sqlite` 数据文件
- 创建默认分类「未分类」
- 建好 `uploads/` 目录

## 🔌 API 路由

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/images?category=xxx` | 获取图片列表（可按分类筛选） |
| POST | `/api/upload` | 上传图片（multipart，字段 `files` + `originalName` + `categoryId`） |
| DELETE | `/api/images/:id` | 删除单张图片及文件 |
| GET | `/api/categories` | 获取所有分类 |
| POST | `/api/categories` | 新增分类 |
| PUT | `/api/categories/:id` | 修改分类 |
| DELETE | `/api/categories/:id` | 删除分类（有关联图片则 400） |

静态文件：`/uploads/<filename>`

## 🎨 卡通设计规范

- **配色**：浅黄 `#FFF9E6` / 浅粉 `#FFF0F5` 背景，糖果色点缀
- **描边**：`3-4px` 深褐 `#4A3B32` 实线
- **圆角**：`12-20px`
- **阴影**：`4px 4px 0 #4A3B32` 硬阴影模拟贴纸感
- **字体**：Nunito + ZCOOL KuaiLe（中文圆润字体）
- **图标**：Emoji 优先（☁️ 🖼️ ⬇️ 🏷️ 等）
- **动画**：hover 上跳 + 旋转，硬阴影变深

## 🔧 切换到 MySQL

修改 `server/db.js`：

```js
// 旧
const { DatabaseSync } = require('node:sqlite');

// 新
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: 'localhost', user: 'root',
  password: 'xxx', database: 'gallery'
});
```

`init()`、`getCategories()`、`addCategory()` 等方法签名不变，
上层 `index.js` 路由代码完全不用动。

## ☁️ 切换到腾讯云 COS

默认本地磁盘存储（`server/uploads/`）。要换成对象存储，只需环境变量：

```bash
# Windows PowerShell
$env:STORAGE_TYPE = "cos"
$env:COS_SECRET_ID = "AKIDxxxxxx"
$env:COS_SECRET_KEY = "xxxxxx"
$env:COS_BUCKET = "my-gallery-1250000000"   # 注意要带 -appId 后缀
$env:COS_REGION = "ap-guangzhou"
$env:COS_PREFIX = "gallery/"                # 可选，bucket 内的子目录前缀
pnpm run dev
```

启动日志会显示：
```
☁️  存储后端: 腾讯云 COS { type: 'cos', bucket: 'my-gallery-1250000000', region: 'ap-guangzhou', prefix: 'gallery/' }
```

桶需要设为**公有读**（在 COS 控制台 → 权限管理 → 公有读私有写），否则返回的 URL 浏览器访问会 403。
如需私有读 + 临时签名 URL，可扩展 `server/storage.js` 的 `getUrl(key, expires)`。

代码改动隔离在 `server/storage.js` 一个文件，`index.js` 路由层零改动。

## 🐳 Docker 部署

**前置**：装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)，启用 WSL2（Windows）。

```bash
# 1. 配环境变量
cp .env.example .env
# Windows: copy .env.example .env
# 编辑 .env：填 JWT_SECRET（必须改），如果要切 COS 也填 COS_* 那几行

# 2. 一键起
docker compose up -d --build

# 3. 看日志
docker compose logs -f server
docker compose logs -f client

# 4. 浏览器开 http://localhost
```

**端口**：
- 80 → 前端（nginx 静态 + SPA fallback + 反代 `/api`、`/uploads` 到后端）
- 3000 → 后端（直连调试用，生产可以删掉 compose 里的 `ports: 3000:3000`）

**数据持久化**（docker named volumes）：
- `candy-db` → `/app/db.sqlite`（SQLite 数据文件）
- `candy-uploads` → `/app/uploads`（本地上传的文件，切到 COS 后可删这个 volume）

**停 / 清**：
```bash
docker compose down            # 停容器，保留 volume
docker compose down -v         # 停容器 + 删 volume（连数据一起清！）
# 备份数据
docker run --rm -v candy-db:/data -v $(pwd):/backup alpine \
  cp /data/db.sqlite /backup/db-$(date +%Y%m%d).sqlite
```

**架构**：
```
浏览器 → :80 (nginx client) ──/api──→ :3000 (node server) ─→ SQLite + uploads/
                                  ──/uploads──→
```
两个容器在内部 `candy-net` 桥接网络里互通，外部只暴露 80（和可选 3000）。

## 📝 关键决策

- **为什么用 `node:sqlite` 而不是 better-sqlite3？** 零原生依赖，
  Windows + Node 24 上无预编译二进制也能跑，免编译。
- **为什么用适配器模式？** 以后切 MySQL / MariaDB 只改 `db.js`。
- **为什么 multer 文件名乱码？** 浏览器 multipart 的 filename 是 latin1 ，
  解决方案：前端把 `file.name` 作为 form 字段 `originalName` 单独传。
- **为什么不用全局低分辨率缩略图？** 当前直接用浏览器 `<img>` 缩放，
  图少够用；量大可加 `sharp` 做缩略图。
- **为什么 multer 用 memoryStorage？** 接住 buffer 后交给存储抽象层，
  本地 / COS 走完全相同的代码路径，路由层不必关心。

## 📜 License

MIT
# myimagelist
