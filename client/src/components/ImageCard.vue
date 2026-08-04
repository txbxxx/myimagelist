<template>
  <div class="image-card" @click="$emit('click', image)">
    <div class="thumb-wrap">
      <!-- 图片：有缩略图就用缩略图（更省流量），否则 fallback 原图 -->
      <img v-if="!isVideo" :src="image.thumbnailUrl || image.url" :alt="image.originalName" loading="lazy" />
      <!-- 视频：有缩略图就显示 jpg（轻量），没有就 fallback 到 <video> -->
      <template v-else>
        <img v-if="image.thumbnailUrl" :src="image.thumbnailUrl" :alt="image.originalName" loading="lazy" class="video-thumb-img" />
        <video v-else :src="image.url" muted preload="metadata" class="video-thumb"></video>
        <!-- 时长角标（右下） -->
        <span v-if="image.durationSec" class="duration-badge">{{ formatDuration(image.durationSec) }}</span>
      </template>
      <!-- 视频角标 -->
      <div v-if="isVideo" class="media-badge video">
        <span>🎬</span> VIDEO
      </div>
      <!-- 动图角标（GIF / 动态 WebP） -->
      <div v-else-if="animatedKind" class="media-badge animated" :class="animatedKind">
        <span>{{ animatedKind === 'gif' ? '✨' : '🌀' }}</span> {{ animatedKind.toUpperCase() }}
      </div>
      <!-- 左上：分类标签 -->
      <div class="cat-badge" v-if="category" :style="{ background: category.color }">
        <span class="cat-dot"></span>
        {{ category.name }}
      </div>
      <!-- 右上：下载按钮 -->
      <button
        class="dl-btn"
        :title="isVideo ? '下载原视频' : '下载原图'"
        @click.stop="handleDownload"
      >
        <el-icon><Download /></el-icon>
      </button>
      <!-- 悬停遮罩 -->
      <div class="hover-mask">
        <el-icon class="zoom-icon"><ZoomIn /></el-icon>
        <span class="hint">点我看{{ isVideo ? '视频' : '大图' }}</span>
      </div>
    </div>
    <div class="card-foot">
      <div class="name" :title="image.originalName">{{ image.originalName }}</div>
      <div class="meta">
        <span class="size">{{ formatSize(image.size) }}</span>
        <span v-if="image.width" class="dot">•</span>
        <span v-if="image.width" class="res">{{ image.width }}×{{ image.height }}</span>
        <span v-if="formatLabel" class="dot">•</span>
        <span v-if="formatLabel" class="fmt">{{ formatLabel }}</span>
        <span class="dot">•</span>
        <span class="date">{{ formatDate(image.uploadedAt) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Download, ZoomIn } from '@element-plus/icons-vue';
import { useGalleryStore } from '../stores/gallery';

const props = defineProps({ image: { type: Object, required: true } });
defineEmits(['click']);

const store = useGalleryStore();
const category = computed(() => store.categoryMap[props.image.categoryId]);
const isVideo = computed(() => props.image.type === 'video' || (props.image.mimeType && props.image.mimeType.startsWith('video/')));

// 动图识别：image/gif 一定动；image/webp 可能是静态也可能是动态，但浏览器侧很难 100% 判别
// 简化方案：mime 为 image/gif → gif；mime 为 image/webp → webp（按客户端文件名/常见场景默认动态）
const animatedKind = computed(() => {
  if (isVideo.value) return null;
  const mime = (props.image.mimeType || '').toLowerCase();
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp' || mime === 'image/apng') return 'webp';
  return null;
});

// 格式标签：mimeType → 简写（PNG / JPEG / WebP / MP4 / MOV）
// ffmpeg/ffprobe 的 format_name 有时候很怪（如 png_pipe、image2），mime 更稳定
const formatLabel = computed(() => {
  const m = (props.image.mimeType || '').toLowerCase();
  const map = {
    'image/jpeg': 'JPEG',
    'image/png':  'PNG',
    'image/gif':  'GIF',
    'image/webp': 'WebP',
    'image/bmp':  'BMP',
    'image/svg+xml': 'SVG',
    'image/avif': 'AVIF',
    'video/mp4':  'MP4',
    'video/webm': 'WebM',
    'video/ogg':  'OGV',
    'video/quicktime': 'MOV'
  };
  return map[m] || '';
});

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}
// mm:ss 或 h:mm:ss
function formatDuration(sec) {
  if (!sec || sec < 0) return '';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

function handleDownload() {
  const a = document.createElement('a');
  a.href = props.image.url;
  a.download = props.image.originalName || (isVideo.value ? 'video' : 'image');
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
</script>

<style scoped>
.image-card {
  border: 3px solid var(--cartoon-brown);
  border-radius: var(--cartoon-radius);
  background: #fff;
  box-shadow: 4px 4px 0 var(--cartoon-brown);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  position: relative;
}
.image-card:hover {
  transform: translate(-3px, -3px) rotate(-0.6deg);
  box-shadow: 7px 7px 0 var(--cartoon-brown);
}
.image-card:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--cartoon-brown);
}
.thumb-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: linear-gradient(135deg, #FFF6BD, #FFE0EC);
  overflow: hidden;
}
.thumb-wrap img,
.thumb-wrap .video-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s ease;
}
.thumb-wrap .video-thumb-img {
  /* 视频缩略图（同图片样式） */
}
.image-card:hover .thumb-wrap img { transform: scale(1.05); }

