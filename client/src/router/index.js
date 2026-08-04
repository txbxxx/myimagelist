import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  { path: '/', redirect: '/gallery' },
  { path: '/gallery', name: 'Gallery', component: () => import('../views/GalleryView.vue'), meta: { auth: true } },
  { path: '/upload', name: 'Upload', component: () => import('../views/UploadView.vue'), meta: { auth: true } },
  { path: '/categories', name: 'Categories', component: () => import('../views/CategoryManage.vue'), meta: { auth: true } },
  { path: '/login', name: 'Login', component: () => import('../views/LoginView.vue') }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

// 路由守卫：需要登录的页面 + 已登录用户访问 /login 自动跳画廊
router.beforeEach((to, from, next) => {
  const auth = useAuthStore();
  if (to.meta.auth && !auth.isLoggedIn) {
    next({ path: '/login', query: { redirect: to.fullPath } });
  } else if (to.path === '/login' && auth.isLoggedIn) {
    next('/gallery');
  } else {
    next();
  }
});

export default router;
