# 糖果图库 · 代码设计文档

> 🐰 A cartoon-style full-stack online photo gallery  
> Vue 3 + Node.js + SQLite + ffmpeg

| 项目 | 信息 |
|---|---|
| 文档版本 | v1.0 |
| 最后更新 | 2026-08-04 |
| 代码状态 | 核心功能完成，已具备生产部署雏形 |
| 维护者 | 项目所有者 |

---

## 1. 项目目标

一个**个人 / 小团队**使用的在线图库，重点诉求：

- 🎨 **好看**：卡通风格（圆角、阴影、手绘风图标、IP 角标）
- 🚀 **简单**：零原生依赖（不编译 sharp 之类）、单条命令启动
- 🔌 **可扩展**：存储后端可换（本地 → COS），数据库可换（SQLite → MySQL）
- 🛠️ **可运维**：崩溃后能补数据，跨存储迁移不丢图

### 非目标（明确不做）

- ❌ 大规模分布式（百万级图片）
- ❌ 实时协作 / 多端同步
- ❌ AI 标签、人脸识别等
- ❌ 商业化能力（付费、套餐）

---

## 2. 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│  浏览器 (Vue 3 SPA)                                           │
│  - Element Plus + 自定义卡通 CSS                              │
│  - Pinia (auth / gallery store)                              │
│  - Axios + JWT                                                │
└──────────────────────┬───────────────────────────────────────┘
                       │ HTTP/JSON
┌──────────────────────▼───────────────────────────────────────┐
│  Express (Node 22+)                                           │
│  - multer (内存存储)                                          │
│  - JWT 鉴权中间件                                             │
│  - 路由: /api/auth, /api/images, /api/upload, /api/categories │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  storage.js  │  │thumbnail.js  │  │  thumbnail-job   │  │
│  │  存储抽象层   │  │  ffmpeg 封装 │  │  缩略图任务编排  │  │
│  │  Local + COS  │  │  (spawn)     │  │  (图片/视频通用) │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │             │
│  ┌──────▼─────────────────▼────────────────────▼─────────┐  │
│  │  db.js (SQLite 适配层)                                 │  │
│  │  - schema 管理 + 自动 ALTER                            │  │
│  │  - users / categories / images 表                     │  │
│  │  - CRUD 全部封装                                       │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐   ┌─────▼─────┐  ┌─────▼──────┐
   │  本地盘  │   │ Tencent COS │  │  (未来可加) │
   │ uploads/ │   │  bucket    │  │  S3 / OSS  │
   └─────────┘   └────────────┘  └────────────┘
