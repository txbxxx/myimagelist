/**
 * Express 服务入口
 * - multer（内存存储）接住文件 buffer，再交给 storage 抽象层（本地 / 腾讯云 COS）
 * - ./db.js 封装所有数据库操作（当前 SQLite，将来可换 MySQL）
 * - 视频上传后异步调 ffmpeg 抽第一帧作缩略图（thumbnail.js）
 * - JWT 鉴权（bcryptjs 加密 + jsonwebtoken）
 */

// 加载 .env（必须在最顶部、其它 require 之前）
// 路径优先级：
//   1) 仓库根目录的 .env（dev / docker compose 默认）
//   2) server/.env（container 内单独 mount 的场景）
//   3) 当前工作目录下的 .env（兜底，dotenv 默认行为）
// - 已存在的 process.env 不会被覆盖（override: false），方便 shell export 临时调试
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({
  path: [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(process.cwd(), '.env')
  ],
  override: false,
  quiet: true   // 静默：没找到 .env 不打 warn（dev/Docker 都有可能没有）
});

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');  // 签名 URL 用（Node 内置，零依赖）
const db = require('./db');
const { createStorage, backendOf } = require('./storage');
const { probeMedia } = require('./thumbnail');
const { ensureThumbnail } = require('./thumbnail-job');

const app = express();
const PORT = process.env.PORT || 3000;

// 存储后端（本地 or COS），由 STORAGE_TYPE 环境变量决定
const storage = createStorage();

