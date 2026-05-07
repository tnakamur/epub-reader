# ─────────────────────────────────────────────
# server/Dockerfile
# Oracle Cloud ARM64 (linux/arm64) 対応
# multi-stage build で本番イメージを軽量化
# ─────────────────────────────────────────────

# ── Stage 1: 依存関係インストール ──────────────
FROM node:20-alpine AS deps

WORKDIR /app

# ネイティブモジュールのビルドに必要
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install --omit=dev


# ── Stage 2: 本番イメージ ──────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# タイムゾーン設定
RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/Asia/Tokyo /etc/localtime \
    && echo "Asia/Tokyo" > /etc/timezone \
    && apk del tzdata

# 非rootユーザーで実行（セキュリティ）
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 依存関係をコピー
COPY --from=deps /app/node_modules ./node_modules

# ソースコードをコピー
COPY src/ ./src/
COPY package.json ./

# アップロードディレクトリを作成して権限付与
RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

# Graceful shutdown のため npm start ではなく node 直接起動
CMD ["node", "src/server.js"]
