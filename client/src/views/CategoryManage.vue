<template>
  <div class="cat-manage-view">
    <!-- 标题 -->
    <div class="page-title">
      <Icon icon="lucide:tag" class="emoji" />
      <h2>分类管理</h2>
      <p>一共有 <b>{{ store.categories.length }}</b> 个分类，{{ totalImages }} 张图</p>
    </div>

    <!-- ============= 新建分类卡片 ============= -->
    <el-card shadow="never" class="card">
      <template #header>
        <span class="card-title-icon">
          <el-icon><Plus /></el-icon> 新建分类
        </span>
      </template>

      <div class="form-row">
        <div class="form-field">
          <label class="form-label">分类名</label>
          <el-input
            v-model="newName"
            placeholder="例：旅行 / 美食 / 头像"
            maxlength="20"
            show-word-limit
            clearable
          />
        </div>
        <div class="form-field">
          <label class="form-label">颜色</label>
          <div class="color-picker" role="radiogroup" aria-label="选择分类颜色">
            <button
              v-for="c in palette"
              :key="c"
              type="button"
              class="color-dot"
              :class="{ active: newColor === c }"
              :style="{ background: c }"
              :title="c"
              :aria-label="`颜色 ${c}（${contrastLabel(c)}）`"
              :aria-checked="newColor === c"
              role="radio"
              @click="newColor = c"
            ></button>
          </div>
        </div>
        <el-button
          type="success"
          :disabled="!newName.trim() || creating"
          :loading="creating"
          @click="handleCreate"
        >
          <Icon icon="lucide:sparkles" /> 创建
        </el-button>
      </div>
    </el-card>

    <!-- ============= 分类列表 ============= -->
    <el-card shadow="never" class="card">
      <template #header>
        <div class="list-header">
          <span class="card-title-icon">
            <el-icon><List /></el-icon> 分类列表
          </span>
          <el-button size="small" @click="refresh" :loading="store.loading">
            <el-icon><Refresh /></el-icon> 刷新
          </el-button>
        </div>
      </template>

      <!-- 加载中 -->
      <div v-if="store.loading && store.categories.length === 0" class="loading-state">
        <Icon icon="lucide:loader" class="loading-emoji" />
        <p>正在把分类请出来～</p>
      </div>

      <!-- 空状态（不应该出现，默认分类永远有） -->
      <div v-else-if="store.categories.length === 0" class="empty-state">
        <Icon icon="lucide:tag" class="emoji" />
        <p>还没有分类，先建一个吧</p>
      </div>

      <!-- 列表 -->
      <div v-else class="cat-list">
        <div
          v-for="cat in store.categories"
          :key="cat.id"
          class="cat-row"
          :class="{ editing: editingId === cat.id }"
        >
          <!-- 颜色圆点 -->
          <span class="cat-color" :style="{ background: cat.color }"></span>

          <!-- 名字（普通 / 编辑模式） -->
          <template v-if="editingId === cat.id">
            <el-input
              v-model="editName"
              class="edit-input"
              maxlength="20"
              size="small"
              @keyup.enter="saveEdit(cat)"
              @keyup.esc="cancelEdit"
            />
            <div class="edit-colors" role="radiogroup" aria-label="编辑分类颜色">
              <button
                v-for="c in palette"
                :key="c"
                type="button"
                class="color-dot small"
                :class="{ active: editColor === c }"
                :style="{ background: c }"
                :aria-label="`颜色 ${c}（${contrastLabel(c)}）`"
                :aria-checked="editColor === c"
                role="radio"
                @click="editColor = c"
              ></button>
            </div>
            <div class="row-actions">
              <el-button size="small" type="primary" @click="saveEdit(cat)">保存</el-button>
              <el-button size="small" @click="cancelEdit">取消</el-button>
            </div>
          </template>

          <template v-else>
            <div class="cat-info">
              <div class="cat-name">{{ cat.name }}</div>
              <div class="cat-meta">
                <!-- 背景色跟分类走，文字色自动选对比度高的 -->
                <span
                  class="badge"
                  :style="{
                    background: cat.color,
                    color: readableTextColor(cat.color),
                    borderColor: readableTextColor(cat.color) === '#FFFFFF' ? '#FFFFFF' : 'var(--cartoon-brown)'
                  }"
                >{{ getCategoryCount(cat.id) }} 张图</span>
                <span v-if="cat.id.startsWith('cat_default')" class="default-tag">默认</span>
                <span v-else class="id-tag">id: {{ cat.id }}</span>
              </div>
            </div>
            <div class="row-actions">
              <el-button
                size="small"
                type="warning"
                @click="startEdit(cat)"
              >
                <el-icon><EditPen /></el-icon> 重命名
              </el-button>
              <el-button
                size="small"
                type="danger"
                :disabled="cat.id.startsWith('cat_default')"
                @click="askDelete(cat)"
              >
                <el-icon><Delete /></el-icon> 删除
              </el-button>
            </div>
          </template>
        </div>
      </div>
    </el-card>

    <!-- ============= 提示小贴士 ============= -->
    <div class="tips">
      <el-icon class="tip-icon"><InfoFilled /></el-icon>
      <span>
        删除分类前需要先把分类下的图片移走或删除；
        <b>「未分类」是默认分类</b>，不能删除也不能重命名。
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Plus, List, Refresh, EditPen, Delete, InfoFilled
} from '@element-plus/icons-vue';
import { Icon } from '@iconify/vue';
import { useGalleryStore } from '../stores/gallery';
import { readableTextColor, contrastRatio } from '../utils/color';

