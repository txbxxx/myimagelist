/**
 * 数据库访问层（SQLite 实现）
 * --------------------------------
 * 设计原则：
 * 1. 内部统一用 snake_case 字段（贴近 SQL）
 * 2. 对外统一返回 camelCase 对象（贴近 JS 习惯）
 * 3. 接口稳定：以后换 MySQL/MariaDB 只改这个文件
 *
 * 以后切 MySQL 时：把 better-sqlite3 换成 mysql2/promise，
 * 准备语句改成连接池 + 参数化查询，事务语法调整一下即可。
 * 上层 routes 不动一行代码。
 */

// 用 Node 22.5+ 内置的 sqlite（零原生依赖，不用编译）
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');

const DB_PATH = path.join(__dirname, 'db.sqlite');
const LEGACY_JSON_PATH = path.join(__dirname, 'db.json');

let db = null;

function init() {
  const isFresh = !fs.existsSync(DB_PATH);
  db = new DatabaseSync(DB_PATH);
  // node:sqlite 的外键默认是关闭的
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // 建表（IF NOT EXISTS，重复执行安全）
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT    PRIMARY KEY,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id          TEXT    PRIMARY KEY,
      name        TEXT    NOT NULL,
      color       TEXT    NOT NULL DEFAULT '#FFD6A5',
      user_id     TEXT,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS images (
      id             TEXT    PRIMARY KEY,
      filename       TEXT    NOT NULL,
      original_name  TEXT    NOT NULL,
      url            TEXT    NOT NULL,
      thumbnail_url  TEXT,                              -- 视频缩略图；图片为 NULL
      size           INTEGER NOT NULL,
      mime_type      TEXT    NOT NULL DEFAULT 'image/jpeg',
      type           TEXT    NOT NULL DEFAULT 'image',  -- 'image' | 'video'
      width          INTEGER,                          -- 视频/图片的原始尺寸（ffprobe / 自然）
      height         INTEGER,
      duration_sec   REAL,                              -- 视频时长（秒），图片为 NULL
      storage_type   TEXT    NOT NULL DEFAULT 'local', -- 'local' | 'cos'：这条记录存在哪
      category_id    TEXT    NOT NULL,
      user_id        TEXT,
      uploaded_at    INTEGER NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_images_category ON images(category_id);
    CREATE INDEX IF NOT EXISTS idx_images_uploaded ON images(uploaded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_images_user ON images(user_id);
  `);

  // 老数据迁移：如果第一次启动、且 db.json 存在，把数据导过来
  if (isFresh && fs.existsSync(LEGACY_JSON_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(LEGACY_JSON_PATH, 'utf-8'));
      const categories = Array.isArray(raw.categories) ? raw.categories : [];
      const images = Array.isArray(raw.images) ? raw.images : [];

      const insertCategory = db.prepare(
        'INSERT OR IGNORE INTO categories (id, name, color, created_at) VALUES (?, ?, ?, ?)'
      );
      const insertImage = db.prepare(
        'INSERT OR IGNORE INTO images (id, filename, original_name, url, size, category_id, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );

      const tx = db.transaction(() => {
        const now = Date.now();
        for (const c of categories) {
          insertCategory.run(c.id, c.name, c.color || '#FFD6A5', now);
        }
        for (const img of images) {
          insertImage.run(
            img.id,
            img.filename,
            img.originalName || img.original_name || '',
            img.url,
            img.size || 0,
            img.categoryId || img.category_id || 'cat_default',
            img.uploadedAt || img.uploaded_at || now
          );
        }
      });
      tx();
      console.log(`🗂️  已从 db.json 迁移 ${categories.length} 个分类、${images.length} 张图片到 SQLite`);
      fs.renameSync(LEGACY_JSON_PATH, LEGACY_JSON_PATH + '.bak');
    } catch (e) {
      console.error('❌ 迁移旧数据失败:', e.message);
    }
  }

  // 数据库为空时插入默认分类
  const count = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (count === 0) {
    db.prepare(
      'INSERT INTO categories (id, name, color, created_at) VALUES (?, ?, ?, ?)'
    ).run('cat_default', '未分类', '#FFD6A5', Date.now());
    console.log('🏷️  已创建默认分类「未分类」');
  }

  // 老库升级：给已存在的 images 表补字段（sqlite 不支持 IF NOT EXISTS）
  // 用 PRAGMA table_info 判断再 ALTER，避免重复加列报错
  const imageCols = new Set(db.prepare('PRAGMA table_info(images)').all().map(c => c.name));
  const alterAdds = [
    ['thumbnail_url', 'TEXT'],
    ['width', 'INTEGER'],
    ['height', 'INTEGER'],
    ['duration_sec', 'REAL'],
    ['storage_type', "TEXT NOT NULL DEFAULT 'local'"]  // 老记录默认 local
  ];
  for (const [col, type] of alterAdds) {
    if (!imageCols.has(col)) {
      try {
        db.exec(`ALTER TABLE images ADD COLUMN ${col} ${type}`);
        console.log(`🛠️  升级 images 表：新增列 ${col}`);
      } catch (e) {
        console.warn(`⚠️  加列 ${col} 失败:`, e.message);
      }
    }
  }
}

// ============ Users ============

function createUser({ username, passwordHash }) {
  const id = 'u_' + nanoid(10);
  const now = Date.now();
  try {
    db.prepare(
      'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
    ).run(id, username, passwordHash, now);
    return { id, username, createdAt: now };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      const err = new Error('用户名已存在');
      err.code = 'DUPLICATE';
      throw err;
    }
    throw e;
  }
}

function findUserByUsername(username) {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: row.created_at
  };
}

function findUserById(id) {
  const row = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id);
  if (!row) return null;
  return { id: row.id, username: row.username, createdAt: row.created_at };
}

// ============ Categories ============

function getCategories(userId) {
  // 只返回该用户自己的分类；用户没有任何分类时才回退到全局分类兜底（历史/迁移数据）。
  // 避免「全局默认分类 + 用户私有默认分类」同时返回，导致前端重复显示两个「未分类」。
  let rows = db.prepare(
    'SELECT id, name, color FROM categories WHERE user_id = ? ORDER BY created_at ASC'
  ).all(userId);
  if (rows.length === 0) {
    rows = db.prepare(
      'SELECT id, name, color FROM categories WHERE user_id IS NULL ORDER BY created_at ASC'
    ).all();
  }
  return rows;
}

function getUserCategoryIds(userId) {
  let rows = db.prepare('SELECT id FROM categories WHERE user_id = ?').all(userId);
  if (rows.length === 0) {
    rows = db.prepare('SELECT id FROM categories WHERE user_id IS NULL').all();
  }
  return rows.map(r => r.id);
}

function addCategory({ name, color, userId }) {
  const id = 'cat_' + nanoid(6);
  const palette = ['#FFD6A5', '#FFADAD', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#A0C4FF', '#BDB2FF', '#FFC6FF'];
  const finalColor = color || palette[Math.floor(Math.random() * palette.length)];
  try {
    db.prepare(
      'INSERT INTO categories (id, name, color, user_id, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name.trim(), finalColor, userId || null, Date.now());
    return { id, name: name.trim(), color: finalColor };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      const err = new Error('分类已存在');
      err.code = 'DUPLICATE';
      throw err;
    }
    throw e;
  }
}

function updateCategory(id, { name, color }, userId) {
  // 越权防护：只允许改属于当前用户的分类；全局分类（user_id IS NULL）查不到，自然改不到。
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, userId);
  if (!cat) return null;
  const newName = (name && String(name).trim()) ? String(name).trim() : cat.name;
  const newColor = color || cat.color;
  db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ? AND user_id = ?')
    .run(newName, newColor, id, userId);
  return { id, name: newName, color: newColor };
}

function deleteCategory(id, userId) {
  // 越权防护：不是自己的分类一律当「不存在」返回，既阻止越权删除，也不泄露存在性。
  // （全局 cat_default 的 user_id 为 NULL，普通用户删不到，无需再单独做字符串判断。）
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, userId);
  if (!cat) return null;
  const has = db.prepare('SELECT 1 FROM images WHERE category_id = ? LIMIT 1').get(id);
  if (has) {
    const err = new Error('该分类下还有图片，请先移动或删除图片');
    err.code = 'HAS_IMAGES';
    throw err;
  }
  const info = db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(id, userId);
  return info.changes > 0;
}

// 给新用户补一个默认分类
function ensureDefaultCategory(userId) {
  const existing = db.prepare(
    'SELECT id FROM categories WHERE user_id = ? LIMIT 1'
  ).get(userId);
  if (existing) return null;
  const id = 'cat_default_' + nanoid(6);
  db.prepare(
    'INSERT INTO categories (id, name, color, user_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, '未分类', '#FFD6A5', userId, Date.now());
  return { id, name: '未分类', color: '#FFD6A5' };
}

// ============ Images ============

function getAllImages() {
  // 管理/重建脚本用：不按 user 过滤，返回全库（带 camelCase 字段）
  const rows = db.prepare('SELECT * FROM images ORDER BY uploaded_at DESC').all();
  return rows.map(r => ({
    id: r.id,
    filename: r.filename,
    originalName: r.original_name,
    url: r.url,
    thumbnailUrl: r.thumbnail_url,
    size: r.size,
    mimeType: r.mime_type,
    type: r.type,
    width: r.width,
    height: r.height,
    durationSec: r.duration_sec,
    storageType: r.storage_type || 'local',
    categoryId: r.category_id,
    userId: r.user_id,
    uploadedAt: r.uploaded_at
  }));
}

function getImages({ category, userId }) {
  // 已用 user_id 限定，无需再用 category_id IN (...) 二次过滤——
  // 用户的图片只可能挂在它自己的分类下。指定 category 时叠加精确过滤即可。
  let rows;
  if (category && category !== 'all') {
    rows = db.prepare(
      'SELECT * FROM images WHERE user_id = ? AND category_id = ? ORDER BY uploaded_at DESC'
    ).all(userId, category);
  } else {
    rows = db.prepare(
      'SELECT * FROM images WHERE user_id = ? ORDER BY uploaded_at DESC'
    ).all(userId);
  }
  return rows.map(r => ({
    id: r.id,
    filename: r.filename,
    originalName: r.original_name,
    url: r.url,
    thumbnailUrl: r.thumbnail_url,
    size: r.size,
    mimeType: r.mime_type,
    type: r.type,
    width: r.width,
    height: r.height,
    durationSec: r.duration_sec,
    storageType: r.storage_type || 'local',  // 老记录没这列时回退 local
    categoryId: r.category_id,
    userId: r.user_id,
    uploadedAt: r.uploaded_at
  }));
}

// 拿所有没缩略图的记录（rebuild 脚本用），不按 user 过滤
function getImagesMissingThumb() {
  const rows = db.prepare(
    "SELECT * FROM images WHERE thumbnail_url IS NULL OR thumbnail_url = ''"
  ).all();
  return rows.map(r => ({
    id: r.id,
    filename: r.filename,
    originalName: r.original_name,
    url: r.url,
    thumbnailUrl: r.thumbnail_url,
    size: r.size,
    mimeType: r.mime_type,
    type: r.type,
    width: r.width,
    height: r.height,
    durationSec: r.duration_sec,
    storageType: r.storage_type || 'local',
    categoryId: r.category_id,
    userId: r.user_id,
    uploadedAt: r.uploaded_at
  }));
}

function addImages(list) {
  // ⚠️ 关键修复：INSERT 必须写入 user_id 列，否则图片归属丢失，getImages 的 WHERE user_id=? 永远查不到。
  const stmt = db.prepare(
    'INSERT INTO images (id, filename, original_name, url, thumbnail_url, size, mime_type, type, width, height, duration_sec, storage_type, category_id, user_id, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  // node:sqlite 没有 transaction()，手动 BEGIN/COMMIT
  db.exec('BEGIN');
  try {
    for (const item of list) {
      stmt.run(
        item.id,
        item.filename,
        item.originalName,
        item.url,
        item.thumbnailUrl || null,
        item.size,
        item.mimeType || 'image/jpeg',
        item.type || 'image',
        item.width || null,
        item.height || null,
        item.durationSec || null,
        item.storageType || 'local',  // ← 新增：默认 local
        item.categoryId,
        item.userId,
        item.uploadedAt || Date.now()
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function deleteImage(id, userId) {
  const img = db.prepare('SELECT * FROM images WHERE id = ? AND user_id = ?').get(id, userId);
  if (!img) return null;
  db.prepare('DELETE FROM images WHERE id = ?').run(id);
  return {
    id: img.id,
    filename: img.filename,
    originalName: img.original_name,
    url: img.url,
    thumbnailUrl: img.thumbnail_url,
    size: img.size,
    mimeType: img.mime_type,
    type: img.type,
    width: img.width,
    height: img.height,
    durationSec: img.duration_sec,
    storageType: img.storage_type || 'local',
    categoryId: img.category_id,
    uploadedAt: img.uploaded_at
  };
}

// 重命名（只改数据库里的 originalName，不动磁盘文件）
function updateImageName(id, newName, userId) {
  const img = db.prepare('SELECT * FROM images WHERE id = ? AND user_id = ?').get(id, userId);
  if (!img) return null;
  const trimmed = String(newName).trim();
  if (!trimmed) return null;
  db.prepare('UPDATE images SET original_name = ? WHERE id = ?').run(trimmed, id);
  return {
    id: img.id,
    filename: img.filename,
    originalName: trimmed,
    url: img.url,
    thumbnailUrl: img.thumbnail_url,
    size: img.size,
    mimeType: img.mime_type,
    type: img.type,
    width: img.width,
    height: img.height,
    durationSec: img.duration_sec,
    storageType: img.storage_type || 'local',
    categoryId: img.category_id,
    uploadedAt: img.uploaded_at
  };
}

module.exports = {
  init,
  // users
  createUser,
  findUserByUsername,
  findUserById,
  // categories
  getCategories,
  getUserCategoryIds,
  addCategory,
  updateCategory,
  deleteCategory,
  ensureDefaultCategory,
  // images
  getImages,
  getAllImages,
  getImagesMissingThumb,
  addImages,
  deleteImage,
  updateImageName,
  updateImageMeta,
  getUserStorageUsed
};

/**
 * 局部更新 image 的可选字段（thumbnail_url / width / height / duration_sec）
 * 只更新传入的键，未传的不动。常用于视频上传后异步补元数据。
 */
function updateImageMeta(id, userId, updates) {
  const colMap = {
    thumbnailUrl: 'thumbnail_url',
    width: 'width',
    height: 'height',
    durationSec: 'duration_sec'
  };
  const entries = Object.entries(updates).filter(([k]) => colMap[k]);
  if (entries.length === 0) return false;
  const sets = entries.map(([k]) => `${colMap[k]} = ?`).join(', ');
  const values = entries.map(([, v]) => v);
  values.push(id, userId);
  const info = db.prepare(`UPDATE images SET ${sets} WHERE id = ? AND user_id = ?`).run(...values);
  return info.changes > 0;
}

// 某用户已占用的存储空间（字节）。本地存储配额校验用
function getUserStorageUsed(userId) {
  const row = db.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM images WHERE user_id = ?').get(userId);
  return row.total || 0;
}
