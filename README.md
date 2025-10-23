# Dreamina Token Manager

一个用于管理 Dreamina AI 服务 SessionID Token 的完整解决方案，提供自动化的账户管理、SessionID 获取与刷新、以及 API 代理功能。

## 📋 功能特性

### 🔐 账户管理
- **批量账户添加**：支持单个或批量添加 Dreamina 账户
- **自动登录验证**：使用 Playwright 自动登录并获取 SessionID
- **账户状态监控**：实时显示账户登录状态和 Token 有效期
- **数据持久化**：支持文件存储和 Redis 两种存储模式

### 🔄 SessionID 管理
- **自动刷新**：智能检测即将过期的 SessionID 并自动刷新
- **手动刷新**：支持单个或批量强制刷新所有账户
- **过期预警**：24小时内过期的账户会有明显标识
- **负载均衡**：多个账户间轮询分配，提高并发性能

### 🌐 API 代理
- **透明代理**：将请求透传到目标 AI 服务
- **自动 Token 注入**：自动将有效的 SessionID 注入到请求头
- **负载均衡**：多个账户间智能分配请求
- **目标配置**：支持动态配置代理目标地址

### 🎨 Web 管理界面
- **现代化 UI**：基于 Vue 3 + Tailwind CSS 的响应式界面
- **实时更新**：通过 SSE 实现任务状态实时推送
- **批量操作**：支持批量添加、删除、刷新等操作
- **数据导出**：支持导出账户列表

### 🐳 部署支持
- **Docker 部署**：提供完整的 Docker 镜像和 Compose 配置
- **PM2 集群**：支持多进程部署，提高稳定性
- **Redis 集成**：可选的 Redis 支持用于分布式部署

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0
- 可选：Redis（用于分布式部署）
- 可选：Docker & Docker Compose

### 安装部署

#### 方式一：直接部署

```bash
# 1. 克隆项目
git clone <repository-url>
cd Qwen2API

# 2. 安装依赖
npm install

# 3. 安装前端依赖并构建
cd public
npm install
npm run build
cd ..

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 文件配置必要参数

# 5. 启动服务
npm run dev  # 开发模式
npm start    # 生产模式
```

#### 方式二：Docker 部署

```bash
# 1. 使用 Docker Compose（推荐）
docker compose -f docker-compose.yml up -d

# 2. 使用 Redis 模式
docker compose -f docker-compose-redis.yml up -d

# 3. 查看服务状态
docker compose ps
```

#### 方式三：PM2 部署

```bash
# 1. 安装 PM2
npm install -g pm2

# 2. 启动服务
npm run pm2

# 3. 查看状态
npm run pm2:status

# 4. 查看日志
npm run pm2:logs
```

## ⚙️ 配置说明

### 环境变量配置

创建 `.env` 文件并配置以下参数：

```env
# 服务配置
SERVICE_PORT=3000                    # 服务端口
LISTEN_ADDRESS=0.0.0.0              # 监听地址（可选）

# API 密钥配置
API_KEY=sk-dreamina-admin,sk-user1  # API 密钥列表，逗号分隔

# 数据存储配置
DATA_SAVE_MODE=file                 # 存储模式：none/file/redis
REDIS_URL=redis://localhost:6379    # Redis 连接地址（Redis 模式时必需）

# 代理配置
PROXY_TARGET=                       # 透传目标地址
PROXY_TIMEOUT_MS=600000             # 代理超时时间（毫秒）

# 功能开关
SIMPLE_MODEL_MAP=false              # 简化模型映射
OUTPUT_THINK=false                  # 输出思考过程
CACHE_MODE=default                  # 缓存模式

# 日志配置
LOG_LEVEL=INFO                      # 日志级别：DEBUG/INFO/WARN/ERROR
ENABLE_FILE_LOG=true                # 启用文件日志
LOG_DIR=./logs                      # 日志目录
MAX_LOG_FILE_SIZE=10                # 最大日志文件大小（MB）
MAX_LOG_FILES=5                     # 保留日志文件数量

# 代理日志
PROXY_LOG_BODY=false                # 记录请求体
PROXY_LOG_BODY_MAX=2048             # 请求体最大记录长度
```

### 数据存储模式