// JWT 配置
// JWT 配置 —— fail-closed：未设 JWT_SECRET 直接拒绝启动（公网私有图库不能赌默认密钥）
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('未设置 JWT_SECRET 环境变量。请生成一个强随机密钥注入，例如：node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2d';

// 公开注册开关：默认关闭（私有图库，账号用 _create-user.js 建）。设 REG_OPEN=true 才开放
const REG_OPEN = process.env.REG_OPEN === 'true';

// CORS：同域部署（vite proxy / nginx）下不生效；前后端跨域时设 CORS_ORIGIN 收紧到前端域名
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';

// 启动时生成一个假 bcrypt 哈希，用于"用户不存在"时拉平响应时间（防时序侧信道枚举用户名）
const DUMMY_HASH = bcrypt.hashSync('dummy-not-used', 10);

// ============ 文件签名 URL（替代裸 express.static，让 /uploads 受鉴权）============
// 原因：<img>/<video> 不能带 Authorization 头，所以把"已验证"的凭证签进 URL，后端验签后下发文件。
// 机制：HMAC-SHA256 无状态签名，复用 JWT_SECRET，不存 session（重启/多实例都不影响）。
const SIGNED_URL_TTL = Number(process.env.SIGNED_URL_TTL) || 3600;  // 秒，默认 1 小时

// 签名 URL 独立密钥（职责分离：即使 JWT 密钥泄露，文件 URL 签名仍独立）。未设拒绝启动
const URL_SIGN_SECRET = process.env.URL_SIGN_SECRET;
if (!URL_SIGN_SECRET) {
  throw new Error('未设置 URL_SIGN_SECRET 环境变量（用于签名 /uploads 文件 URL）。生成：node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

// 本地存储配额（MB）。仅 STORAGE_TYPE=local 时生效（OSS 弹性容量不限）；0 = 不限
const UPLOAD_QUOTA_MB = Number(process.env.UPLOAD_QUOTA_MB) || 0;

// 从 /uploads/<key> 里取出 <key>（key 可能含子目录，如 thumbs/xxx.jpg）
function _extractKey(urlOrPath) {
  return decodeURIComponent(String(urlOrPath).replace(/^\/uploads\//, ''));
}

// 给本地文件 url 签名；COS 公网 URL（https://...）不签，走 COS 自己的访问控制
function signUrlIfNeeded(url) {
  if (!url || !url.startsWith('/uploads/')) return url;
  const key = _extractKey(url);
  const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL;
  const sig = crypto.createHmac('sha256', URL_SIGN_SECRET).update(`${key}|${exp}`).digest('hex');
  return `/uploads/${key}?exp=${exp}&sig=${sig}`;
}

// /uploads 验签中间件：校验签名 + 过期时间；通过才放行到 res.sendFile
function verifyFileSig(req, res, next) {
  const key = _extractKey(req.path);
  const exp = Number(req.query.exp);
  const sig = req.query.sig;
  if (!key || !exp || !sig) return res.status(401).end();
  if (Math.floor(Date.now() / 1000) > exp) return res.status(410).end();  // 过期
  const expected = crypto.createHmac('sha256', URL_SIGN_SECRET).update(`${key}|${exp}`).digest('hex');
  const sigBuf = Buffer.from(String(sig));
  if (sigBuf.length !== expected.length ||
      !crypto.timingSafeEqual(sigBuf, Buffer.from(expected))) {
    return res.status(403).end();
  }
  next();
}

// multer 内存存储：接住 buffer，再交给 storage 层（这样 COS/本地走同一份代码）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },  // 100MB（视频可能较大）
  fileFilter: (req, file, cb) => {
    // 严格锚定（避免 text/jpeg、image/pngx 之类误判）
    const okImage = /\.(jpe?g|png|gif|webp)$/i.test(file.originalname)
                 && /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
    const okVideo = /\.(mp4|webm|ogg|mov|m4v)$/i.test(file.originalname)
                 && /^video\/(mp4|webm|ogg|quicktime)$/.test(file.mimetype);
    if (okImage || okVideo) {
      file._mediaType = okImage ? 'image' : 'video';
      cb(null, true);
    } else {
      cb(new Error('仅支持 jpg/png/gif/webp 图片 或 mp4/webm/ogg/mov 视频'));
    }
  }
});

app.use(cors(CORS_ORIGIN ? { origin: CORS_ORIGIN } : undefined));
app.use(express.json());
// 混合存储支持：永远挂载本地静态目录。
// 即使当前默认是 COS，老的本地文件还得服务（DB 里 storage_type=local 的记录 URL 指向这里）。
// COS 文件直接走公网 URL，不经过 Node。
fs.mkdirSync(path.join(__dirname, 'uploads', 'thumbs'), { recursive: true });
// /uploads 受签名保护（替代裸 express.static）：先验签，通过才下发文件（res.sendFile 支持视频 Range 请求）
app.get(/^\/uploads\/.+$/, verifyFileSig, (req, res) => {
  const key = _extractKey(req.path);
  const target = path.join(__dirname, 'uploads', key);
  const uploadsRoot = path.join(__dirname, 'uploads');
  // 防路径穿越：解析后必须落在 uploads 目录内
  if (!target.startsWith(uploadsRoot + path.sep)) return res.status(403).end();
  res.sendFile(target);
});

// ============ 鉴权中间件 ============
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: '未登录', code: 'NO_TOKEN' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: '登录已过期，请重新登录', code: 'INVALID_TOKEN' });
  }
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ============ 鉴权路由 ============
app.post('/api/auth/register', async (req, res) => {
  // 关闭公开注册：私有图库账号由 _create-user.js 建；需要开放时设 REG_OPEN=true
  if (!REG_OPEN) {
    return res.status(403).json({ ok: false, error: '注册已关闭，请联系管理员创建账号（server/_create-user.js）' });
  }
  try {
    const { username, password } = req.body;
    const name = String(username || '').trim();
    // 用户名格式校验（与前端一致：2-20 位字母/数字/下划线/中文）
    if (!/^[a-zA-Z0-9_\\u4e00-\\u9fa5]{2,20}$/.test(name)) {
      return res.status(400).json({ ok: false, error: '用户名只能是 2-20 位字母/数字/下划线/中文' });
    }
    if (!password || password.length < 8 || !/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ ok: false, error: '密码至少 8 位，需含字母和数字' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    let user;
    try {
      user = db.createUser({ username: name, passwordHash });
    } catch (e) {
      if (e.code === 'DUPLICATE') return res.status(400).json({ ok: false, error: e.message });
      throw e;
    }
    // 给新用户补一个默认分类
    db.ensureDefaultCategory(user.id);
    const token = signToken(user);
    res.json({ ok: true, token, user });
  } catch (err) {
    console.error('[POST /api/auth/register]', err);
    res.status(500).json({ ok: false, error: '服务器内部错误' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: '请输入用户名和密码' });
    }
    const user = db.findUserByUsername(String(username).trim());
    // 关键：用户不存在时也对假哈希跑一次 bcrypt（永远 false），拉平响应时间，
    // 防止攻击者通过"响应快慢"枚举有效用户名（错误信息虽统一，但时间差会泄露存在性）
    const ok = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ ok: false, error: '用户名或密码错误' });
    const safeUser = { id: user.id, username: user.username, createdAt: user.createdAt };
    const token = signToken(safeUser);
    // 登录也确保有默认分类（兼容老用户）
    db.ensureDefaultCategory(safeUser.id);
    res.json({ ok: true, token, user: safeUser });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: '用户不存在' });
  res.json({ ok: true, user });
});

