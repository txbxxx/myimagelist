# ===== Client 镜像（生产用）=====
# 多阶段：node 构建 → nginx 托管

# ---- Stage 1: 构建静态资源 ----
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build    # 产物在 dist/

# ---- Stage 2: nginx 托管 ----
FROM nginx:1.27-alpine AS runtime

# 拷自定义配置（SPA fallback + 反代到 server）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 拷构建产物
COPY --from=build /app/dist /usr/share/nginx/html

# nginx 默认 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