/* 视频时长角标（右下，黑底半透白字） */
.duration-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 5px;
  font-family: monospace;
  z-index: 2;
  letter-spacing: 0.3px;
}
.res {
  font-family: monospace;
  color: var(--cartoon-brown);
  font-weight: 800;
  font-size: 11px;
}
.fmt {
  font-family: monospace;
  color: var(--cartoon-brown);
  font-weight: 800;
  font-size: 11px;
  padding: 1px 5px;
  background: var(--cartoon-cream, #FFF6BD);
  border: 1.5px solid var(--cartoon-brown);
  border-radius: 4px;
  line-height: 1.2;
}

.cat-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 800;
  color: var(--cartoon-brown-deep);
  border: 2px solid var(--cartoon-brown);
  border-radius: 999px;
  box-shadow: 2px 2px 0 var(--cartoon-brown);
  max-width: calc(100% - 70px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cartoon-brown);
  flex-shrink: 0;
}

/* 视频角标 */
.media-badge {
  position: absolute;
  bottom: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 900;
  color: #fff;
  background: linear-gradient(180deg, #FF7A7A, #E54444);
  border: 2px solid var(--cartoon-brown);
  border-radius: 999px;
  box-shadow: 2px 2px 0 var(--cartoon-brown);
  z-index: 2;
}
.media-badge span { font-size: 14px; }

/* 动图角标（GIF / 动态 WebP）：紫粉魔法配色 */
.media-badge.animated {
  background: linear-gradient(180deg, #B19BFF, #E26AC8);
  animation: shine 2.4s linear infinite;
}
.media-badge.animated.webp {
  background: linear-gradient(180deg, #6BD8FF, #A98CFF);
}
@keyframes shine {
  0%   { filter: brightness(1)   saturate(1); }
  50%  { filter: brightness(1.18) saturate(1.25); }
  100% { filter: brightness(1)   saturate(1); }
}

/* 右上角下载按钮（hover 显示） */
.dl-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: #fff;
  border: 2.5px solid var(--cartoon-brown);
  border-radius: 50%;
  box-shadow: 2px 2px 0 var(--cartoon-brown);
  cursor: pointer;
  opacity: 0;
  transform: translateY(-6px) rotate(-10deg);
  transition: all 0.18s;
  z-index: 2;
}
.image-card:hover .dl-btn {
  opacity: 1;
  transform: translateY(0) rotate(0);
}
.dl-btn:hover {
  background: var(--cartoon-yellow);
  transform: scale(1.12) rotate(8deg) !important;
  box-shadow: 3px 3px 0 var(--cartoon-brown);
}
.dl-btn .el-icon {
  font-size: 18px;
  color: var(--cartoon-brown-deep);
}
.dl-btn:hover .el-icon {
  color: var(--cartoon-pink);
}
.dl-btn:active {
  transform: scale(0.95) !important;
}

.hover-mask {
  position: absolute;
  inset: 0;
  background: rgba(255, 214, 165, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;  /* 让点击穿透到图片触发预览 */
}
.image-card:hover .hover-mask { opacity: 1; }
.zoom-icon { font-size: 42px; color: var(--cartoon-brown-deep); filter: drop-shadow(2px 2px 0 #4A3B32); }
.hint {
  color: var(--cartoon-brown-deep);
  font-weight: 900;
  font-size: 14px;
  background: #fff;
  padding: 4px 12px;
  border-radius: 999px;
  border: 2px solid var(--cartoon-brown);
}

.card-foot {
  padding: 10px 12px 12px;
  background: #fff;
}
.name {
  font-size: 14px;
  font-weight: 800;
  color: var(--cartoon-brown-deep);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--cartoon-brown);
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot { opacity: 0.5; }
</style>
