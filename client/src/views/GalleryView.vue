<template>
  <div class="gallery-view">
    <!-- 标题区 -->
    <div class="page-title">
      <Icon icon="lucide:rainbow" class="emoji" />
      <h2>画廊</h2>
      <p>共 <b>{{ store.images.length }}</b> 张图 · 当前展示 <b>{{ store.filteredImages.length }}</b> 张</p>
    </div>

    <!-- 分类筛选条 -->
    <div class="filter-bar">
      <button
        class="filter-tag"
        :class="{ active: store.currentCategory === 'all' }"
        :style="store.currentCategory === 'all' ? { background: 'linear-gradient(180deg, #B5E2FF, #A0C4FF)' } : {}"
        @click="store.setCategory('all')"
      >
        <Icon icon="lucide:star" class="filter-icon" /> 全部
        <span class="count">{{ store.images.length }}</span>
      </button>
      <button
        v-for="cat in store.categories"
        :key="cat.id"
        class="filter-tag"
        :class="{ active: store.currentCategory === cat.id }"
        :style="store.currentCategory === cat.id
          ? { background: cat.color, transform: 'translate(-1px, -1px)' }
          : { background: cat.color + 'cc' }"
        @click="store.setCategory(cat.id)"
      >
        <span class="dot" :style="{ background: cat.color }"></span>
        {{ cat.name }}
        <span class="count">{{ getCategoryCount(cat.id) }}</span>
      </button>
    </div>

    <!-- 内容区 -->
    <div class="content">
      <!-- 加载中：骨架屏（比 spinner 更稳，减少布局跳动） -->
      <div v-if="store.loading && store.images.length === 0" class="skeleton-grid">
        <div v-for="i in 8" :key="i" class="skeleton-card">
          <div class="skeleton-thumb"></div>
          <div class="skeleton-line short"></div>
          <div class="skeleton-line"></div>
        </div>
      </div>

      <div v-else-if="store.filteredImages.length === 0" class="empty-state">
        <Icon
          :icon="store.currentCategory === 'all' ? 'lucide:image' : 'lucide:tag'"
          class="emoji"
        />
        <p v-if="store.currentCategory === 'all'">
          还没有图片，<router-link to="/upload" class="link">去上传第一张</router-link>吧 🐰
        </p>
        <p v-else>这个分类下还没有图片哦</p>
      </div>

      <div v-else class="image-grid">
        <ImageCard
          v-for="(img, idx) in store.filteredImages"
          :key="img.id"
          :image="img"
          @click="onImageClick(idx)"
        />
      </div>
    </div>

    <!-- ============= 预览对话框 ============= -->
    <el-dialog
      ref="dialogRef"
      v-model="store.previewVisible"
      :show-close="false"
      :width="dialogWidth"
      :align-center="true"
      :modal-class="'preview-modal'"
      :close-on-press-escape="true"
      class="preview-dialog"
      :aria-label="store.currentPreviewImage ? `图片预览：${store.currentPreviewImage.originalName}` : '图片预览'"
      @open="onDialogOpen"
      @opened="onDialogOpened"
      @closed="onDialogClosed"
    >
      <template #header>
        <div class="preview-header">
          <el-icon class="file-icon"><Picture /></el-icon>
          <span class="file-name" v-if="store.currentPreviewImage">
            {{ store.currentPreviewImage.originalName }}
          </span>
          <span class="file-name" v-else>—</span>
          <span class="position-tag">
            {{ store.previewIndex + 1 }} / {{ store.filteredImages.length }}
          </span>
          <!-- 自定义关闭按钮（之前 show-close=false 是因为图标风格不搭；现在自己画一个） -->
          <button
            ref="closeBtnRef"
            class="preview-close-btn"
            type="button"
            aria-label="关闭预览"
            @click="store.previewVisible = false"
          >
            <el-icon><Close /></el-icon>
          </button>
        </div>
      </template>

      <div class="preview-body" v-if="store.currentPreviewImage">
        <!-- 缩放工具条（仅图片） -->
        <div class="zoom-toolbar" v-if="!isCurrentVideo">
          <button
            class="zoom-btn"
            @click="zoomOut"
            :disabled="scale <= MIN_SCALE"
            title="缩小 (-)"
          >
            <el-icon><Minus /></el-icon>
          </button>
          <span
            class="zoom-pct"
            @dblclick="resetZoom"
            :title="`当前缩放 ${Math.round(scale * 100)}%，双击重置`"
          >{{ Math.round(scale * 100) }}%</span>
          <button
            class="zoom-btn"
            @click="zoomIn"
            :disabled="scale >= MAX_SCALE"
            title="放大 (+)"
          >
            <el-icon><Plus /></el-icon>
          </button>
          <button
            class="zoom-btn zoom-reset"
            @click="resetZoom"
            :disabled="scale === 1 && panX === 0 && panY === 0"
            title="重置 (0)"
          >
            <el-icon><Refresh /></el-icon>
          </button>
        </div>

        <!-- 左右切换按钮 -->
        <button
          v-if="store.filteredImages.length > 1"
          class="nav-btn nav-prev"
          title="上一张 (←)"
          @click="store.prevImage()"
        >◀</button>
        <button
          v-if="store.filteredImages.length > 1"
          class="nav-btn nav-next"
          title="下一张 (→)"
          @click="store.nextImage()"
        >▶</button>

        <!-- 提示：缩放/拖动 -->
        <div class="zoom-hint" v-if="!isCurrentVideo && scale > 1.01">
          <el-icon><Pointer /></el-icon> 可拖动 · 双击重置
        </div>

        <div
          class="img-stage"
          ref="stageEl"
          :class="{ 'is-zoomed': !isCurrentVideo && scale > 1.01, 'is-grabbing': isDragging }"
          @wheel="onWheel"
          @mousedown="onMouseDown"
          @touchstart.passive="onTouchStart"
          @touchmove.passive="onTouchMove"
          @touchend="onTouchEnd"
        >
          <img
            v-if="!isCurrentVideo"
            :src="store.currentPreviewImage.url"
            :alt="store.currentPreviewImage.originalName"
            class="preview-img"
            :class="{ 'is-zoomed': scale > 1.01 }"
            :style="{ transform: `scale(${scale}) translate(${panX}px, ${panY}px)` }"
            @dblclick="onDoubleClick"
            draggable="false"
          />
          <video
            v-else
            :src="store.currentPreviewImage.url"
            controls
            autoplay
            class="preview-video"
          ></video>
        </div>
      </div>

      <template #footer>
        <div class="preview-footer" v-if="store.currentPreviewImage">
          <div class="meta-info">
            <span class="meta-tag" v-if="getImageCategory(store.currentPreviewImage)" :style="{ background: getImageCategory(store.currentPreviewImage).color }">
              <span class="cat-dot"></span>
              {{ getImageCategory(store.currentPreviewImage).name }}
            </span>
            <span
              v-if="animatedKind"
              class="meta-item animated-badge"
              :class="animatedKind"
              :title="animatedKind === 'gif' ? '动图 GIF（点击播放会动）' : '动态 WebP'"
            >{{ animatedKind === 'gif' ? '✨ GIF' : '🌀 WEBP' }}</span>
            <span class="meta-item">
              <el-icon><Box /></el-icon> {{ formatSize(store.currentPreviewImage.size) }}
            </span>
            <span class="meta-item">
              <el-icon><Calendar /></el-icon> {{ formatDate(store.currentPreviewImage.uploadedAt) }}
            </span>
          </div>
          <div class="footer-actions">
            <el-button @click="renameCurrent">
              <el-icon><EditPen /></el-icon> 重命名
            </el-button>
            <el-button @click="store.closePreview()">
              <el-icon><Close /></el-icon> 关闭 (Esc)
            </el-button>
            <el-button type="primary" @click="downloadCurrent">
              <el-icon><Download /></el-icon> 下载原图
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Picture, Minus, Plus, Refresh, Pointer, Box, Calendar,
  EditPen, Close, Download
} from '@element-plus/icons-vue';
import { Icon } from '@iconify/vue';
import { useGalleryStore } from '../stores/gallery';
import ImageCard from '../components/ImageCard.vue';

