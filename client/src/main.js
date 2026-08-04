import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElIcons from '@element-plus/icons-vue';

import App from './App.vue';
import router from './router';
import './styles/cartoon.css';
import { useAuthStore, setupAuthInterceptor } from './stores/auth';

const app = createApp(App);
const pinia = createPinia();

// 全局注册 Element Plus 图标
for (const [name, comp] of Object.entries(ElIcons)) {
  app.component(name, comp);
}

app.use(pinia);
app.use(router);
app.use(ElementPlus);

// 关键：先初始化 auth store，再装 axios 拦截器
const auth = useAuthStore();
setupAuthInterceptor(auth);
// 如果有 token（页面刷新后），先尝试获取用户信息
if (auth.token) {
  auth.fetchMe();
}

app.mount('#app');