```

### 分层职责

| 层 | 职责 | 不知道的事 |
|---|---|---|
| **路由层** (index.js) | 解析 HTTP / 鉴权 / 调业务逻辑 / 返回 JSON | DB 细节、ffmpeg 命令、存储路径 |
| **业务层** (thumbnail-job / storage) | 业务规则（图片/视频不同流程、storage 派发） | HTTP 协议、SQL 语句 |
| **数据层** (db.js) | SQL 操作、schema 管理、字段映射 | 业务规则、HTTP |
| **外部工具** (ffmpeg/ffprobe) | 媒体处理 | 我们的 DB、HTTP |

---

## 3. 技术选型

| 维度 | 选择 | 原因 |
|---|---|---|
| **前端框架** | Vue 3 (Composition API) | 轻、响应式、跟 Element Plus 配套好 |
| **UI 库** | Element Plus + 自定义卡通 CSS | 组件全，卡通主题用 CSS 覆盖即可 |
| **图标** | @element-plus/icons-vue + @iconify/vue (Lucide) | EP 图标功能性强，Lucide 装饰性强 |
| **状态管理** | Pinia | Vue 3 官方推荐，比 Vuex 简洁 |
| **构建工具** | Vite | 快、Vue 3 原生支持 |
| **后端框架** | Express | 简单、文档多、跟 multer/jwt 生态好 |
| **数据库** | SQLite via `node:sqlite` | 零原生依赖（避开 better-sqlite3 编译问题） |
| **鉴权** | JWT + bcryptjs | 无状态、密码哈希安全 |
| **媒体处理** | ffmpeg / ffprobe 二进制 | 工业标准；不依赖 npm 包装库（fluent-ffmpeg deprecated） |
| **对象存储** | Tencent COS (cos-nodejs-sdk-v5) | 国内速度快、SDK 稳定 |
| **部署** | Docker (multi-stage) | ffmpeg 通过 BtbN/FFmpeg-Builds 拉静态二进制 |

### 为什么不用 better-sqlite3

`better-sqlite3` 是 Node 生态最常用的 SQLite 库，但它**需要原生编译**：
- Windows 需要 Visual Studio Build Tools
- macOS 需要 Xcode CLI
- Node 24 + better-sqlite3 11/13 **没有 prebuilt binaries**

→ 切换到 **Node 22.5+ 内置的 `node:sqlite`**，零编译、零依赖。代价是 API 更原始（无 `db.transaction()`），需要手动 `BEGIN/COMMIT/ROLLBACK`。

---

## 4. 目录结构

```
my-photo-gallery/
├── README.md                    # 用户文档（部署 + 使用）
├── doc/                         # 设计文档（这里）
│   └── DESIGN.md
├── package.json                 # 根：concurrently 启动前后端
├── .env.example                 # 环境变量模板
├── .dockerignore
├── docker-compose.yml           # 一键启动（server + client）
│
├── server/                      # Express 后端
│   ├── index.js                 # 入口：路由 + 中间件
│   ├── db.js                    # SQLite 适配层（~470 行）
│   ├── storage.js               # 存储抽象层（LocalStorage + CosStorage）
│   ├── thumbnail.js             # ffmpeg/ffprobe 封装
│   ├── thumbnail-job.js         # 缩略图任务编排（ensureThumbnail）
│   ├── rebuild-thumbnails.js    # 重建缩略图脚本
│   ├── package.json
│   ├── Dockerfile               # 多阶段：ffmpeg 静态二进制 + Node
│   ├── db.sqlite                # 自动生成
│   └── uploads/                 # 本地存储根目录
│       ├── *.jpg, *.png, ...    # 原图
│       └── thumbs/              # 视频缩略图（图片缩略图=原图，不另存）
│
└── client/                      # Vue 3 前端
    ├── package.json
    ├── vite.config.js
    ├── Dockerfile               # 多阶段：vite build → nginx
    ├── nginx.conf               # 反代 /api + /uploads 到 server
    ├── index.html
    └── src/
        ├── main.js
        ├── App.vue
        ├── router/index.js
        ├── stores/              # Pinia
        │   ├── auth.js
        │   └── gallery.js
        ├── styles/
        │   └── cartoon.css     # 卡通主题变量 + 工具类
        ├── views/              # 页面
        │   ├── GalleryView.vue
        │   ├── UploadView.vue
        │   ├── CategoryManage.vue
        │   └── LoginView.vue
        └── components/
            ├── AppHeader.vue
            └── ImageCard.vue
```

---

## 5. 数据模型

### 5.1 ER 概览

```
┌──────────┐         ┌──────────────┐         ┌──────────────┐
│  users   │ 1     * │ categories   │ 1     * │   images     │
│          │─────────│              │─────────│              │
│ id       │         │ id           │         │ id           │
│ username │         │ name         │         │ filename     │
│ password │         │ color        │         │ originalName │
│   _hash  │         │ user_id (FK) │         │ url          │
│ createdAt│         │ created_at   │         │ thumbnailUrl │
└──────────┘         └──────────────┘         │ size         │
                                                │ mimeType     │
                                                │ type         │  ← 'image' | 'video'
                                                │ width/height │
                                                │ durationSec  │
                                                │ storageType  │  ← 'local' | 'cos'
                                                │ category_id  │  (FK)
                                                │ user_id      │  (FK)
                                                │ uploaded_at  │
                                                └──────────────┘