// ============ 健康检查（无需登录）============
app.get('/api/health', (req, res) => res.json({ ok: true, msg: '🐰 图库服务跑起来啦～' }));

// ============ 图片（需登录）============
app.get('/api/images', requireAuth, (req, res) => {
  try {
    const list = db.getImages({ category: req.query.category, userId: req.user.id });
    // 本地存储的 url 现场签名（COS 公网 URL 不签）；缩略图也签（私有图库缩略图同样是隐私）
    list.forEach(img => {
      img.url = signUrlIfNeeded(img.url);
      if (img.thumbnailUrl) img.thumbnailUrl = signUrlIfNeeded(img.thumbnailUrl);
    });
    res.json(list);
  } catch (err) {
    console.error('[GET /api/images]', err);
    res.status(500).json({ ok: false, error: '服务器内部错误' });
  }
});

app.post('/api/upload', requireAuth, (req, res) => {
  upload.array('files', 20)(req, res, async (err) => {
    if (err) {
      console.error('[upload] multer error:', err.message);
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, error: '没有收到文件' });
    }
    try {
      const { categoryId } = req.body;
      const targetCategory = categoryId || '';
      // 校验目标分类属于当前用户（或公共默认分类）
      const userCats = db.getUserCategoryIds(req.user.id);
      const finalCategory = userCats.includes(targetCategory) ? targetCategory : userCats[0];
      // 本地存储配额校验（OSS 弹性容量不限；UPLOAD_QUOTA_MB=0 不限）
      if (storage.type === 'local' && UPLOAD_QUOTA_MB > 0) {
        const batchBytes = req.files.reduce((s, f) => s + f.size, 0);
        const usedBytes = db.getUserStorageUsed(req.user.id);
        if (usedBytes + batchBytes > UPLOAD_QUOTA_MB * 1024 * 1024) {
          return res.status(413).json({ ok: false, error: `存储已超额：已用 ${(usedBytes / 1048576).toFixed(1)}MB + 本次 ${(batchBytes / 1048576).toFixed(1)}MB，上限 ${UPLOAD_QUOTA_MB}MB` });
        }
      }
      // 多文件上传时 originalName 可能是数组（每文件一个），按索引取；
      // 缺失则回退到 latin1→utf8 解码 multer 给的原始名
      const rawNames = req.body.originalName;

      // 串行写入（避免大文件并发打爆带宽 / CPU）；如有需要可改为 p-limit 并发
      const items = [];
      for (let i = 0; i < req.files.length; i++) {
        const f = req.files[i];
        // 构造存储 key：时间戳 + 短随机 + 扩展名
        const ext = path.extname(f.originalname).toLowerCase() || '';
        const key = `${Date.now()}-${nanoid(6)}${ext}`;

        let originalName;
        if (Array.isArray(rawNames)) {
          originalName = (rawNames[i] && String(rawNames[i]).trim())
            || Buffer.from(f.originalname, 'latin1').toString('utf8');
        } else if (rawNames && String(rawNames).trim()) {
          originalName = String(rawNames).trim();
        } else {
          originalName = Buffer.from(f.originalname, 'latin1').toString('utf8');
        }

        // 交给存储抽象层（本地 / COS）
        const url = await storage.put(key, f.buffer, f.mimetype);

        items.push({
          id: nanoid(8),
          filename: key,
          originalName,
          url,
          // 图片的缩略图就是它自己（浏览器自动缩放）；视频的缩略图由 ffmpeg 异步生成
          thumbnailUrl: f._mediaType === 'image' ? url : null,
          size: f.size,
          mimeType: f.mimetype,
          type: f._mediaType || 'image',
          width: null,
          height: null,
          durationSec: null,
          storageType: storage.type,  // ← 标记这条记录存在哪
          categoryId: finalCategory,
          userId: req.user.id,
          uploadedAt: Date.now()
        });
      }
      db.addImages(items);
      // 上传返回的本地 url 也要签名，否则前端 <img> 加载会 401（COS 公网 URL 不签）
      items.forEach(it => { it.url = signUrlIfNeeded(it.url); });
      res.json({ ok: true, images: items });

      // ===== 响应后再做事：补元数据 + 缩略图（异步 fire-and-forget）=====
      // 图片：thumbnailUrl 已经在 items 里设成 url 了，只补 ffprobe 的 width/height
      // 视频：ffmpeg 抽帧 + ffprobe 补 width/height/duration
      // 逻辑封装在 ./thumbnail-job.js 的 ensureThumbnail
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // 视频 + COS 暂不支持（ffmpeg 需要本地文件）
        if (item.type === 'video' && item.storageType !== 'local') {
          console.log(`[meta] 跳过 ${item.storageType} 存储的视频 ${item.filename}（ffmpeg 需要本地文件）`);
          continue;
        }
        // 异步跑：探测元数据 + ensureThumbnail
        (async () => {
          try {
            if (item.storageType === 'local') {
              // ffprobe 探测宽高 / 时长（图片视频通用）
              const backend = backendOf(item.storageType);
              const localPath = await backend.resolveLocalPath(item.filename);
              const meta = await probeMedia(localPath);
              if (meta) {
                const metaUpdates = {};
                if (meta.width)    metaUpdates.width       = meta.width;
                if (meta.height)   metaUpdates.height      = meta.height;
                if (meta.duration) metaUpdates.durationSec = meta.duration;
                if (Object.keys(metaUpdates).length > 0) {
                  db.updateImageMeta(item.id, item.userId, metaUpdates);
                }
              }
            }
            // 缩略图：图片直接用 url（no-op），视频 ffmpeg 抽帧
            const result = await ensureThumbnail(db, item);
            if (result.ok && !result.skipped) {
              console.log(`[thumb] ${item.filename} ✅ ${result.reason || 'thumb set'}`);
            } else if (!result.ok) {
              console.warn(`[thumb] ${item.filename} ❌ ${result.error}`);
            }
          } catch (e) {
            console.error(`[thumb] ${item.filename} 失败:`, e.message);
          }
        })();
      }
    } catch (e) {
      console.error('[upload]', e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });
});