const store = useGalleryStore();
const dialogRef = ref();
const closeBtnRef = ref();  // 关闭按钮 ref，用于弹窗打开时把焦点移过来（a11y）

// 响应式对话框宽度（PC 宽，手机窄）
const dialogWidth = ref('70%');
function updateDialogWidth() {
  const w = window.innerWidth;
  if (w < 600) dialogWidth.value = '95%';
  else if (w < 1024) dialogWidth.value = '85%';
  else dialogWidth.value = '70%';
}

function onImageClick(idx) {
  store.openPreview(idx);
}

function onDialogOpen() {
  updateDialogWidth();
  // Element Plus dialog 用 teleport 渲染到 body 末尾，绑在 document.body 上最稳
  document.body.addEventListener('keydown', onKey, true);
}
function onDialogOpened() {
  // 弹窗打开动画结束后，把焦点移到关闭按钮（a11y：键盘用户能立刻按 Enter/Esc 关闭）
  // 用 $nextTick 防止动画过程中 ref 还没渲染
  setTimeout(() => {
    closeBtnRef.value?.focus?.({ preventScroll: true });
  }, 50);
}
function onDialogClosed() {
  document.body.removeEventListener('keydown', onKey, true);
  cleanupDrag();
  resetZoom();
}

// =================== 图片缩放 ===================
const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;