```

### 5.2 Schema（SQLite）

```sql
-- 用户
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

-- 分类（每用户独立）
CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#FFD6A5',
  user_id    TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, name)              -- 同用户下分类名唯一
);

-- 图片/视频
CREATE TABLE images (
  id             TEXT PRIMARY KEY,
  filename       TEXT NOT NULL,
  original_name  TEXT NOT NULL,
  url            TEXT NOT NULL,
  thumbnail_url  TEXT,                 -- 图片=url；视频=ffmpeg 抽帧的 jpg
  size           INTEGER NOT NULL,
  mime_type      TEXT NOT NULL DEFAULT 'image/jpeg',
  type           TEXT NOT NULL DEFAULT 'image',  -- 'image' | 'video'
  width          INTEGER,
  height         INTEGER,
  duration_sec   REAL,                 -- 仅视频
  storage_type   TEXT NOT NULL DEFAULT 'local',  -- 'local' | 'cos'
  category_id    TEXT NOT NULL,
  user_id        TEXT,
  uploaded_at    INTEGER NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_images_category ON images(category_id);
CREATE INDEX idx_images_uploaded ON images(uploaded_at DESC);
CREATE INDEX idx_images_user     ON images(user_id);
```

### 5.3 schema 演进策略

**不用 migration 工具**，代码内 `init()` 自管：

```js
// db.js init()
const imageCols = new Set(db.prepare('PRAGMA table_info(images)').all().map(c => c.name));
const alterAdds = [
  ['thumbnail_url', 'TEXT'],
  ['width', 'INTEGER'],
  ['height', 'INTEGER'],
  ['duration_sec', 'REAL'],
  ['storage_type', "TEXT NOT NULL DEFAULT 'local'"],
];
for (const [col, type] of alterAdds) {
  if (!imageCols.has(col)) {
    db.exec(`ALTER TABLE images ADD COLUMN ${col} ${type}`);
  }
}
```

- ✅ 老库加列自动完成
- ✅ 新列加 `DEFAULT` 兼容老记录
- ⚠️ 缺点：删列、重命名不支持（对个人项目够用）

### 5.4 字段命名约定

| 层 | 命名风格 | 例 |
|---|---|---|
| DB (snake_case) | 贴近 SQL | `original_name`, `uploaded_at` |
| JS (camelCase) | 贴近 JS 习惯 | `originalName`, `uploadedAt` |
| API (JSON) | 同 JS | `originalName`, `uploadedAt` |

`db.js` 的所有查询负责转换，路由层只看到 camelCase。

---

## 6. 核心模块设计

### 6.1 存储抽象层 (`server/storage.js`)

**目标**：上层代码（路由、缩略图任务）不直接处理本地路径 / COS API，统一通过 `backend` 接口。

```js
class LocalStorage {
  type = 'local';
  async put(key, buffer, mime) { /* 写本地 */ return getUrl(key); }
  async delete(key) { /* 删本地文件 */ }
  async resolveLocalPath(key) { /* 给 ffmpeg 用的本地路径 */ }
  getUrl(key) { return `/uploads/${key}`; }
}

class CosStorage {
  type = 'cos';
  async put(key, buffer, mime) { /* putObject */ return getUrl(key); }
  async delete(key) { /* deleteObject */ }
  async resolveLocalPath(key) { /* 临时下载到 os.tmpdir() 后返回 */ }
  getUrl(key) { return `https://${bucket}.cos...`; }
}
```

#### 6.1.1 Storage Registry（混合存储核心）

为支持「先本地后切 COS」的场景，**同时持有多个 backend 实例**：

```js
const _registry = { local: null, cos: null };
function register(backend) { _registry[backend.type] = backend; }
function backendOf(type) { return _registry[type] || _registry.local; }
function getDefault() { /* 当前 STORAGE_TYPE 指向的 backend */ }
```

每条 `images` 记录带 `storage_type` 字段，路由按 `backendOf(record.storageType)` 派发操作。

#### 6.1.2 设计决策

- **不引入 BLOB / DB 存图**：保留文件系统 / 对象存储的成熟生态（CDN、备份、迁移）
- **URL 由 backend 决定**：DB 里存完整 URL（不是相对 key），前端无需关心来源
- **环境驱动配置**：`STORAGE_TYPE=cos` + `COS_SECRET_ID/KEY/BUCKET/REGION` 切到 COS
- **永远挂载本地静态目录**：即使当前默认是 COS，老的本地文件还能被 `/uploads/*` 服务

### 6.2 媒体处理 (`server/thumbnail.js`)

**封装 ffmpeg / ffprobe**，不依赖任何 npm 包装库（`fluent-ffmpeg` 已 deprecated）：

```js
function extractThumbnail(input, output, { seekSec = 0, width = 480 }) { /* spawn ffmpeg */ }
function probeMedia(path) { /* spawn ffprobe, 返回 {width, height, format, ...} */ }
```

#### 6.2.1 关键 bug 复盘

**`-ss 1` 对图片静默失败**：ffmpeg 对单帧输入做 `-ss 1` 时，会**跳到 1 秒（但只有 1 帧）**，exit code = 0 但不写文件。

```js
// 修复：-ss 只在 seekSec > 0 时加
const args = [
  '-y', '-loglevel', 'error',
  ...(seekSec > 0 ? ['-ss', String(seekSec)] : []),  // ← 关键
  '-i', inputPath,
  ...
];
```

调用方约定：
- 视频抽帧：传 `seekSec: 1`（避开黑屏开头）
- 图片缩放：不传 seekSec

#### 6.2.2 spawn vs exec

- `spawn` + 流式 stderr：ffmpeg 错误信息大（几百 KB），`exec` 缓存会爆
- 超时机制：30s `SIGKILL`
- ENOENT 兜底：dev 环境没装 ffmpeg 也不影响上传（缩略图跳过）

### 6.3 缩略图任务 (`server/thumbnail-job.js`)

**核心设计**：图片用原图当缩略图（不另存），视频 ffmpeg 抽帧。

```js
async function ensureThumbnail(db, item) {
  if (item.thumbnailUrl) return { ok: true, skipped: true };  // 已存在，跳过

  if (item.type === 'image') {
    // 图片：原图 = 缩略图
    db.updateImageMeta(item.id, item.userId, { thumbnailUrl: item.url });
    return { ok: true, reason: 'image uses original' };
  }

  if (item.type === 'video') {
    // 视频：ffmpeg 抽帧 → storage.put() 落存储
    const tmpPath = path.join(os.tmpdir(), `thumb-${nanoid(6)}.jpg`);
    try {
      await extractThumbnail(localPath, tmpPath, { seekSec: 1 });
      const buf = await fs.promises.readFile(tmpPath);
      const url = await backend.put(thumbKey, buf, 'image/jpeg');
      db.updateImageMeta(item.id, item.userId, { thumbnailUrl: url });
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  }
}
```

**为什么图片用原图**：
- 现代浏览器自动 `<img>` 缩放，原图展示性能够用
- 节省 CPU（不跑 ffmpeg 缩放）和磁盘
- 缺点：列表页加载大图耗流量（用 `loading="lazy"` + 缩略图列表分页解决）

### 6.4 鉴权 (`server/index.js` 路由 + bcrypt + jwt)

```js
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.slice(7);  // 去掉 "Bearer "
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}
```

- 密码：`bcryptjs.hash(pwd, 10)`
- Token：`jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' })`
- 前端：localStorage 存 token，每次请求 `Authorization: Bearer xxx`