#### 1. None 模式（`DATA_SAVE_MODE=none`）
- 数据仅保存在内存中
- 服务重启后数据丢失
- 适合临时测试环境

#### 2. File 模式（`DATA_SAVE_MODE=file`）
- 数据保存在 `data/data.json` 文件中
- 服务重启后数据持久化
- 适合单机部署

#### 3. Redis 模式（`DATA_SAVE_MODE=redis`）
- 数据保存在 Redis 中
- 支持多实例共享数据
- 适合分布式部署

## 📖 使用指南

### Web 管理界面

1. **访问界面**
   ```
   http://localhost:3000
   ```

2. **登录认证**
   - 输入 API 密钥进行身份验证
   - 管理员密钥：`API_KEY` 中的第一个密钥

3. **添加账户**
   - 点击"添加账号"按钮
   - 支持单个添加或批量添加
   - 格式：`email:password`

4. **管理账户**
   - 查看账户状态和 SessionID 有效期
   - 单个或批量刷新 SessionID
   - 删除不需要的账户

5. **配置代理**
   - 设置透传目标地址
   - 实时查看代理状态

### API 接口

#### 账户管理接口

```bash
# 获取所有账户
GET /api/dreamina/getAllAccounts
Authorization: Bearer <API_KEY>

# 添加账户
POST /api/dreamina/addAccount
Authorization: Bearer <API_KEY>
Content-Type: application/json
{
  "email": "user@example.com",
  "password": "password123"
}

# 批量添加账户
POST /api/dreamina/addAccounts
Authorization: Bearer <API_KEY>
Content-Type: application/json
{
  "accounts": [
    "user1@example.com:password1",
    "user2@example.com:password2"
  ]
}

# 刷新单个账户 SessionID
POST /api/dreamina/refreshSessionId
Authorization: Bearer <API_KEY>
Content-Type: application/json
{
  "email": "user@example.com"
}

# 批量刷新 SessionID
POST /api/dreamina/refreshAllSessionIds
Authorization: Bearer <API_KEY>

# 强制刷新所有 SessionID
POST /api/dreamina/forceRefreshAllSessionIds
Authorization: Bearer <API_KEY>

# 删除账户
DELETE /api/dreamina/deleteAccount
Authorization: Bearer <API_KEY>
Content-Type: application/json
{
  "email": "user@example.com"
}

# 删除所有账户
DELETE /api/dreamina/deleteAllAccounts
Authorization: Bearer <API_KEY>
```

#### 代理配置接口

```bash
# 获取代理目标
GET /api/proxy/target
Authorization: Bearer <API_KEY>

# 设置代理目标
POST /api/proxy/target
Authorization: Bearer <API_KEY>
Content-Type: application/json
{
  "target": "https://api.example.com"
}
```

#### 代理接口

```bash
# 透传所有 API 请求
ALL /api/*
Headers:
- Authorization: Bearer <API_KEY>
- 其他标准 HTTP 头

系统会自动：
1. 验证 API 密钥
2. 选择可用的 Dreamina 账户
3. 注入 SessionID 到请求头
4. 转发请求到目标地址
5. 返回响应给客户端
```

## 🔧 开发指南

### 项目结构

```
Qwen2API/
├── src/                     # 后端源码
│   ├── config/             # 配置文件
│   ├── middlewares/        # 中间件
│   ├── routes/            # 路由定义
│   ├── utils/             # 工具类
│   ├── server.js          # 服务器入口
│   └── start.js           # 启动脚本
├── public/                # 前端源码
│   ├── src/              # Vue 源码
│   ├── dist/             # 构建产物
│   └── package.json      # 前端依赖
├── data/                 # 数据存储目录
├── logs/                 # 日志目录
├── docs/                 # 文档资源
├── docker-compose.yml    # Docker 编排文件
├── ecosystem.config.js   # PM2 配置文件
└── package.json          # 后端依赖
```

### 核心模块

#### 1. DreaminaAccount (`src/utils/dreamina-account.js`)
- 账户管理核心类
- 负责账户的增删改查
- 自动刷新 SessionID

#### 2. DreaminaTokenManager (`src/utils/dreamina-token-manager.js`)
- SessionID 获取和管理
- Playwright 自动登录
- Token 有效性验证