const scale = ref(1);
const panX = ref(0);
const panY = ref(0);
const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0, panX: 0, panY: 0 });
const stageEl = ref(null);

function resetZoom() {
  scale.value = 1;
  panX.value = 0;
  panY.value = 0;
}

// 以中心为锚点的缩放（用于 +/- 按钮）
function zoomToCentered(newScale) {
  const oldScale = scale.value;
  if (newScale === oldScale) return;
  const ratio = newScale / oldScale;
  // transform: scale(s) translate(x, y) 的 translate 在视觉上会被 s 缩放
  // 中心不变，panX/panY 按 ratio 缩放即可保持中心锚定
  panX.value = panX.value * ratio;
  panY.value = panY.value * ratio;
  scale.value = newScale;
  if (scale.value <= 1) { panX.value = 0; panY.value = 0; }
}

function zoomIn()  { zoomToCentered(Math.min(MAX_SCALE, +(scale.value + ZOOM_STEP).toFixed(2))); }
function zoomOut() { zoomToCentered(Math.max(MIN_SCALE, +(scale.value - ZOOM_STEP).toFixed(2))); }

// 以鼠标为锚点的缩放（用于 wheel / 双击）
function zoomAtPoint(newScale, clientX, clientY) {
  const oldScale = scale.value;
  if (newScale === oldScale) return;
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect) { zoomToCentered(newScale); return; }
  const ecx = rect.width / 2;
  const ecy = rect.height / 2;
  const dxCursor = clientX - rect.left - ecx;
  const dyCursor = clientY - rect.top - ecy;
  // 解出使鼠标下图像点保持不动的 panX/panY
  // x_new = dxCursor * (1 - ratio) + ratio * x_old
  const ratio = newScale / oldScale;
  panX.value = dxCursor * (1 - ratio) + ratio * panX.value;
  panY.value = dyCursor * (1 - ratio) + ratio * panY.value;
  scale.value = newScale;
  if (scale.value <= 1) { panX.value = 0; panY.value = 0; }
}

function onWheel(e) {
  if (isCurrentVideo.value) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, +(scale.value + delta).toFixed(2)));
  zoomAtPoint(newScale, e.clientX, e.clientY);
}

function onDoubleClick(e) {
  if (isCurrentVideo.value) return;
  e.preventDefault();
  if (scale.value > 1.01) {
    resetZoom();
  } else {
    zoomAtPoint(2, e.clientX, e.clientY);
  }
}