const store = useGalleryStore();

// 糖果色板（与后端一致）
const palette = [
  '#FFD6A5', '#FFADAD', '#FDFFB6', '#CAFFBF',
  '#9BF6FF', '#A0C4FF', '#BDB2FF', '#FFC6FF',
];

// 给色板按钮一个文字提示（对比度怎么样）
// 注：基准色已经从 #3E2723 升级到 #2E2019（与 readableTextColor 保持一致）
function contrastLabel(hex) {
  const r = contrastRatio(hex, '#2E2019');
  if (r == null) return '';
  if (r >= 7) return `对比度 ${r.toFixed(1)}（优秀）`;
  if (r >= 4.5) return `对比度 ${r.toFixed(1)}（达标）`;
  if (r >= 3) return `对比度 ${r.toFixed(1)}（偏低）`;
  return `对比度 ${r.toFixed(1)}（差）`;
}

const newName = ref('');
const newColor = ref(palette[5]);
const creating = ref(false);
const editingId = ref(null);
const editName = ref('');
const editColor = ref('');

const totalImages = computed(() => store.images.length);

function getCategoryCount(id) {
  return store.images.filter(img => img.categoryId === id).length;
}

async function handleCreate() {
  const name = newName.value.trim();
  if (!name) {
    ElMessage.warning('分类名不能为空');
    return;
  }
  creating.value = true;
  try {
    const res = await store.addCategory(name, newColor.value);
    if (res.ok) {
      ElMessage.success({ message: `分类「${name}」已创建`, icon: undefined });
      newName.value = '';
    } else {
      ElMessage.error(res.error || '创建失败');
    }
  } finally {
    creating.value = false;
  }
}

function startEdit(cat) {
  editingId.value = cat.id;
  editName.value = cat.name;
  editColor.value = cat.color;
}

function cancelEdit() {
  editingId.value = null;
  editName.value = '';
  editColor.value = '';
}

async function saveEdit(cat) {
  const name = editName.value.trim();
  if (!name) {
    ElMessage.warning('分类名不能为空');
    return;
  }
  const res = await store.updateCategory(cat.id, { name, color: editColor.value });
  if (res.ok) {
    ElMessage.success({ message: '已更新', icon: undefined });
    cancelEdit();
  } else {
    ElMessage.error(res.error || '更新失败');
  }
}