#### 3. DataPersistence (`src/utils/data-persistence.js`)
- 数据持久化抽象层
- 支持多种存储模式
- 统一的数据访问接口

#### 4. ProxyRouter (`src/routes/proxy.js`)
- API 请求代理
- 负载均衡算法
- SessionID 自动注入

### 开发命令

```bash
# 开发模式（后端热重载）
npm run dev

# 构建前端
cd public && npm run build

# 启动生产环境
npm start

# PM2 进程管理
npm run pm2          # 启动
npm run pm2:restart  # 重启
npm run pm2:logs     # 查看日志
npm run pm2:status   # 查看状态
npm run pm2:delete   # 删除进程
```

### 代码规范

- **语言**：JavaScript (Node.js CommonJS)
- **风格**：单引号、无分号、2 空格缩进
- **命名**：
  - 文件名：`kebab-case`
  - 类名：`PascalCase`
  - 变量/函数：`camelCase`
- **设计原则**：KISS、DRY、YAGNI、SOLID

## 🔍 监控与日志

### 日志系统

系统提供完整的日志记录功能：

```bash
# 查看应用日志
tail -f logs/app.log

# 查看 PM2 日志
npm run pm2:logs

# 查看 Docker 日志
docker compose logs -f
```

### 日志级别

- **DEBUG**：详细的调试信息
- **INFO**：一般信息记录
- **WARN**：警告信息
- **ERROR**：错误信息

### 关键监控指标

1. **账户状态**：登录成功率、SessionID 有效期
2. **代理性能**：请求成功率、响应时间
3. **系统资源**：内存使用、CPU 负载
4. **错误统计**：失败请求、异常次数

## 🚨 故障排查

### 常见问题

#### 1. 账户登录失败
**症状**：添加账户时提示登录失败
**解决方案**：
- 检查账户密码是否正确
- 确认网络连接正常
- 验证 Dreamina 网站可访问性
- 查看详细日志确定具体原因

#### 2. SessionID 刷新失败
**症状**：自动刷新或手动刷新失败
**解决方案**：
- 检查账户密码是否已更改
- 确认 Dreamina 登录流程未变更
- 验证网络连接稳定性
- 查看日志中的错误信息

#### 3. 代理请求失败
**症状**：API 请求返回错误
**解决方案**：
- 检查代理目标地址是否正确
- 确认有可用的 Dreamina 账户
- 验证 API 密钥有效性
- 检查网络连接和防火墙设置

#### 4. 前端页面无法访问
**症状**：浏览器显示 404 或 500 错误
**解决方案**：
- 确认前端已正确构建：`cd public && npm run build`
- 检查 `public/dist` 目录是否存在
- 验证服务器启动是否正常
- 查看服务器日志获取详细错误信息

### 调试模式

启用详细日志进行问题诊断：

```env
# .env 文件
LOG_LEVEL=DEBUG
ENABLE_FILE_LOG=true
PROXY_LOG_BODY=true
```

## 🤝 贡献指南

### 提交规范

使用 Conventional Commits 规范：

```bash
feat: 添加新功能
fix: 修复问题
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
test: 测试相关
chore: 构建过程或辅助工具的变动
```

### Pull Request 流程

1. Fork 项目仓库
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m "feat: 添加新功能"`
4. 推送分支：`git push origin feature/your-feature`
5. 创建 Pull Request

### 代码审查

- 确保代码风格一致
- 添加必要的测试
- 更新相关文档
- 验证功能正常工作

## 📄 许可证

本项目采用 ISC 许可证。详见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

感谢以下开源项目的支持：

- [Express.js](https://expressjs.com/) - Web 框架
- [Vue.js](https://vuejs.org/) - 前端框架
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [Playwright](https://playwright.dev/) - 自动化测试
- [PM2](https://pm2.keymetrics.io/) - 进程管理
- [Axios](https://axios-http.com/) - HTTP 客户端

## 📞 支持

如果您在使用过程中遇到问题，请：

1. 查看本文档的故障排查部分
2. 检查 [Issues](../../issues) 页面
3. 创建新的 Issue 描述问题
4. 提供详细的错误信息和复现步骤

---

**注意**：本项目仅用于学习和研究目的，请遵守相关服务的使用条款和法律法规。