/**
 * 存储抽象层
 * - LocalStorage：默认，写到 server/uploads/，由 Express 静态中间件服务
 * - CosStorage：腾讯云 COS（用 cos-nodejs-sdk-v5），写到对象存储，返回公网 URL
 *
 * 切换方式：环境变量
 *   STORAGE_TYPE=cos
 *   COS_SECRET_ID=...
 *   COS_SECRET_KEY=...
 *   COS_BUCKET=example-1250000000  (bucket 名 - appId)
 *   COS_REGION=ap-guangzhou
 *   COS_PREFIX=candy/              (可选，子目录前缀)
 *
 * 不配置则默认 LocalStorage，开发零依赖。
 */

const fs = require('fs');
const path = require('path');

class LocalStorage {
  constructor() {
    this.type = 'local';  // ← 新增：用于按记录派发
    this.dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  /**
   * @param {string} key     文件名（支持子目录，如 'thumbs/abc.jpg'）
   * @param {Buffer} buffer  文件内容
   * @param {string} [mime]  内容的 MIME（本地存储不需要，签名保留）
   * @returns {Promise<string>} 可访问的 URL
   */
  async put(key, buffer /*, mime */) {
    const filepath = path.join(this.dir, key);
    // 子目录自动创建（缩略图存 thumbs/ 用到）
    await fs.promises.mkdir(path.dirname(filepath), { recursive: true });
    await fs.promises.writeFile(filepath, buffer);
    return this.getUrl(key);
  }

  /**
   * 把文件读成 Buffer（缩略图生成时需要从 storage 读回本地文件给 ffmpeg）
   * @param {string} key
   * @returns {Promise<Buffer>}
   */
  async getBuffer(key) {
    const filepath = path.join(this.dir, key);
    return fs.promises.readFile(filepath);
  }

  /**
   * 给 ffmpeg 用的本地绝对路径
   * LocalStorage 模式下文件就在磁盘上，直接返回
   * CosStorage 模式下需要先下载到本地
   */
  async resolveLocalPath(key) {
    return path.join(this.dir, key);
  }

  async delete(key) {
    const filepath = path.join(this.dir, key);
    try {
      await fs.promises.unlink(filepath);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }

  getUrl(key) {
    return `/uploads/${key}`;
  }

  // 描述信息（用于日志）
  describe() {
    return { type: 'local', dir: this.dir };
  }
}

class CosStorage {
  constructor(opts) {
    if (!opts.secretId || !opts.secretKey || !opts.bucket || !opts.region) {
      throw new Error('CosStorage 需要 COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION 全部配置');
    }
    this.type = 'cos';  // ← 新增
    // 延迟 require，避免没装 SDK 时也能启动（本地模式）
    const COS = require('cos-nodejs-sdk-v5');
    this.cos = new COS({
      SecretId: opts.secretId,
      SecretKey: opts.secretKey,
      // 简单超时设置，避免卡死
      Timeout: 30000
    });
    this.bucket = opts.bucket;
    this.region = opts.region;
    this.prefix = (opts.prefix || '').replace(/^\/+|\/+$/g, '');  // 去首尾斜杠
  }

  _fullKey(key) {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async put(key, buffer, mime) {
    const fullKey = this._fullKey(key);
    await this.cos.putObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: fullKey,
      Body: buffer,
      ContentLength: buffer.length,
      ContentType: mime || 'application/octet-stream'
    });
    return this.getUrl(key);
  }

  async delete(key) {
    const fullKey = this._fullKey(key);
    try {
      await this.cos.deleteObject({
        Bucket: this.bucket,
        Region: this.region,
        Key: fullKey
      });
    } catch (e) {
      // COS 不存在的对象删除会报错，但属于"已删过"，吞掉
      if (e.code !== 'NoSuchKey' && e.statusCode !== 404) throw e;
    }
  }

  getUrl(key) {
    const fullKey = this._fullKey(key);
    // 公开读 URL（前提：bucket 配了公有读）
    return `https://${this.bucket}.cos.${this.region}.myqcloud.com/${fullKey}`;
  }

  describe() {
    return {
      type: 'cos',
      bucket: this.bucket,
      region: this.region,
      prefix: this.prefix || '(none)'
    };
  }
}

// ============ 存储注册表（混合存储支持）============
// 同时持有多个 backend 实例，DB 里每条 image 记录有 storage_type 字段
// 路由根据记录的 storage_type 派发到对应 backend
// 解决了「先本地后切 COS」的老数据处理问题
const _registry = {
  local: null,
  cos:   null
};

function register(backend) {
  if (!backend || !backend.type) throw new Error('register() 需要带 .type 的 backend');
  _registry[backend.type] = backend;
}

/** 当前默认 backend（新上传用这个） */
function getDefault() {
  const want = (process.env.STORAGE_TYPE || 'local').toLowerCase();
  return _registry[want] || _registry.local;
}

/** 给定 storage_type 拿 backend；找不到就回退 local（老数据兼容） */
function backendOf(storageType) {
  return _registry[storageType] || _registry.local;
}

function describeRegistry() {
  return Object.fromEntries(
    Object.entries(_registry)
      .filter(([_, b]) => b)
      .map(([k, b]) => [k, b.describe()])
  );
}

function createStorage() {
  // 注册 local（永远有）
  const local = new LocalStorage();
  register(local);
  console.log('📁 存储后端[local] 已注册');

  // 如果配了 COS，就一并注册（即使当前默认是 local，也注册上，方便处理历史 COS 数据）
  if (process.env.COS_SECRET_ID) {
    try {
      const cos = new CosStorage({
        secretId: process.env.COS_SECRET_ID,
        secretKey: process.env.COS_SECRET_KEY,
        bucket: process.env.COS_BUCKET,
        region: process.env.COS_REGION,
        prefix: process.env.COS_PREFIX
      });
      register(cos);
      console.log('☁️  存储后端[cos] 已注册', cos.describe());
    } catch (e) {
      console.error('❌ COS 注册失败（仅本地图库可用）:', e.message);
    }
  }

  const def = getDefault();
  const defType = def?.type || 'local';
  console.log(`🎯 当前默认存储: ${defType} ${JSON.stringify(def?.describe() || {})}`);
  return def;
}

module.exports = {
  createStorage,
  register,
  getDefault,
  backendOf,
  describeRegistry,
  LocalStorage,
  CosStorage
};
