# ===== Server 镜像（生产用）=====
# 多阶段：
#   1. ffmpeg-source：下载固定版本 ffmpeg 静态构建（BtbN/FFmpeg-Builds）
#   2. deps：        只装 prod deps
#   3. runtime：     node:22-alpine + 拷 ffmpeg + 拷应用代码
#
# ffmpeg 不用 alpine 仓库的包，原因：
#   ① alpine 仓库的 ffmpeg 版本不固定，跨时间构建会漂移
#   ② GPL 版缺 h264/aac（要手动加 edge 源）
#   ③ LGPL/GPL 切换要重装
# 用静态构建一次到位，编解码器全、版本可 pin、~80MB 增量可控。
#
# ffmpeg 来源：BtbN/FFmpeg-Builds
#   https://github.com/BtbN/FFmpeg-Builds/releases
#   提供 `latest-{platform}-{arch}-{license}` 标签，自动指向最新 release。
#   想锁版本就 docker build --build-arg FFMPEG_TAG=n7.1.1 ...
#
# 注意：GPL 版可用于个人/自部署项目；如果要避免 GPL 协议扩散，换成 -lgpl 变体。

# ---- Stage 1: 拉取固定版本 ffmpeg ----
FROM alpine:3.20 AS ffmpeg-source

ARG FFMPEG_TAG=latest-linux64-gpl
ARG FFMPEG_URL=https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_TAG}/ffmpeg-${FFMPEG_TAG}.tar.xz

RUN apk add --no-cache curl xz bash \
 && mkdir -p /opt/ffmpeg \
 && echo "Downloading ffmpeg from ${FFMPEG_URL}" \
 && curl -fsSL --retry 3 -o /tmp/ffmpeg.tar.xz "${FFMPEG_URL}" \
 && echo "Extracting..." \
 && tar -xJf /tmp/ffmpeg.tar.xz -C /opt/ffmpeg --strip-components=1 \
 && ls -la /opt/ffmpeg/bin/ \
 && /opt/ffmpeg/bin/ffmpeg -version | head -3 \
 && /opt/ffmpeg/bin/ffprobe -version | head -3

# ---- Stage 2: 装 prod deps ----
FROM node:22-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

# ---- Stage 3: 运行时 ----
FROM node:22-alpine AS runtime
WORKDIR /app

# 时区
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata \
 && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
 && echo $TZ > /etc/timezone

# ffmpeg/ffprobe 二进制（从 stage 1 拷过来）
# 静态构建不依赖 glibc/musl，alpine 也能直接跑
COPY --from=ffmpeg-source /opt/ffmpeg/bin/ffmpeg  /usr/local/bin/ffmpeg
COPY --from=ffmpeg-source /opt/ffmpeg/bin/ffprobe /usr/local/bin/ffprobe

# 验证 ffmpeg 真能跑（构建期 fail-fast，避免线上缺二进制）
RUN ffmpeg -version | head -1 \
 && ffprobe -version | head -1

# 非 root 用户
RUN addgroup -S app && adduser -S app -G app

# 拷 prod deps
COPY --from=deps --chown=app:app /app/node_modules ./node_modules

# 拷源码
COPY --chown=app:app package.json ./
COPY --chown=app:app index.js db.js storage.js ./
COPY --chown=app:app uploads ./.gitkeep ./uploads/
RUN mkdir -p uploads thumbs \
 && chown -R app:app uploads thumbs

USER app

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/api/health || exit 1

CMD ["node", "index.js"]
