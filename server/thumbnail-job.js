/**
 * 缩略图任务（图片/视频通用）
 * --------------------------------
 * 设计：
 * - 图片：直接拿原图当缩略图（thumbnailUrl = url），省 CPU 省磁盘
 *   - 小图：本来就小，没意义再缩
 *   - 大图：浏览器加载一两次后会缓存，原图当缩略图够用
 * - 视频：必须 ffmpeg 抽第一帧（mp4 源不能直接当缩略图）
 *
 * 调用方：
 * - 上传路由：响应后异步调 ensureThumbnail(item)（fire-and-forget）
 * - 重建脚本：扫描 thumbnailUrl IS NULL 的记录，逐个调 ensureThumbnail
 *
 * 跟 storage 抽象层的关系：
 * - 用 record.storageType 找 backend（混合存储兼容）
 * - 视频的缩略图通过 backend.put() 落到正确位置
 * - 图片不需要 put，原图已经在 storage 里
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractThumbnail, probeMedia } = require('./thumbnail');
const { backendOf } = require('./storage');

/**
 * 给单条 image 记录确保有缩略图
 * - 已存在 thumbnailUrl → no-op
 * - 图片 → thumbnailUrl = url（同步，0 成本）
 * - 视频 → ffmpeg 抽帧 → backend.put() 落存储
 *
 * @param {object} db  db 模块（带 updateImageMeta）
 * @param {object} item  image 记录
 * @returns {Promise<{ok: boolean, skipped?: boolean, error?: string}>}
 */
async function ensureThumbnail(db, item) {
  // 已有缩略图就跳过（重入安全）
  if (item.thumbnailUrl) {
    return { ok: true, skipped: true };
  }

  // 图片：原图就是缩略图
  if (item.type === 'image') {
    db.updateImageMeta(item.id, item.userId, { thumbnailUrl: item.url });
    return { ok: true, skipped: false, reason: 'image uses original' };
  }

  // 视频：ffmpeg 抽帧
  if (item.type === 'video') {
    const backend = backendOf(item.storageType);
    const localPath = await backend.resolveLocalPath(item.filename);
    const thumbKey = `thumbs/${path.parse(item.filename).name}.jpg`;
    const tmpPath = path.join(os.tmpdir(), `thumb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);

    try {
      const thumbRes = await extractThumbnail(localPath, tmpPath, { seekSec: 1 });
      if (!thumbRes.ok) {
        return { ok: false, error: `ffmpeg: ${thumbRes.error}` };
      }
      const buf = await fs.promises.readFile(tmpPath);
      const url = await backend.put(thumbKey, buf, 'image/jpeg');
      db.updateImageMeta(item.id, item.userId, { thumbnailUrl: url });
      return { ok: true, url };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  }

  return { ok: false, error: `unknown type: ${item.type}` };
}

module.exports = { ensureThumbnail };
