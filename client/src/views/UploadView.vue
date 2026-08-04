<template>
  <div class="upload-view">
    <div class="page-title">
      <Icon icon="lucide:cloud-upload" class="emoji" />
      <h2>把图片传上来吧～</h2>
      <p>支持 jpg / png / gif / webp / mp4，可以一次拖好多张</p>
    </div>

    <!-- 分类选择 -->
    <el-card shadow="never" class="cat-card">
      <template #header>
        <span class="card-title-icon">
          <el-icon><PriceTag /></el-icon> 选择分类（不选默认「未分类」）
        </span>
      </template>
      <div class="cat-picker">
        <el-select
          v-model="categoryId"
          placeholder="选一个分类"
          style="width: 240px;"
        >
          <el-option
            v-for="c in store.categories"
            :key="c.id"
            :label="c.name"
            :value="c.id"
          >
            <span style="float:left">{{ c.name }}</span>
            <span
              :style="{ float:'right', width:'14px', height:'14px', borderRadius:'50%', background: c.color, border: '2px solid #4A3B32' }"
            ></span>
          </el-option>
        </el-select>
        <el-input
          v-model="newCategoryName"
          placeholder="或直接输入新分类名"
          style="width: 220px;"
          clearable
        />
        <el-button
          type="success"
          :disabled="!newCategoryName.trim()"
          @click="handleCreateCategory"
        >
          <el-icon><Plus /></el-icon> 新建分类
        </el-button>
      </div>
    </el-card>

    <!-- 上传区 -->
    <el-card shadow="never" class="upload-card">
      <template #header>
        <span class="card-title-icon">
          <el-icon><Upload /></el-icon> 拖拽上传
        </span>
      </template>

      <el-upload
        ref="uploadRef"
        class="drop-zone"
        drag
        multiple
        :auto-upload="false"
        :show-file-list="false"
        :accept="'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/ogg,video/quicktime'"
        :on-change="handleFileChange"
      >
        <div class="drop-content">
          <Icon icon="lucide:cloud-upload" class="cloud-anim" />
          <div class="drop-title">把图片或视频拖到这里，或<em>点击选文件</em></div>
          <div class="drop-tip">支持 jpg / png / gif / webp / mp4 / webm · 单个最大 100MB</div>
        </div>
      </el-upload>

      <!-- 待上传文件列表 + 进度 -->
      <transition-group name="file-list" tag="div" class="file-list" v-if="fileList.length">
        <div
          v-for="(item, idx) in fileList"
          :key="item.uid"
          class="file-item"
        >
          <div class="thumb">
            <img v-if="item.kind === 'image'" :src="item.url" />
            <video v-else :src="item.url" muted />
            <span v-if="item.kind === 'video'" class="kind-badge video">
              <el-icon><VideoCamera /></el-icon> 视频
            </span>
            <span v-else class="kind-badge image">
              <el-icon><Picture /></el-icon> 图片
            </span>
          </div>
          <div class="file-info">
            <div class="file-name" :title="item.name">{{ item.name }}</div>
            <el-progress
              :percentage="item.progress"
              :stroke-width="14"
              :status="progressStatus(item.status)"
            />
          </div>
          <el-button
            type="danger"
            size="small"
            @click="removeFile(idx)"
            :disabled="item.status === 'success'"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </transition-group>

      <div class="actions" v-if="fileList.length">
        <el-button @click="clearAll">
          <el-icon><Delete /></el-icon> 清空
        </el-button>
        <el-button
          type="primary"
          :loading="uploading"
          @click="submitUpload"
        >
          <Icon icon="lucide:rocket" /> 全部上传（{{ fileList.filter(f => f.status !== 'success').length }}）
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { PriceTag, Plus, Upload, Delete, VideoCamera, Picture } from '@element-plus/icons-vue';
import { Icon } from '@iconify/vue';
import { useGalleryStore } from '../stores/gallery';

const store = useGalleryStore();
const uploadRef = ref();
const fileList = ref([]);
const uploading = ref(false);
const categoryId = ref('cat_default');
const newCategoryName = ref('');

onMounted(async () => {
  if (store.categories.length === 0) await store.fetchCategories();
});

function handleFileChange(file) {
  // 仅添加新文件（避免重复）
  if (fileList.value.some(f => f.uid === file.uid)) return;
  // 判断是图片还是视频
  const isVideo = file.raw && file.raw.type && file.raw.type.startsWith('video/');
  const kind = isVideo ? 'video' : 'image';
  const item = {
    uid: file.uid,
    name: file.name,
    raw: file.raw,
    url: file.url || (file.raw ? URL.createObjectURL(file.raw) : ''),
    mimeType: file.raw ? file.raw.type : 'image/jpeg',
    kind,
    progress: 0,
    status: 'ready'
  };
  fileList.value.push(item);
}

// el-progress 的 status 只接受 "" / "success" / "warning" / "exception"
function progressStatus(s) {
  if (s === 'success' || s === 'exception' || s === 'warning') return s;
  return '';  // ready / uploading 都用空（普通彩色进度条）
}

function removeFile(idx) {
  fileList.value.splice(idx, 1);
}

function clearAll() {
  fileList.value = [];
}

async function handleCreateCategory() {
  const name = newCategoryName.value.trim();
  if (!name) return;
  const res = await store.addCategory(name);
  if (res.ok) {
    categoryId.value = res.category.id;
    newCategoryName.value = '';
    ElMessage.success(`分类「${name}」已新建 ✨`);
  } else {
    ElMessage.error(res.error || '新建失败');
  }
}