async function askDelete(cat) {
  const count = getCategoryCount(cat.id);
  if (count > 0) {
    await ElMessageBox.alert(
      `分类「${cat.name}」下还有 <b>${count}</b> 张图片，无法删除。<br/>请先把这些图片移走或删除。`,
      '无法删除',
      {
        confirmButtonText: '好的',
        type: 'warning',
        dangerouslyUseHTMLString: true
      }
    );
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确定要删除分类「${cat.name}」吗？此操作无法撤销。`,
      '确认删除',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );
  } catch {
    return;
  }
  const res = await store.deleteCategory(cat.id);
  if (res.ok) {
    ElMessage.success({ message: '分类已删除', icon: undefined });
  } else {
    ElMessage.error(res.error || '删除失败');
  }
}

async function refresh() {
  await Promise.all([store.fetchCategories(), store.fetchImages()]);
  ElMessage.success({ message: '已刷新', icon: undefined });
}

onMounted(async () => {
  if (store.categories.length === 0) await store.fetchCategories();
  if (store.images.length === 0) await store.fetchImages();
});
</script>

<style scoped>
.cat-manage-view { max-width: 900px; margin: 0 auto; }

.page-title { text-align: center; margin-bottom: 18px; }
.page-title .emoji {
  display: inline-block;
  font-size: 52px;
  color: var(--cartoon-pink);
  animation: float 3s ease-in-out infinite;
}
.page-title h2 {
  margin: 6px 0 4px;
  font-size: 26px;
  color: var(--cartoon-brown-deep);
  font-weight: 900;
}
.page-title p { color: var(--cartoon-brown); font-weight: 700; margin: 0; }
.page-title b { color: var(--cartoon-brown-deep); font-size: 18px; }

.card { margin-bottom: 18px; }

.card-title-icon {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
}
.card-title-icon .el-icon { color: var(--cartoon-pink); font-size: 16px; }
.card-title-icon .iconify { color: var(--cartoon-pink); font-size: 18px; }

/* ============ 新建分类表单 ============ */
.form-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.form-field { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 200px; }
.form-label {
  font-weight: 800;
  color: var(--cartoon-brown-deep);
  font-size: 14px;
}

.color-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 4px 0;
}
.color-dot {
  width: 32px;
  height: 32px;
  border: 2.5px solid var(--cartoon-brown);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--cartoon-brown);
  transition: all 0.15s;
  padding: 0;
}
.color-dot:hover { transform: translate(-1px, -1px) rotate(8deg); box-shadow: 3px 3px 0 var(--cartoon-brown); }
.color-dot.active {
  transform: translate(-1px, -1px) scale(1.15);
  box-shadow: 3px 3px 0 var(--cartoon-brown);
  outline: 3px solid #fff;
  outline-offset: -1px;
}
.color-dot.small { width: 22px; height: 22px; }

/* ============ 分类列表 ============ */
.list-header { display: flex; align-items: center; justify-content: space-between; }

.cat-list { display: flex; flex-direction: column; gap: 10px; }

.cat-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: 2.5px solid var(--cartoon-brown);
  border-radius: var(--cartoon-radius-sm);
  background: #fff;
  box-shadow: 3px 3px 0 var(--cartoon-brown);
  transition: transform 0.15s;
  flex-wrap: wrap;
}
.cat-row:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--cartoon-brown); }
.cat-row.editing {
  background: #FFFBE6;
  border-color: var(--cartoon-pink);
}

.cat-color {
  width: 28px;
  height: 28px;
  border: 2.5px solid var(--cartoon-brown);
  border-radius: 50%;
  box-shadow: 2px 2px 0 var(--cartoon-brown);
  flex-shrink: 0;
}

.cat-info { flex: 1; min-width: 200px; }
.cat-name {
  font-size: 16px;
  font-weight: 900;
  color: var(--cartoon-brown-deep);
  margin-bottom: 4px;
}
.cat-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.badge {
  display: inline-block;
  padding: 2px 10px;
  border: 2px solid var(--cartoon-brown);
  border-radius: 999px;
  font-weight: 800;
  color: var(--cartoon-brown-deep);
}
.default-tag {
  background: var(--cartoon-yellow);
  border: 2px solid var(--cartoon-brown);
  border-radius: 999px;
  padding: 1px 10px;
  font-weight: 800;
  color: var(--cartoon-brown-deep);
}
.id-tag {
  color: var(--cartoon-brown);
  font-family: monospace;
  opacity: 0.6;
}

.row-actions { display: flex; gap: 6px; flex-shrink: 0; }
.row-actions .el-icon { font-size: 14px; margin-right: 2px; }

.edit-input { width: 220px; }
.edit-colors { display: flex; gap: 6px; align-items: center; }

/* ============ 状态 ============ */
.loading-state { text-align: center; padding: 40px 20px; }
.loading-state .loading-emoji {
  font-size: 56px;
  color: var(--cartoon-pink);
  animation: spin 1.2s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-state p {
  margin-top: 10px;
  color: var(--cartoon-brown);
  font-weight: 700;
}

.empty-state { text-align: center; padding: 40px 20px; }
.empty-state .emoji { font-size: 64px; color: var(--cartoon-pink); animation: float 3s ease-in-out infinite; }
.empty-state p { margin-top: 10px; color: var(--cartoon-brown); font-weight: 700; }

/* ============ 底部提示 ============ */
.tips {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: var(--cartoon-bg-soft);
  border: 2.5px dashed var(--cartoon-brown);
  border-radius: var(--cartoon-radius-sm);
  font-size: 13px;
  color: var(--cartoon-brown-deep);
  font-weight: 600;
}
.tip-icon { font-size: 20px !important; color: var(--cartoon-yellow); }
.tips b { color: var(--cartoon-pink); }

/* 响应式 */
@media (max-width: 600px) {
  .form-row { flex-direction: column; align-items: stretch; }
  .cat-row { flex-direction: column; align-items: flex-start; }
  .row-actions { width: 100%; justify-content: flex-end; }
  .edit-input { width: 100%; }
  .edit-colors { flex-wrap: wrap; }
}
</style>
