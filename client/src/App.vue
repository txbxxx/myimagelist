<template>
  <div class="app-root">
    <AppHeader v-if="auth.isLoggedIn" />
    <main class="app-main">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
    <footer class="app-footer" v-if="auth.isLoggedIn">
      <span>糖果图库 · Made with <Icon icon="lucide:heart" class="ft-heart" /></span>
    </footer>
  </div>
</template>

<script setup>
import AppHeader from './components/AppHeader.vue';
import { onMounted, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useAuthStore } from './stores/auth';
import { useGalleryStore } from './stores/gallery';

const auth = useAuthStore();
const store = useGalleryStore();

async function loadData() {
  if (auth.isLoggedIn) {
    if (store.categories.length === 0) await store.fetchCategories();
    await store.fetchImages();
  }
}

onMounted(async () => {
  await loadData();
});

// 登录态变化时重新加载
watch(() => auth.isLoggedIn, async (loggedIn) => {
  if (loggedIn) {
    await loadData();
  } else {
    store.images = [];
    store.categories = [];
  }
});
</script>

<style scoped>
.app-root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-main {
  flex: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 16px 40px;
  box-sizing: border-box;
}
.app-footer {
  text-align: center;
  padding: 18px 0 28px;
  color: var(--cartoon-brown);
  font-weight: 800;
  font-size: 14px;
  position: relative;
}
.app-footer::before {
  content: '☁ ☁ ☁ ☁ ☁';
  display: block;
  font-size: 20px;
  letter-spacing: 16px;
  margin-bottom: 8px;
  opacity: 0.55;
  color: var(--cartoon-blue);
}
.ft-heart {
  color: var(--cartoon-pink);
  font-size: 16px;
  vertical-align: -2px;
  display: inline-block;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s, transform 0.25s; }
.fade-enter-from { opacity: 0; transform: translateY(8px); }
.fade-leave-to { opacity: 0; transform: translateY(-8px); }

@media (max-width: 600px) {
  .app-main { padding: 14px 12px 30px; }
}
</style>