// 拖动平移（仅 scale > 1）
function onMouseDown(e) {
  if (isCurrentVideo.value) return;
  if (e.button !== 0) return;       // 只响应左键
  if (scale.value <= 1.01) return;  // 1x 时不拖
  e.preventDefault();
  isDragging.value = true;
  dragStart.value = {
    x: e.clientX,
    y: e.clientY,
    panX: panX.value,
    panY: panY.value
  };
  document.body.addEventListener('mousemove', onMouseMove);
  document.body.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e) {
  if (!isDragging.value) return;
  const dx = e.clientX - dragStart.value.x;
  const dy = e.clientY - dragStart.value.y;
  // 视觉上 1:1 跟随，CSS translate 在 pre-scale 空间，要除以 scale
  panX.value = dragStart.value.panX + dx / scale.value;
  panY.value = dragStart.value.panY + dy / scale.value;
}

function onMouseUp() {
  isDragging.value = false;
  document.body.removeEventListener('mousemove', onMouseMove);
  document.body.removeEventListener('mouseup', onMouseUp);
}

function cleanupDrag() {
  isDragging.value = false;
  document.body.removeEventListener('mousemove', onMouseMove);
  document.body.removeEventListener('mouseup', onMouseUp);
}

// ============ 触摸支持（手机双指缩放 + 单指拖动）============
const touchState = ref({
  pinchStartDist: 0,   // 双指起始距离
  pinchStartScale: 1,  // 双指起始时的 scale
  panStart: null,      // 单指拖动起点
  panStartPan: { x: 0, y: 0 }
});

function getTouchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function onTouchStart(e) {
  if (isCurrentVideo.value) return;
  if (e.touches.length === 2) {
    // 双指：开始捏合
    touchState.value.pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
    touchState.value.pinchStartScale = scale.value;
  } else if (e.touches.length === 1) {
    // 单指：如果已缩放，拖动平移
    if (scale.value > 1.01) {
      touchState.value.panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchState.value.panStartPan = { x: panX.value, y: panY.value };
    }
  }
}

function onTouchMove(e) {
  if (isCurrentVideo.value) return;
  if (e.touches.length === 2 && touchState.value.pinchStartDist > 0) {
    // 双指缩放：以起始距离的比例缩放
    e.preventDefault?.();
    const dist = getTouchDist(e.touches[0], e.touches[1]);
    const ratio = dist / touchState.value.pinchStartDist;
    const newScale = touchState.value.pinchStartScale * ratio;
    setScale(newScale);
  } else if (e.touches.length === 1 && touchState.value.panStart && scale.value > 1.01) {
    // 单指拖动平移
    const dx = e.touches[0].clientX - touchState.value.panStart.x;
    const dy = e.touches[0].clientY - touchState.value.panStart.y;
    panX.value = touchState.value.panStartPan.x + dx / scale.value;
    panY.value = touchState.value.panStartPan.y + dy / scale.value;
  }
}

function onTouchEnd(e) {
  if (e.touches.length === 0) {
    touchState.value.pinchStartDist = 0;
    touchState.value.panStart = null;
  } else if (e.touches.length === 1) {
    // 双指变单指：重置
    touchState.value.pinchStartDist = 0;
    if (scale.value > 1.01) {
      touchState.value.panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchState.value.panStartPan = { x: panX.value, y: panY.value };
    }
  }
}

// 切换图片 / 关闭预览时重置缩放
watch(() => store.currentPreviewImage?.id, () => {
  cleanupDrag();
  resetZoom();
});

// 键盘 ← → Esc + / - 0（在 body 上 capture 阶段监听，dialog 用 teleport 渲染到 body 末尾也能收到）
function onKey(e) {
  if (!store.previewVisible) return;
  // 避免在 input/textarea 内时响应
  const tag = (e.target && e.target.tagName) || '';
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && e.target.type !== 'range') return;
  const k = e.key;
  const c = e.code;
  const isLeft  = k === 'ArrowLeft'  || c === 'ArrowLeft';
  const isRight = k === 'ArrowRight' || c === 'ArrowRight';
  const isEsc   = k === 'Escape'     || c === 'Escape';
  const isPlus  = k === '+' || k === '=' || c === 'Equal' || c === 'NumpadAdd';
  const isMinus = k === '-' || k === '_' || c === 'Minus' || c === 'NumpadSubtract';
  const isZero  = k === '0' || c === 'Digit0' || c === 'Numpad0';
  if (isLeft)       { e.preventDefault(); store.prevImage(); }
  else if (isRight) { e.preventDefault(); store.nextImage(); }
  else if (isEsc)   { e.preventDefault(); store.closePreview(); }
  else if (isPlus)  { e.preventDefault(); zoomIn(); }
  else if (isMinus) { e.preventDefault(); zoomOut(); }
  else if (isZero)  { e.preventDefault(); resetZoom(); }
}