**已知局限**：无 refresh token、无角色控制、登出只是前端删 token（JWT 本身无法失效）

### 6.5 上传流程

```
┌────────┐                                ┌────────┐
│ 浏览器 │  POST /api/upload (multipart)  │ 后端   │
└───┬────┘ ─────────────────────────────► └───┬────┘
    │                                        │
    │  1. multer 内存接收 (100MB 限制)        │
    │  2. fileFilter 校验 (mime + ext)        │
    │  3. storage.put(key, buffer, mime)      │  ← 同步：原图落存储
    │  4. db.addImages(items)                 │  ← 同步：DB 写入
    │  5. res.json({ ok, images })            │  ← 同步响应（不阻塞 thumbnail）
    │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
    │  6. 异步：probeMedia 补 width/height    │  ← fire-and-forget
    │  7. 异步：ensureThumbnail 处理 thumb     │
    │                                        │
    ▼                                        ▼
  收到 200                                   │
  刷新列表看图                                │
  缩略图稍后异步填 DB                          │
```

**几个关键点**：
- multer 用 **memoryStorage**（不写盘），由 storage 层决定
- 上传响应**不等缩略图**（用户体验：上传立刻能看原图）
- 缩略图失败**不影响数据完整性**（DB 已有记录，thumb 为 null 时前端 fallback 原图）
- 文件名：`{timestamp}-{nanoid(6)}.{ext}`，避免冲突
- 原始文件名走 `req.body.originalName`（绕开 multer latin1 编码 bug）

