<!--
  🐰 卡通兔子 logo
  - 跟项目风格一致：粗描边 + 硬阴影
  - 取代 lucide:rabbit（简笔风撑不起吉祥物角色）
  - 颜色用 CSS 变量（--cartoon-brown）方便主题调整
  - size prop 控制尺寸
-->
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    role="img"
    :aria-label="alt"
    :class="{ float: animate }"
  >
    <!-- 阴影层（偏移 2px） -->
    <g transform="translate(2, 2)" opacity="0.35">
      <ellipse cx="32" cy="46" rx="20" ry="14" fill="#4A3B32" />
      <ellipse cx="20" cy="14" rx="5" ry="14" fill="#4A3B32" />
      <ellipse cx="44" cy="14" rx="5" ry="14" fill="#4A3B32" />
    </g>
    <!-- 兔子身体（米色） -->
    <ellipse cx="32" cy="46" rx="20" ry="14" fill="#FFE0EC" stroke="#4A3B32" stroke-width="3" />
    <!-- 耳朵（外层米色 + 内层粉） -->
    <ellipse cx="20" cy="14" rx="5" ry="14" fill="#FFE0EC" stroke="#4A3B32" stroke-width="3" />
    <ellipse cx="20" cy="16" rx="2" ry="9" fill="#FFADAD" />
    <ellipse cx="44" cy="14" rx="5" ry="14" fill="#FFE0EC" stroke="#4A3B32" stroke-width="3" />
    <ellipse cx="44" cy="16" rx="2" ry="9" fill="#FFADAD" />
    <!-- 头（白色圆） -->
    <circle cx="32" cy="36" r="14" fill="#FFF" stroke="#4A3B32" stroke-width="3" />
    <!-- 腮红 -->
    <circle cx="22" cy="40" r="3" fill="#FFADAD" opacity="0.6" />
    <circle cx="42" cy="40" r="3" fill="#FFADAD" opacity="0.6" />
    <!-- 眼睛（黑豆） -->
    <ellipse cx="26" cy="34" rx="2" ry="2.5" fill="#4A3B32" />
    <ellipse cx="38" cy="34" rx="2" ry="2.5" fill="#4A3B32" />
    <!-- 眼睛高光（让眼睛活） -->
    <circle cx="27" cy="33" r="0.8" fill="#FFF" />
    <circle cx="39" cy="33" r="0.8" fill="#FFF" />
    <!-- 鼻子（小红 Y） -->
    <path d="M 30 39 L 34 39 L 32 41 Z" fill="#FFADAD" stroke="#4A3B32" stroke-width="1.5" />
    <!-- 嘴（Y 下面两条线） -->
    <path d="M 32 41 Q 30 44 28 43" stroke="#4A3B32" stroke-width="1.5" fill="none" stroke-linecap="round" />
    <path d="M 32 41 Q 34 44 36 43" stroke="#4A3B32" stroke-width="1.5" fill="none" stroke-linecap="round" />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 36 },
  alt: { type: String, default: '兔子 logo' },
  animate: { type: Boolean, default: false },
});
</script>

<style scoped>
.float {
  animation: rabbit-float 3s ease-in-out infinite;
}
@keyframes rabbit-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
</style>
