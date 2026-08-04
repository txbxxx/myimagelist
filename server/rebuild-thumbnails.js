/**
 * 缩略图重建工具
 * --------------------------------
 * 用途：扫描 DB，把 thumbnailUrl 为空的记录补上
 *   - 图片：直接 thumbnailUrl = url（同步，0 成本）
 *   - 视频：ffmpeg 抽帧 → backend.put() 落存储
 *
 * 使用：
 *   node server/rebuild-thumbnails.js              # 干跑一遍（只统计）
 *   node server/rebuild-thumbnails.js --force      # 真的补
 *   node server/rebuild-thumbnails.js --user=<id>  # 只重建某个用户的
 *
 * 什么时候跑：
 *   - 服务挂了导致部分上传没生成缩略图
 *   - 升级了 ffmpeg 版本想重新生成
 *   - 切换 storage 后端后想补
 *   - 任何 thumbnailUrl 跟实际文件对不上的情况
 */

const path = require('path');
const db = require('./db');
const { createStorage, backendOf } = require('./storage');
const { ensureThumbnail } = require('./thumbnail-job');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const userArg = args.find(a => a.startsWith('--user='));
const onlyUserId = userArg ? userArg.slice(7) : null;

console.log('🐰 缩略图重建工具');
console.log(`   模式: ${FORCE ? '⚡ 实际补' : '🔍 干跑（只统计）'}`);
if (onlyUserId) console.log(`   只处理用户: ${onlyUserId}`);
console.log('');

// 初始化 DB（schema 迁移 / 创建默认分类等）
db.init();
// 初始化 storage 注册表
const storage = createStorage();
console.log(`📦 当前存储: ${storage.type}`);
console.log('');

// 直接查 DB 拿所有没缩略图的（高效；DB 层过滤，不用拉全表）
const allImages = db.getAllImages();
const needRebuild = onlyUserId
  ? db.getImagesMissingThumb().filter(img => img.userId === onlyUserId)
  : db.getImagesMissingThumb();

if (needRebuild.length === 0) {
  console.log('✅ 没有需要重建的缩略图');
  process.exit(0);
}

console.log(`🔍 找到 ${needRebuild.length} 条需要重建（共 ${allImages.length} 张）:`);
const summary = { image: 0, video: 0, ok: 0, fail: 0, skipped: 0 };
for (const item of needRebuild) {
  if (item.type === 'image') summary.image++; else summary.video++;
  console.log(`   - [${item.type}] ${item.originalName} (${item.filename})`);
}
console.log(`   图片: ${summary.image}, 视频: ${summary.video}`);
console.log('');

if (!FORCE) {
  console.log('💡 加上 --force 参数才会真的补');
  process.exit(0);
}

console.log('🚀 开始重建...');
console.log('');

(async () => {
  for (let i = 0; i < needRebuild.length; i++) {
    const item = needRebuild[i];
    const idx = `[${i + 1}/${needRebuild.length}]`;
    process.stdout.write(`${idx} ${item.originalName} (${item.type}) ... `);
    try {
      const result = await ensureThumbnail(db, item);
      if (result.ok) {
        if (result.skipped) { console.log('⏭️  跳过（已有）'); summary.skipped++; }
        else { console.log('✅ 成功'); summary.ok++; }
      } else {
        console.log(`❌ 失败: ${result.error}`); summary.fail++;
      }
    } catch (e) {
      console.log(`❌ 异常: ${e.message}`); summary.fail++;
    }
  }
  console.log('');
  console.log('========== 完成 ==========');
  console.log(`✅ 成功: ${summary.ok}`);
  console.log(`⏭️  跳过: ${summary.skipped}`);
  console.log(`❌ 失败: ${summary.fail}`);
  process.exit(summary.fail > 0 ? 1 : 0);
})();