app.put('/api/images/:id', requireAuth, (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, error: '图片名不能为空' });
    }
    const updated = db.updateImageName(req.params.id, name, req.user.id);
    if (!updated) return res.status(404).json({ ok: false, error: '图片不存在' });
    res.json({ ok: true, image: updated });
  } catch (err) {
    console.error('[PUT /api/images/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/images/:id', requireAuth, async (req, res) => {
  try {
    const img = db.deleteImage(req.params.id, req.user.id);
    if (!img) return res.status(404).json({ ok: false, error: '图片不存在' });
    // 按记录的 storage_type 派发到正确的 backend（混合存储关键）
    const backend = backendOf(img.storageType);
    try {
      await backend.delete(img.filename);
      // 缩略图也跟着删（如果存在）
      if (img.thumbnailUrl) {
        const thumbKey = `thumbs/${path.parse(img.filename).name}.jpg`;
        await backend.delete(thumbKey);
      }
    } catch (e) {
      console.warn(`[delete] ${img.storageType} backend.delete fail:`, e.message);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============ 分类（需登录）============
app.get('/api/categories', requireAuth, (req, res) => {
  try {
    res.json(db.getCategories(req.user.id));
  } catch (err) {
    console.error('[GET /api/categories]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/categories', requireAuth, (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, error: '分类名不能为空' });
    }
    const cat = db.addCategory({ name, color, userId: req.user.id });
    res.json({ ok: true, category: cat });
  } catch (err) {
    if (err.code === 'DUPLICATE') return res.status(400).json({ ok: false, error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/categories/:id', requireAuth, (req, res) => {
  try {
    const cat = db.updateCategory(req.params.id, req.body, req.user.id);
    if (!cat) return res.status(404).json({ ok: false, error: '分类不存在' });
    res.json({ ok: true, category: cat });
  } catch (err) {
    console.error('[PUT /api/categories/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  try {
    const ok = db.deleteCategory(req.params.id, req.user.id);
    if (!ok) return res.status(404).json({ ok: false, error: '分类不存在' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'HAS_IMAGES') return res.status(400).json({ ok: false, error: err.message });
    console.error('[DELETE /api/categories/:id]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 错误兜底
app.use((err, req, res, next) => {
  console.error('[express error]', err);
  if (res.headersSent) return;
  // 不向客户端泄露内部错误细节（err.message 可能含实现信息），细节只在服务端日志
  res.status(500).json({ ok: false, error: '服务器内部错误' });
});

db.init();
app.listen(PORT, () => {
  console.log(`🐰 后端服务已启动: http://localhost:${PORT}`);
  console.log(`📦 数据库: SQLite (${path.join(__dirname, 'db.sqlite')})`);
  console.log(`💾 存储: ${storage.constructor.name} ${JSON.stringify(storage.describe ? storage.describe() : {})}`);
});

// 注：旧的 generateMediaThumbnail 已抽到 ./thumbnail-job.js 的 ensureThumbnail
// 上传路由直接 require 并 fire-and-forget 调用
