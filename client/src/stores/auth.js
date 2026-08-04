import { defineStore } from 'pinia';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
const TOKEN_KEY = 'gallery_token';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: null,
    loading: false
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
    authHeader: (state) => state.token ? { Authorization: `Bearer ${state.token}` } : {}
  },
  actions: {
    async register(username, password) {
      const { data } = await api.post('/auth/register', { username, password });
      if (data.ok) {
        this.setToken(data.token);
        this.user = data.user;
      }
      return data;
    },
    async login(username, password) {
      const { data } = await api.post('/auth/login', { username, password });
      if (data.ok) {
        this.setToken(data.token);
        this.user = data.user;
      }
      return data;
    },
    async fetchMe() {
      if (!this.token) return null;
      try {
        const { data } = await api.get('/auth/me', { headers: this.authHeader });
        if (data.ok) this.user = data.user;
        return data.user;
      } catch (e) {
        // token 失效
        this.logout();
        return null;
      }
    },
    setToken(token) {
      this.token = token;
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    },
    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem(TOKEN_KEY);
    }
  }
});

// 全局 axios 请求拦截器：自动加 token
export function setupAuthInterceptor(authStore) {
  api.interceptors.request.use(config => {
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }
    return config;
  });

  // 响应拦截器：401 自动登出
  api.interceptors.response.use(
    resp => resp,
    err => {
      if (err.response && err.response.status === 401) {
        authStore.logout();
        // 跳转到登录页
        if (window.location.hash !== '#/login') {
          window.location.hash = '#/login';
        }
      }
      return Promise.reject(err);
    }
  );

  return api;
}

export { api };