### 6.6 重建缩略图脚本 (`server/rebuild-thumbnails.js`)

```bash
# 干跑：只统计不补
pnpm rebuild:thumbs

# 真跑
pnpm rebuild:thumbs:force
# 或指定用户
node rebuild-thumbnails.js --user=u_xxx --force
```

实现核心：调 `db.getImagesMissingThumb()` 拿所有 thumbUrl IS NULL 的记录，逐个 `ensureThumbnail()`。

---

## 7. 关键设计决策

| 决策 | 原因 | 替代方案 |
|---|---|---|
| **node:sqlite** 取代 better-sqlite3 | 零原生编译，跨平台 | 接受原生编译复杂度 |
| **图片缩略图 = 原图** | 省 CPU / 磁盘 / 复杂度 | 全部 ffmpeg 缩放（增加延迟） |
| **storage_type 列** 支持混合存储 | 平滑迁移，兼容老数据 | 一次性迁移工具（不灵活） |
| **不存缩略图到 DB BLOB** | 保留 CDN / 备份生态 | DB 读写更快（但限制大） |
| **缩略图异步生成** | 不阻塞上传响应 | 同步生成（用户体验差） |
| **无 admin 角色** | 个人/小团队用不上 | 暂时不做 |
| **multer memoryStorage** | 灵活（再交给 storage 层） | diskStorage（要清理临时文件） |
| **JWT 7 天有效** | 简单 | refresh token（复杂度++） |
| **不做实时预览/上传进度** | 上传 100MB 已够用 | 大文件需要分片上传 |

---

## 8. 关键流程详解

### 8.1 注册 → 登录 → 上传 → 看图（端到端）

```
[浏览器]
  1. POST /api/auth/register {username, password}
     → bcrypt 哈希入库 + 自动建默认分类
  
  2. POST /api/auth/login {username, password}
     → 返回 { token, user }
     → 前端 localStorage.setItem('token', ...)
  
  3. POST /api/upload (multipart, Bearer token)
     → multer 接收 + storage.put + db.addImages
     → 返回 images[] (thumbnailUrl 可能为 null)
  
  4. (后台) 异步缩略图 + 元数据 → db.updateImageMeta
     → 前端用 polling 或刷新拉新数据
  
  5. GET /api/images?category=xxx (Bearer token)
     → 返回该用户该分类的所有图
     → 卡片展示 thumbnailUrl || url
```

### 8.2 删除图（带缩略图联动）

```js
// 路由
app.delete('/api/images/:id', requireAuth, async (req, res) => {
  const img = db.deleteImage(req.params.id, req.user.id);
  const backend = backendOf(img.storageType);  // 关键：按记录类型派发
  await backend.delete(img.filename);          // 删原图
  if (img.thumbnailUrl) {
    const thumbKey = `thumbs/${path.parse(img.filename).name}.jpg`;
    await backend.delete(thumbKey);            // 删缩略图
  }
  res.json({ ok: true });
});
```

