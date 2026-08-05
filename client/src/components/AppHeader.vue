<template>
  <header class="header">
    <div class="header-inner">
      <div class="logo" @click="$router.push('/gallery')">
        <RabbitLogo :size="36" alt="兔子 logo" :animate="true" class="logo-icon" />
        <h1 class="logo-text">糖果图库</h1>
      </div>
      <nav class="nav" v-if="auth.isLoggedIn">
        <router-link to="/gallery" class="nav-link" active-class="active">
          <el-icon><PictureFilled /></el-icon> 画廊
        </router-link>
        <router-link to="/upload" class="nav-link" active-class="active">
          <el-icon><UploadFilled /></el-icon> 上传
        </router-link>
        <router-link to="/categories" class="nav-link" active-class="active">
          <el-icon><PriceTag /></el-icon> 分类
        </router-link>
      </nav>
      <div class="user-box" v-if="auth.user">
        <el-icon class="user-icon"><User /></el-icon>
        <span class="user-greeting">{{ auth.user.username }}</span>
        <el-button size="small" @click="handleLogout">
          <el-icon><SwitchButton /></el-icon> 退出
        </el-button>
      </div>
    </div>
    <div class="deco">
      <Icon icon="lucide:cloud" />
      <Icon icon="lucide:star" />
      <Icon icon="lucide:cloud" />
      <Icon icon="lucide:flower-2" />
      <Icon icon="lucide:cloud" />
    </div>
  </header>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { ElMessageBox, ElMessage } from 'element-plus';
import {
  User, SwitchButton, UploadFilled, PriceTag, PictureFilled
} from '@element-plus/icons-vue';
import { Icon } from '@iconify/vue';
import RabbitLogo from './RabbitLogo.vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '退出', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning'
    });
  } catch {
    return;
  }
  auth.logout();
  ElMessage.success('已退出，下次见～');
  router.replace('/login');
}
</script>

<style scoped>
.header {
  background: linear-gradient(180deg, #FFFBE6 0%, #FFF0F5 100%);
  border-bottom: var(--cartoon-border);
  box-shadow: 0 4px 0 var(--cartoon-brown);
  position: sticky;
  top: 0;
  z-index: 100;
}
.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 14px 16px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}
.logo-icon {
  font-size: 36px;
  color: var(--cartoon-brown-deep);
  display: inline-block;
  transform-origin: center;
  transition: transform 0.3s;
}
.logo:hover .logo-icon { transform: rotate(-12deg) scale(1.1); }
.logo-text {
  margin: 0;
  font-size: 26px;
  font-weight: 900;
  color: var(--cartoon-brown-deep);
  letter-spacing: 1px;
}
.nav { display: flex; gap: 10px; flex-wrap: wrap; }
.nav-link {
  text-decoration: none;
  padding: 8px 18px;
  border: 2.5px solid var(--cartoon-brown);
  border-radius: 999px;
  font-weight: 800;
  color: var(--cartoon-brown-deep);
  background: #fff;
  box-shadow: 3px 3px 0 var(--cartoon-brown);
  transition: all 0.15s;
  font-size: 15px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.nav-link .el-icon { font-size: 16px; }
.nav-link:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--cartoon-brown);
  background: var(--cartoon-yellow);
}
.nav-link.active {
  background: linear-gradient(180deg, #B5E2FF, #A0C4FF);
}
.user-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 12px;
  background: #fff;
  border: 2.5px solid var(--cartoon-brown);
  border-radius: 999px;
  box-shadow: 2px 2px 0 var(--cartoon-brown);
}
.user-icon {
  color: var(--cartoon-pink);
  font-size: 18px;
}
.user-greeting {
  font-weight: 800;
  color: var(--cartoon-brown-deep);
  font-size: 14px;
}
.deco {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 22px;
  padding-bottom: 6px;
  opacity: 0.55;
  color: var(--cartoon-brown);
}
.deco .iconify { font-size: 18px; }
@media (max-width: 600px) {
  /* 三列 grid：Logo | 导航（占满中段）| 用户，避免 flex 挤换行 */
  .header-inner { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; }
  .nav { justify-self: end; }
  .logo-text { font-size: 22px; }
  .nav-link { padding: 6px 12px; font-size: 13px; }
  .user-box { padding: 2px 6px 2px 10px; }
  .user-greeting { display: none; }   /* 小屏只保留退出按钮，省空间 */
}
</style>