function getCategoryCount(id) {
  return store.images.filter(img => img.categoryId === id).length;
}

function getImageCategory(img) {
  return store.categoryMap[img.categoryId] || null;
}

const isCurrentVideo = computed(() => {
  const img = store.currentPreviewImage;
  if (!img) return false;
  return img.type === 'video' || (img.mimeType && img.mimeType.startsWith('video/'));
});

// 动图识别（与 ImageCard 一致）
const animatedKind = computed(() => {
  if (isCurrentVideo.value) return null;
  const img = store.currentPreviewImage;
  if (!img) return null;
  const mime = (img.mimeType || '').toLowerCase();
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp' || mime === 'image/apng') return 'webp';
  return null;
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
  return `${d.getFullYear()}-${m}-${day}`;
}

function downloadCurrent() {
  const img = store.currentPreviewImage;
  if (!img) return;
  const a = document.createElement('a');
  a.href = img.url;
  a.download = img.originalName || 'image';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// 重命名当前预览的图片
async function renameCurrent() {
  const img = store.currentPreviewImage;
  if (!img) return;
  let newName;
  try {
    const { value } = await ElMessageBox.prompt(
      '输入新的图片名（不含扩展名，扩展名会保留）',
      '✏️ 重命名图片',
      {
        inputValue: stripExt(img.originalName || ''),
        inputPlaceholder: '例：我的旅行照',
        confirmButtonText: '💾 保存',
        cancelButtonText: '取消',
        inputValidator: (val) => {
          if (!val || !val.trim()) return '图片名不能为空';
          if (val.length > 100) return '图片名太长（100 字以内）';
          return true;
        }
      }
    );
    newName = value;
  } catch {
    return;  // 用户取消
  }
  const ext = (img.originalName.match(/\.[^.]+$/) || [''])[0];
  const fullName = newName.trim() + ext;
  const res = await store.renameImage(img.id, fullName);
  if (res.ok) {
    ElMessage.success('✏️ 重命名成功');
  } else {
    ElMessage.error(res.error || '重命名失败');
  }
}

function stripExt(name) {
  return name.replace(/\.[^.]+$/, '');
}

onMounted(async () => {
  if (store.categories.length === 0) await store.fetchCategories();
  await store.fetchImages();
  window.addEventListener('resize', updateDialogWidth);
});
onUnmounted(() => {
  window.removeEventListener('resize', updateDialogWidth);
  cleanupDrag();
});
</script>

<style scoped>
.gallery-view { width: 100%; }

.page-title { text-align: center; margin-bottom: 18px; }
.page-title .emoji {
  display: inline-block;
  font-size: 56px;
  color: var(--cartoon-pink);
  animation: float 3s ease-in-out infinite;
}
.page-title h2 {
  margin: 6px 0 4px;
  font-size: 28px;
  color: var(--cartoon-brown-deep);
  font-weight: 900;
}
.page-title p { color: var(--cartoon-brown); font-weight: 700; margin: 0; }
.page-title b { color: var(--cartoon-brown-deep); font-size: 18px; }

/* ========== 分类筛选条 ========== */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px;
  background: #fff;
  border: 3px solid var(--cartoon-brown);
  border-radius: var(--cartoon-radius);
  box-shadow: 4px 4px 0 var(--cartoon-brown);
  margin-bottom: 18px;
  align-items: center;
}
.filter-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 14px;
  font-weight: 800;
  color: var(--cartoon-brown-deep);
  border: 2.5px solid var(--cartoon-brown);
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--cartoon-brown);
  transition: all 0.15s;
  white-space: nowrap;
}
.filter-tag:hover {
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--cartoon-brown);
}
.filter-tag.active {
  box-shadow: 3px 3px 0 var(--cartoon-brown);
  font-weight: 900;
}
.filter-tag .count {
  background: rgba(255,255,255,0.6);
  border-radius: 999px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 900;
}
.filter-icon {
  font-size: 14px;
  color: var(--cartoon-yellow);
  vertical-align: -2px;
  margin-right: 2px;
}
.filter-tag .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--cartoon-brown);
  background: var(--cartoon-peach);
}