### 8.3 切换存储后端（不丢老数据）

```
[老数据]  storage_type=local   /uploads/xxx.jpg
[新数据]  storage_type=cos     https://bucket.cos.../xxx.jpg

切换 STORAGE_TYPE=cos 重启服务：
- 旧图片：URL 仍指向 /uploads/，express.static 继续服务
- 新上传：写入 COS bucket
- 删图：按每条记录的 storageType 派发到正确 backend
- 重建缩略图：本地记录仍可用 ffmpeg，COS 记录跳过（需先下载）
```

---

## 9. 部署

### 9.1 Docker Compose（推荐）

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env，填 JWT_SECRET、COS_* 等

# 启动
docker compose up -d

# 访问
open http://localhost:8080
```

### 9.2 ffmpeg 在 Docker 里的来源

不推荐 `apk add ffmpeg`：alpine 仓库版本老、codec 不全（缺 libx264 等）。

采用**多阶段构建**：
1. 第一阶段从 [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) 下载静态二进制
2. 复制 `ffmpeg` + `ffprobe` 到 runtime 阶段
3. runtime 用 `node:22-alpine` 减小镜像

```dockerfile
# 第一阶段：拿 ffmpeg
FROM alpine:3.20 AS ffmpeg
ARG FFMPEG_TAG=latest
RUN apk add --no-cache curl xz \
  && curl -fsSL "https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_TAG}/ffmpeg-master-latest-linux64-gpl.tar.xz" \
  | tar -xJ -C /tmp \
  && find /tmp -name 'ffmpeg' -o -name 'ffprobe' \
  | xargs -I {} cp {} /usr/local/bin/

