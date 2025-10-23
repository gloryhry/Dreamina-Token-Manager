########################################
# Stage 1: 前端构建（Vite + Vue）
########################################
FROM node:20-bullseye-slim AS client-build

WORKDIR /app

# 仅拷贝前端依赖清单并安装依赖（利用缓存）
COPY public/package*.json ./public/
RUN cd public && npm install

# 拷贝前端源码并构建
COPY public ./public
RUN cd public && npm run build


########################################
# Stage 2: 运行环境（Playwright + Node）
# 使用官方 Playwright 基镜像，内置 Chromium 及其依赖
########################################
FROM mcr.microsoft.com/playwright:v1.56.1-jammy

ENV NODE_ENV=production
WORKDIR /app

# 仅安装服务端运行依赖（排除 devDependencies）
COPY package*.json ./
# 使用 npm ci 保证与 package-lock.json 严格一致，避免 Playwright 版本漂移
RUN npm ci --omit=dev

# 拷贝服务端源码
COPY src ./src

# 拷贝前端构建产物
COPY --from=client-build /app/public/dist ./public/dist

# 运行期目录
RUN mkdir -p logs data

# 暴露端口（服务默认 3000，通过 SERVICE_PORT 可覆盖）
EXPOSE 3000

# 启动服务
CMD ["npm", "start"]
