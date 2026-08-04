<template>
  <div class="login-view">
    <div class="login-card">
      <div class="login-header">
        <Icon icon="lucide:rabbit" class="logo-bunny" />
        <h1>糖果图库</h1>
        <p>{{ isLogin ? '登录到你的图库' : '创建一个新账号' }}</p>
      </div>

      <el-form @submit.prevent="onSubmit" class="login-form">
        <el-form-item>
          <label class="lbl">
            <el-icon><User /></el-icon> 用户名
          </label>
          <el-input
            v-model="username"
            placeholder="3-20 位字母/数字/下划线"
            maxlength="20"
            clearable
            size="large"
          />
        </el-form-item>

        <el-form-item>
          <label class="lbl">
            <el-icon><Lock /></el-icon> 密码
          </label>
          <el-input
            v-model="password"
            type="password"
            placeholder="至少 6 位"
            maxlength="64"
            show-password
            size="large"
            @keyup.enter="onSubmit"
          />
        </el-form-item>

        <el-form-item v-if="!isLogin">
          <label class="lbl">
            <el-icon><Lock /></el-icon> 确认密码
          </label>
          <el-input
            v-model="confirmPassword"
            type="password"
            placeholder="再输一次"
            maxlength="64"
            show-password
            size="large"
            @keyup.enter="onSubmit"
          />
        </el-form-item>

        <el-button
          type="primary"
          :loading="auth.loading"
          @click="onSubmit"
          size="large"
          class="submit-btn"
        >
          <el-icon v-if="isLogin"><Right /></el-icon>
          <Icon v-else icon="lucide:sparkles" />
          {{ isLogin ? '登录' : '注册并登录' }}
        </el-button>

        <div class="switch-mode">
          {{ isLogin ? '还没有账号？' : '已经有账号了？' }}
          <!-- a11y: 用 button 而不是 <a>，才能被键盘聚焦 + 屏幕阅读器识别为按钮 -->
          <button type="button" class="link" @click="toggleMode" :aria-label="isLogin ? '切换到注册' : '切换到登录'">
            {{ isLogin ? '去注册' : '去登录' }}
          </button>
        </div>
      </el-form>

      <div class="tip-box">
        <el-icon class="tip-icon"><InfoFilled /></el-icon>
        <span>密码用 bcrypt 加密存储，token 默认 7 天有效。{{ isLogin ? '' : '忘记密码暂不支持找回哦～' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock, Right, InfoFilled } from '@element-plus/icons-vue';
import { Icon } from '@iconify/vue';
import { useAuthStore } from '../stores/auth';
import { useGalleryStore } from '../stores/gallery';

const auth = useAuthStore();
const gallery = useGalleryStore();
const router = useRouter();

const isLogin = ref(true);
const username = ref('');
const password = ref('');
const confirmPassword = ref('');

onMounted(() => {
  // 如果已经登录，直接跳到画廊
  if (auth.isLoggedIn) {
    router.replace('/gallery');
  }
});

function toggleMode() {
  isLogin.value = !isLogin.value;
  password.value = '';
  confirmPassword.value = '';
}

async function onSubmit() {
  const name = username.value.trim();
  if (!name) {
    ElMessage.warning('请输入用户名');
    return;
  }
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(name)) {
    ElMessage.warning('用户名只能是 2-20 位字母/数字/下划线/中文');
    return;
  }
  if (password.value.length < 6) {
    ElMessage.warning('密码至少 6 位');
    return;
  }
  if (!isLogin.value && password.value !== confirmPassword.value) {
    ElMessage.warning('两次密码输入不一致');
    return;
  }
  auth.loading = true;
  try {
    const fn = isLogin.value ? auth.login : auth.register;
    const res = await fn(name, password.value);
    if (res.ok) {
      ElMessage.success({ message: isLogin.value ? '登录成功' : '注册成功', icon: undefined });
      // 拉取数据
      await Promise.all([gallery.fetchCategories(), gallery.fetchImages()]);
      router.replace('/gallery');
    } else {
      ElMessage.error(res.error || '操作失败');
    }
  } catch (err) {
    ElMessage.error(err.response?.data?.error || err.message || '操作失败');
  } finally {
    auth.loading = false;
  }
}
</script>

<style scoped>
.login-view {
  min-height: 80vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px 16px;
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border: 3px solid var(--cartoon-brown);
  border-radius: var(--cartoon-radius);
  box-shadow: 6px 6px 0 var(--cartoon-brown);
  padding: 30px 30px 24px;
}

.login-header {
  text-align: center;
  margin-bottom: 20px;
}
.logo-bunny {
  display: inline-block;
  font-size: 56px;
  color: var(--cartoon-pink);
  animation: float 3s ease-in-out infinite;
}
.login-header h1 {
  margin: 8px 0 4px;
  font-size: 28px;
  font-weight: 900;
  color: var(--cartoon-brown-deep);
}
.login-header p {
  margin: 0;
  color: var(--cartoon-brown);
  font-weight: 700;
}

.login-form { margin-top: 18px; }

.lbl {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 800;
  color: var(--cartoon-brown-deep);
  font-size: 14px;
  margin-bottom: 6px;
}
.lbl .el-icon { font-size: 15px; color: var(--cartoon-pink); }

.submit-btn {
  width: 100%;
  font-size: 17px !important;
  margin-top: 6px;
}
.submit-btn .el-icon,
.submit-btn .iconify {
  margin-right: 4px;
  font-size: 18px;
  vertical-align: -3px;
}

.switch-mode {
  text-align: center;
  margin-top: 14px;
  font-size: 13px;
  color: var(--cartoon-brown);
  font-weight: 600;
}
.link {
  /* 重置 button 默认样式，让它看起来跟原来 <a> 一样 */
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  color: #A0C4FF;
  text-decoration: underline wavy var(--cartoon-pink);
  font-weight: 900;
  cursor: pointer;
  margin-left: 4px;
}
.link:hover { color: var(--cartoon-pink); }

.tip-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 18px;
  padding: 10px 14px;
  background: var(--cartoon-bg-soft);
  border: 2.5px dashed var(--cartoon-brown);
  border-radius: var(--cartoon-radius-sm);
  font-size: 12px;
  color: var(--cartoon-brown-deep);
  font-weight: 600;
  line-height: 1.5;
}
.tip-icon {
  font-size: 18px !important;
  color: var(--cartoon-yellow);
  flex-shrink: 0;
  margin-top: 1px;
}

@media (max-width: 480px) {
  .login-card { padding: 24px 20px; }
}
</style>