# 第二阶段：runtime
FROM node:22-alpine
COPY --from=ffmpeg /usr/local/bin/ffmpeg /usr/local/bin/
COPY --from=ffmpeg /usr/local/bin/ffprobe /usr/local/bin/
# ...
```

可以通过 `--build-arg FFMPEG_TAG=autobuild-2024-01-01-12-50` 锁定版本。

### 9.3 nginx 路由

```nginx
server {
  listen 80;
  client_max_body_size 100m;  # 配合 multer 限制

  # SPA fallback
  location / { try_files $uri /index.html; }

  # API 反代
  location /api/ { proxy_pass http://server:3000; }

  # 老本地文件服务（混合存储兼容）
  location /uploads/ { proxy_pass http://server:3000; }
}
```

---

## 10. 运维工具

### 10.1 重建缩略图

```bash
cd server
pnpm rebuild:thumbs:force  # 干跑去掉 :force
```

输出示例：
```
🔍 找到 5 条需要重建（共 9 张）:
   - [video] 缩略图测试.mp4
   - [image] 大图-1080p.jpg
   ...
🚀 开始重建...
[1/5] 缩略图测试.mp4 (video) ... ✅ 成功
[3/5] 大图-1080p.jpg (image) ... ✅ 成功
========== 完成 ==========
✅ 成功: 5
```

**何时需要跑**：
- 服务崩溃中途缩略图没生成完
- 升级 ffmpeg 想重新生成
- 切换 storage 后发现老记录 thumb 路径不对
- DB 文件被恢复/同步导致 thumbUrl 丢失

### 10.2 直接查 DB（运维排错）

```bash
cd server
node -e "const db=require('./db'); db.init(); console.log(db.getAllImages());"
```

### 10.3 已知不会做的运维

- **没有自动清理孤立文件**（DB 删了磁盘还在）—— 建议加，但需要小心
- **没有定时任务** —— 30 分钟超时是平台限制，不是程序问题
- **没有日志聚合** —— 现在直接看控制台输出

---

## 11. 安全 & 性能

### 已做

- ✅ 密码 bcrypt 哈希（10 rounds）
- ✅ JWT 签名 + 过期
- ✅ multer 限制文件类型（mimetype + 扩展名双重校验）
- ✅ multer 限制 100MB
- ✅ 跨用户隔离：`WHERE user_id = ?` 每个查询
- ✅ 跨用户鉴权：删/改前验证 owner

### 没做（按需补）

- ⚠️ 速率限制（防刷）
- ⚠️ HTTPS（生产依赖 nginx/云 LB）
- ⚠️ CORS 白名单（现在是 `cors()` 允许所有）
- ⚠️ 防止 SSRF / 文件名注入（用 nanoid 随机文件名已挡掉一部分）
- ⚠️ JWT 黑名单 / 主动失效
- ⚠️ 上传去重（hash 比对）

---

## 12. 已知限制 & 未来工作

### 已知限制

1. **服务进程崩溃时正在跑的缩略图任务会丢**（DB 没记录），但有 `rebuild:thumbs:force` 兜底
2. **没有 admin 角色**——所有用户权限相同
3. **缩略图 URL 直接给前端**（没鉴权签名），理论上任何人猜到 URL 就能访问
4. **没分页** —— 一次性返回所有图，几百张还行，上千会卡
5. **缩略图策略保守**（图片=原图）—— 大图列表页会下载多次原图（虽然有 lazy loading）
6. **没图片去重**：同一张图传两遍会存两份

### 未来工作（按价值排序）

| 优先级 | 任务 | 价值 |
|---|---|---|
| 高 | 分页 / 虚拟列表 | 几百张图以后必做 |
| 高 | 文件清理工具（孤儿文件检测） | 长期运行必备 |
| 中 | 自动 EXIF 旋转（ffmpeg 能读 orientation） | 手机照片必备 |
| 中 | WebP/AVIF 自动转码 | 减少流量 |
| 低 | 分享链接（公开可访问某张图） | 协作场景 |
| 低 | 全文搜索文件名 | 图多了才好用 |
| 低 | 暗色模式 | 体验 |
| 低 | i18n | 国际化 |
| 低 | 备份工具 | 长期 |

---

## 13. 变更历史

| 日期 | 内容 |
|---|---|
| 2026-08-04 | 初版：核心功能完成（auth/upload/thumbnail/storage_type），favicon 风格定稿 |
| 2026-08-04 | ffmpeg 集成：图片元数据探测 + 缩略图统一走 storage 抽象层 |
| 2026-08-04 | 混合存储：`storage_type` 列 + `backendOf()` registry |
| 2026-08-04 | 重建缩略图脚本 + `pnpm rebuild:thumbs:force` |

---

## 附录 A：常用命令

```bash
# 开发
cd my-photo-gallery && pnpm run dev

# 重建缩略图
cd server && pnpm rebuild:thumbs:force

# 直接查 DB
cd server && node -e "const db=require('./db'); db.init(); console.log(JSON.stringify(db.getAllImages(), null, 2));"

# 测试 ffmpeg
ffmpeg -version
ffprobe -v error -show_entries stream=width,height -of csv=p=0 test.jpg

# Docker
docker compose up -d
docker compose logs -f server
```

## 附录 B：常见问题

**Q: 怎么切换到 COS？**
A: 编辑 `.env`，设 `STORAGE_TYPE=cos` + COS_SECRET_*，重启服务。新上传会走 COS，老数据继续走本地。

**Q: COS 模式上传后看不到缩略图？**
A: 检查 server logs 看 `[thumb] xxx ❌` 错误。常见原因：COS SDK 没装、COS 凭据错、网络不通。

**Q: 服务重启后图都没了？**
A: 容器场景下没挂载 volume。用 `-v $(pwd)/server/uploads:/app/uploads` 或在 docker-compose 里挂。

**Q: 想加个新后端（比如 S3）？**
A: 在 `server/storage.js` 加 `S3Storage` 类 + 在 `createStorage()` 注册 + 在 `backendOf` 处理新 type。路由层 / DB 层零改动。

**Q: 上传大文件失败？**
A: 默认 100MB 限制（multer + nginx client_max_body_size 都要改）。