/* ========== 网格布局 ========== */
.image-grid {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(4, 1fr);
}
@media (max-width: 1024px) { .image-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 768px)  { .image-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; } }
@media (max-width: 480px)  { .image-grid { grid-template-columns: 1fr; gap: 12px; } }

/* ========== 骨架屏（替代 spinner）========== */
.skeleton-grid {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(4, 1fr);
}
@media (max-width: 1024px) { .skeleton-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 768px)  { .skeleton-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; } }
@media (max-width: 480px)  { .skeleton-grid { grid-template-columns: 1fr; gap: 12px; } }

.skeleton-card {
  background: #fff;
  border: 3px solid var(--cartoon-brown);
  border-radius: var(--cartoon-radius);
  box-shadow: 4px 4px 0 var(--cartoon-brown);
  overflow: hidden;
  padding: 0;
}
.skeleton-thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  background: linear-gradient(
    90deg,
    var(--cartoon-cream, #FFF6BD) 0%,
    #FFE9C4 50%,
    var(--cartoon-cream, #FFF6BD) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}
.skeleton-line {
  height: 10px;
  margin: 10px 12px 6px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    #F0E6CC 0%,
    #FAEBCF 50%,
    #F0E6CC 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}
.skeleton-line.short { width: 40%; }
.skeleton-line + .skeleton-line { animation-delay: 0.15s; }
@keyframes skeleton-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.loading-state { text-align: center; padding: 60px 20px; }
.loading-state .loading-emoji {
  font-size: 56px;
  color: var(--cartoon-pink);
  /* 保留旧 spinner 样式以防其他地方用到 */
  animation: spin 1.2s linear infinite;
  animation: spin 1.2s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-state p {
  margin-top: 14px;
  color: var(--cartoon-brown);
  font-weight: 700;
  font-size: 16px;
}

.empty-state .link {
  color: #A0C4FF;
  text-decoration: underline wavy var(--cartoon-pink);
  font-weight: 900;
  margin: 0 4px;
}

/* ========== 预览对话框样式 ========== */
.preview-header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.file-icon { font-size: 22px !important; color: var(--cartoon-pink); }
.file-name {
  font-weight: 900;
  font-size: 16px;
  color: var(--cartoon-brown-deep);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.position-tag {
  background: var(--cartoon-yellow);
  border: 2.5px solid var(--cartoon-brown);
  border-radius: 999px;
  padding: 2px 12px;
  font-weight: 900;
  font-size: 13px;
  white-space: nowrap;
  box-shadow: 2px 2px 0 var(--cartoon-brown);
}

/* 弹窗右上角关闭按钮：自己画的，匹配卡通风格 */
.preview-close-btn {
  background: var(--cartoon-pink);
  border: 2.5px solid var(--cartoon-brown);
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--cartoon-brown);
  transition: all 0.15s;
  color: #fff;
  flex-shrink: 0;
}
.preview-close-btn:hover {
  background: var(--cartoon-yellow);
  color: var(--cartoon-brown-deep);
  transform: translate(-1px, -1px) rotate(90deg) scale(1.1);
  box-shadow: 3px 3px 0 var(--cartoon-brown);
}
.preview-close-btn:active {
  transform: scale(0.95);
}

.preview-body {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #FFF6BD 0%, #FFE0EC 100%);
  border-radius: 12px;
  padding: 20px;
  min-height: 320px;
  border: 2.5px dashed var(--cartoon-brown);
}
.img-stage {
  max-width: 100%;
  max-height: 70vh;
  touch-action: none;  /* 禁掉浏览器的默认 pinch / pan，我们自己处理 */
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;            /* 缩放后裁剪到舞台内 */
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;          /* 阻止默认触摸滚动，预留双指缩放 */
}
.img-stage.is-zoomed { cursor: grab; }
.img-stage.is-grabbing { cursor: grabbing; }
.preview-img,
.preview-video {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 12px;
  border: 3px solid var(--cartoon-brown);
  box-shadow: 4px 4px 0 var(--cartoon-brown);
  background: #fff;
  display: block;
}
.preview-img {
  transform-origin: center center;
  will-change: transform;
}
.preview-img.is-zoomed { cursor: grab; }
.preview-img.is-zoomed:active { cursor: grabbing; }

/* ========== 缩放工具条 ========== */
.zoom-toolbar {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  background: #fff;
  border: 3px solid var(--cartoon-brown);
  border-radius: 999px;
  box-shadow: 3px 3px 0 var(--cartoon-brown);
  z-index: 6;
  user-select: none;
}
.zoom-btn {
  width: 32px;
  height: 32px;
  border: 2px solid var(--cartoon-brown);
  border-radius: 50%;
  background: #fff;
  font-size: 16px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--cartoon-brown);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.12s;
  color: var(--cartoon-brown-deep);
}
.zoom-btn:hover:not(:disabled) {
  background: var(--cartoon-yellow);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--cartoon-brown);
}
.zoom-btn:active:not(:disabled) {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--cartoon-brown);
}
.zoom-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  box-shadow: 1px 1px 0 var(--cartoon-brown);
}
.zoom-reset {
  font-size: 14px;
  background: var(--cartoon-mint);
}
.zoom-pct {
  font-weight: 900;
  font-size: 13px;
  color: var(--cartoon-brown-deep);
  min-width: 48px;
  text-align: center;
  cursor: pointer;
  padding: 0 4px;
  border-radius: 6px;
  transition: background 0.12s;
}
.zoom-pct:hover {
  background: var(--cartoon-yellow);
}

/* 缩放后底部小提示 */
.zoom-hint {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 800;
  color: var(--cartoon-brown);
  background: rgba(255, 255, 255, 0.92);
  border: 2px solid var(--cartoon-brown);
  border-radius: 999px;
  padding: 3px 12px;
  pointer-events: none;
  z-index: 5;
  box-shadow: 2px 2px 0 var(--cartoon-brown);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.zoom-hint .el-icon { font-size: 14px; }
.preview-video {
  width: 100%;
  max-width: 900px;
}

/* 左右切换按钮（悬浮在图片两侧） */
.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border: 3px solid var(--cartoon-brown);
  border-radius: 50%;
  background: #fff;
  color: var(--cartoon-brown-deep);
  font-size: 18px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 3px 3px 0 var(--cartoon-brown);
  z-index: 5;
  transition: all 0.15s;
}
.nav-btn:hover {
  background: var(--cartoon-yellow);
  transform: translateY(-50%) scale(1.1);
  box-shadow: 4px 4px 0 var(--cartoon-brown);
}
.nav-btn:active {
  transform: translateY(-50%) scale(0.95);
  box-shadow: 1px 1px 0 var(--cartoon-brown);
}
.nav-prev { left: 12px; }
.nav-next { right: 12px; }

@media (max-width: 600px) {
  .nav-btn { width: 40px; height: 40px; font-size: 14px; }
  .nav-prev { left: 6px; }
  .nav-next { right: 6px; }
}

.preview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.meta-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.meta-tag {
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
}
.meta-tag .cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cartoon-brown);
}
.meta-item {
  font-size: 13px;
  font-weight: 700;
  color: var(--cartoon-brown);
  padding: 3px 10px;
  background: var(--cartoon-bg-soft);
  border: 2px solid var(--cartoon-brown);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.meta-item .el-icon { font-size: 14px; }
.meta-item.animated-badge {
  color: #fff;
  background: linear-gradient(180deg, #B19BFF, #E26AC8);
  font-weight: 900;
  letter-spacing: 0.5px;
}
.meta-item.animated-badge.webp {
  background: linear-gradient(180deg, #6BD8FF, #A98CFF);
}
.footer-actions { display: flex; gap: 8px; }

@media (max-width: 600px) {
  .preview-footer { flex-direction: column; align-items: stretch; }
  .footer-actions { justify-content: stretch; }
  .footer-actions :deep(.el-button) { flex: 1; }
}
</style>
