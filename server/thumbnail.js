/**
 * 媒体元数据 + 视频缩略图
 * --------------------------------
 * 用 ffmpeg/ffprobe 二进制（不依赖 npm 包）做两件事：
 *   1. 视频抽第一帧为 jpg 缩略图
 *   2. 读媒体元数据（图片 + 视频通用）：宽 / 高 / 时长 / 格式
 *
 * 设计：
 * - 不依赖任何 npm 包装库，直接 spawn ffmpeg 二进制（避免 deprecation）
 * - ffmpeg 路径：优先用环境变量 FFMPEG_PATH / FFPROBE_PATH，否则 PATH 查找
 * - dev 模式没装 ffmpeg 也安全：捕获 ENOENT 错误，返回 null，不影响上传
 * - 生产 Docker 镜像里已预装（server/Dockerfile 阶段 1 拷进去）
 *
 * 调用方：server/index.js 上传后异步调用
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FFMPEG_BIN  = process.env.FFMPEG_PATH  || 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_PATH || 'ffprobe';

// 探测：ffmpeg 是否可用（启动期调用）
let ffmpegAvailable = null;
function checkFfmpeg() {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    const proc = spawn(FFMPEG_BIN, ['-version']);
    proc.on('error', () => { ffmpegAvailable = false; });
    proc.on('close', code => { ffmpegAvailable = code === 0; });
    return true;
  } catch (e) {
    ffmpegAvailable = false;
    return false;
  }
}

/**
 * 从视频里抽一帧作为缩略图
 * @param {string} videoPath
 * @param {string} outPath
 * @param {object} [opts]
 * @param {number} [opts.seekSec=1]
 * @param {number} [opts.width=480]
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function extractThumbnail(videoPath, outPath, opts = {}) {
  return new Promise((resolve) => {
    // seekSec 默认 0：图片只有 1 帧，跳转会空输出；视频传 1 取 1 秒附近的画面
    const { seekSec = 0, width = 480 } = opts;

    if (process.env.FFMPEG_PATH) {
      try { fs.statSync(FFMPEG_BIN); } catch { return resolve({ ok: false, error: 'ffmpeg not found' }); }
    }

    const args = [
      '-y', '-loglevel', 'error',
      ...(seekSec > 0 ? ['-ss', String(seekSec)] : []),
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '2',
      '-vf', `scale=${width}:-2`,
      outPath
    ];

    let proc;
    try {
      proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ ok: false, error: e.message });
    }

    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({ ok: false, error: 'ffmpeg timeout (30s)' });
    }, 30_000);

    proc.on('error', e => { clearTimeout(timer); resolve({ ok: false, error: e.message }); });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(outPath)) {
        resolve({ ok: true });
      } else {
        const msg = stderr.trim().split('\n').pop() || `exit ${code}`;
        resolve({ ok: false, error: msg });
      }
    });
  });
}

/**
 * 读媒体元数据（图片 + 视频通用）
 * 返回：
 *   {
 *     width:    number,        // 像素宽
 *     height:   number,        // 像素高
 *     duration: number,        // 秒（视频）；图片为 0
 *     format:   string,        // 'jpeg' / 'png' / 'gif' / 'webp' / 'mp4' / 'mov' ...
 *     codec:    string,        // 'mjpeg' / 'png' / 'h264' ...
 *   }
 *
 * @param {string} mediaPath
 * @returns {Promise<MediaMeta | null>}
 */
function probeMedia(mediaPath) {
  return new Promise((resolve) => {
    const proc = spawn(FFPROBE_BIN, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,codec_name',
      '-show_entries', 'format=format_name,duration,size',
      '-of', 'json',
      mediaPath
    ]);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[probe] ${mediaPath}: ${stderr.trim().split('\n').pop() || `exit ${code}`}`);
        return resolve(null);
      }
      try {
        const meta = JSON.parse(stdout);
        const v = (meta.streams || [])[0] || {};
        const f = meta.format || {};
        // format_name 可能是 "image2,mp4,mov" 这种逗号分隔，取第一项
        const formatName = (f.format_name || '').split(',')[0] || '';
        const dur = parseFloat(f.duration) || 0;
        return resolve({
          width:    v.width  || 0,
          height:   v.height || 0,
          duration: Math.round(dur * 10) / 10,
          format:   formatName,
          codec:    v.codec_name || ''
        });
      } catch (e) {
        return resolve(null);
      }
    });
  });
}

/**
 * 兼容旧 API：probeVideo = probeMedia
 * 老的 thumbnail 调用方不用改
 */
function probeVideo(videoPath) {
  return probeMedia(videoPath).then(m => m ? {
    duration: m.duration,
    width:    m.width,
    height:   m.height
  } : null);
}

module.exports = { extractThumbnail, probeMedia, probeVideo, checkFfmpeg };
