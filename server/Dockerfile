# 构建阶段
FROM node:22-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./
COPY prisma ./prisma/

# 安装依赖
RUN npm ci

# 生成 Prisma Client（只为 linux-musl-openssl-3.0.x 平台）
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x
RUN npx prisma generate

# 复制源代码
COPY . .

# 构建 TypeScript
RUN npm run build

# 精简 node_modules - 只保留生产依赖
RUN npm prune --production && \
    npm cache clean --force

# 生产阶段
FROM node:22-alpine AS production

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production

# 从构建阶段复制精简后的 node_modules
COPY --from=builder /app/node_modules ./node_modules

# 复制 Prisma schema 和生成的 client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# 从构建阶段复制编译后的代码
COPY --from=builder /app/dist ./dist

# 复制 package.json（运行时可能需要）
COPY --from=builder /app/package.json ./

# 清理不必要的文件以减小镜像
RUN find /app/node_modules -name "*.md" -delete 2>/dev/null || true && \
    find /app/node_modules -name "*.ts" -not -name "*.d.ts" -delete 2>/dev/null || true && \
    find /app/node_modules -name "LICENSE*" -delete 2>/dev/null || true && \
    find /app/node_modules -name "CHANGELOG*" -delete 2>/dev/null || true && \
    rm -rf /app/node_modules/**/test 2>/dev/null || true && \
    rm -rf /app/node_modules/**/tests 2>/dev/null || true && \
    rm -rf /app/node_modules/**/.github 2>/dev/null || true

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# 暴露端口
EXPOSE 3001

# 启动命令（先运行数据库迁移，再启动服务）
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
