import { defineStore } from 'pinia';
import { api, useAuthStore } from './auth';

export const useGalleryStore = defineStore('gallery', {
  state: () => ({
    images: [],
    categories: [],
    currentCategory: 'all',
    loading: false,
    previewVisible: false,
    previewIndex: 0
  }),
  getters: {
    filteredImages(state) {
      if (state.currentCategory === 'all') return state.images;
      return state.images.filter(img => img.categoryId === state.currentCategory);
    },
    currentPreviewImage(state) {
      return state.filteredImages[state.previewIndex] || null;
    },
    categoryMap(state) {
      const map = {};
      state.categories.forEach(c => { map[c.id] = c; });
      return map;
    }
  },
  actions: {
    async fetchImages() {
      this.loading = true;
      try {
        const { data } = await api.get('/images', { params: { category: this.currentCategory } });
        this.images = data;
      } finally {
        this.loading = false;
      }
    },
    async fetchCategories() {
      const { data } = await api.get('/categories');
      this.categories = data;
    },
    async uploadFiles(formData, config = {}) {
      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        ...config
      });
      if (data.ok) {
        await this.fetchImages();
      }
      return data;
    },
    async deleteImage(id) {
      await api.delete(`/images/${id}`);
      this.images = this.images.filter(i => i.id !== id);
    },
    async renameImage(id, newName) {
      const { data } = await api.put(`/images/${id}`, { name: newName });
      if (data.ok) {
        const idx = this.images.findIndex(i => i.id === id);
        if (idx > -1) this.images[idx].originalName = data.image.originalName;
      }
      return data;
    },
    async addCategory(name, color) {
      const { data } = await api.post('/categories', { name, color });
      if (data.ok) {
        this.categories.push(data.category);
      }
      return data;
    },
    async updateCategory(id, payload) {
      const { data } = await api.put(`/categories/${id}`, payload);
      if (data.ok) {
        const idx = this.categories.findIndex(c => c.id === id);
        if (idx > -1) this.categories[idx] = data.category;
      }
      return data;
    },
    async deleteCategory(id) {
      const { data } = await api.delete(`/categories/${id}`);
      if (data.ok) {
        this.categories = this.categories.filter(c => c.id !== id);
        if (this.currentCategory === id) this.currentCategory = 'all';
      }
      return data;
    },
    setCategory(id) {
      this.currentCategory = id;
      this.fetchImages();
    },
    openPreview(index) {
      this.previewIndex = index;
      this.previewVisible = true;
    },
    closePreview() {
      this.previewVisible = false;
    },
    nextImage() {
      if (this.filteredImages.length === 0) return;
      this.previewIndex = (this.previewIndex + 1) % this.filteredImages.length;
    },
    prevImage() {
      if (this.filteredImages.length === 0) return;
      this.previewIndex = (this.previewIndex - 1 + this.filteredImages.length) % this.filteredImages.length;
    }
  }
});