async function submitUpload() {
  const pending = fileList.value.filter(f => f.status !== 'success');
  if (pending.length === 0) {
    ElMessage.warning('没有可上传的文件');
    return;
  }
  uploading.value = true;
  let successCount = 0;
  for (const item of pending) {
    const fd = new FormData();
    fd.append('files', item.raw);
    fd.append('originalName', item.name);  // 单独传原名，避开 multer latin1 编码
    fd.append('categoryId', categoryId.value);
    item.status = 'uploading';
    try {
      // 模拟进度（axios onUploadProgress）
      const res = await store.uploadFiles(fd, {
        onUploadProgress: e => {
          if (e.total) {
            item.progress = Math.round((e.loaded / e.total) * 100);
          }
        }
      });
      if (res.ok) {
        item.progress = 100;
        item.status = 'success';
        successCount++;
      } else {
        item.status = 'exception';
        ElMessage.error(res.error || '上传失败');
      }
    } catch (err) {
      item.status = 'exception';
      ElMessage.error(err.message || '上传失败');
    }
  }
  uploading.value = false;
  if (successCount > 0) {
    ElMessage.success(`🎉 成功上传 ${successCount} 张图！`);
    // 清理已成功项
    fileList.value = fileList.value.filter(f => f.status !== 'success');
    await store.fetchImages();
  }
}
</script>

<style scoped>
.upload-view { max-width: 900px; margin: 0 auto; }
.page-title { text-align: center; margin-bottom: 18px; }
.page-title .emoji {
  display: inline-block;
  font-size: 52px;
  color: var(--cartoon-blue);
  animation: float 3s ease-in-out infinite;
}
.page-title h2 {
  margin: 6px 0 4px;
  font-size: 26px;
  color: var(--cartoon-brown-deep);
  font-weight: 900;
}
.page-title p { color: var(--cartoon-brown); font-weight: 700; margin: 0; }

.cat-card { margin-bottom: 18px; }
.cat-picker { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.cat-picker .el-select { min-width: 200px; }

.upload-card { margin-bottom: 18px; }
.drop-zone { width: 100%; }
.drop-zone :deep(.el-upload) { width: 100%; }
.drop-zone :deep(.el-upload-dragger) {
  width: 100%;
}
/* 拖拽进入时的明确反馈（Element Plus 默认只换 background，描边还是虚线不明显） */
.drop-zone :deep(.el-upload-dragger.is-dragover) {
  background: linear-gradient(135deg, #FFF6BD 0%, #FFE0EC 100%) !important;
  border: 3px solid var(--cartoon-pink) !important;  /* 虚线变实线 + 粉色 */
  border-radius: var(--cartoon-radius) !important;
  box-shadow: 0 0 0 4px rgba(255, 173, 173, 0.3), 4px 4px 0 var(--cartoon-brown) !important;
  transform: scale(1.01);
  transition: all 0.15s;
}
.drop-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 0 6px;
}
.cloud-anim {
  font-size: 80px;
  color: var(--cartoon-blue);
  line-height: 1;
  animation: float 2.6s ease-in-out infinite;
  filter: drop-shadow(2px 2px 0 #4A3B32);
}
.card-title-icon {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
}
.card-title-icon .el-icon { color: var(--cartoon-pink); }
.drop-title {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 800;
  color: var(--cartoon-brown-deep);
}
.drop-title em {
  font-style: normal;
  color: #A0C4FF;
  text-decoration: underline wavy var(--cartoon-pink);
}
.drop-tip {
  margin-top: 6px;
  font-size: 13px;
  color: var(--cartoon-brown);
  font-weight: 700;
}

.file-list { margin-top: 18px; display: flex; flex-direction: column; gap: 10px; }
.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border: 2.5px solid var(--cartoon-brown);
  border-radius: var(--cartoon-radius-sm);
  background: #fff;
  box-shadow: 3px 3px 0 var(--cartoon-brown);
}
.file-item .thumb {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 10px;
  border: 2.5px solid var(--cartoon-brown);
  overflow: hidden;
  background: linear-gradient(135deg, #FFF6BD, #FFE0EC);
  flex-shrink: 0;
}
.file-item .thumb img,
.file-item .thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.file-item .thumb .kind-badge {
  position: absolute;
  bottom: 2px;
  left: 2px;
  font-size: 9px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(255,255,255,0.92);
  color: var(--cartoon-brown-deep);
  border: 1.5px solid var(--cartoon-brown);
  white-space: nowrap;
}
.file-item .thumb .kind-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.file-item .thumb .kind-badge .el-icon { font-size: 11px; }
.file-item .thumb .kind-badge.video { background: var(--cartoon-pink); color: #fff; }
.file-info { flex: 1; min-width: 0; }
.file-name {
  font-weight: 700;
  color: var(--cartoon-brown-deep);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}
.actions {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.file-list-enter-active, .file-list-leave-active { transition: all 0.3s; }
.file-list-enter-from { opacity: 0; transform: translateY(-6px); }
.file-list-leave-to { opacity: 0; transform: translateX(20px); }

@media (max-width: 600px) {
  .cat-picker { flex-direction: column; align-items: stretch; }
  .cat-picker .el-select,
  .cat-picker .el-input { width: 100% !important; }
  .cloud-anim { font-size: 56px; }
}
</style>
