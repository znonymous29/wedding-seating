# 席位绘 - Wedding Seating

一个现代化的婚礼座位布置管理系统，支持多人实时协作。

![Tech Stack](https://img.shields.io/badge/React-18-blue) ![Tech Stack](https://img.shields.io/badge/Node.js-Express-green) ![Tech Stack](https://img.shields.io/badge/PostgreSQL-15-blue) ![Tech Stack](https://img.shields.io/badge/TypeScript-5-blue)

## ✨ 功能特性

### 宾客管理

- 📥 Excel 批量导入宾客名单
- 📝 宾客信息编辑（人数、标签、备注等）
- 🏷️ 多标签分类管理
- 🔍 搜索、筛选、排序

### 座位安排

- 🖱️ 拖拽式座位安排
- 🤖 智能排座推荐
- ⚡ 一键自动排座
- 🔗 排座约束（必须同桌/不能同桌）

### 场地布局

- 📐 可视化场地编辑器
- 🖼️ 桌位自由拖拽布局
- 📤 导出高清布局图

### 多人协作

- 👥 邀请团队成员
- 🔐 角色权限管理（主办人/协作者/只读）
- ⚡ 实时数据同步
- 🟢 在线状态显示

### 数据统计

- 📊 宾客标签分布
- 📈 区域人数统计
- 📋 座位安排进度

## 🚀 快速开始

### 方式一：Docker 部署（推荐）

1. **安装 Docker 和 Docker Compose**

2. **配置环境变量**

```bash
# 复制环境变量示例文件
cp docker.env.example .env

# 编辑 .env 文件，修改以下配置：
# - POSTGRES_PASSWORD：数据库密码
# - JWT_SECRET：JWT 密钥（至少32位字符）
# - JWT_REFRESH_SECRET：刷新令牌密钥
```

3. **启动服务**

```bash
# 构建并启动所有服务
docker-compose up -d --build

# 查看日志
docker-compose logs -f
```

4. **访问应用**

- 前端: http://localhost
- 后端 API: http://localhost/api

5. **停止服务**

```bash
docker-compose down

# 如需删除数据卷
docker-compose down -v
```

---

### 方式二：本地开发

#### 环境要求

- Node.js >= 18
- PostgreSQL >= 14

#### 安装步骤

1. **克隆项目**

```bash
git clone https://github.com/your-username/wedding-seating.git
cd wedding-seating
```

2. **安装依赖**

```bash
# 安装前端依赖
cd client
npm install

# 安装后端依赖
cd ../server
npm install
```

3. **配置环境变量**

```bash
cd server
cp .env.example .env
# 编辑 .env 文件，配置数据库连接等信息
```

4. **初始化数据库**

```bash
cd server
npx prisma db push
npx prisma generate
```

5. **启动开发服务器**

```bash
# 启动后端 (在 server 目录)
npm run dev

# 启动前端 (在 client 目录)
npm run dev
```

6. **访问应用**

- 前端: http://localhost:5173
- 后端: http://localhost:3001

## 📁 项目结构

```
wedding-seating/
├── client/                 # 前端项目
│   ├── src/
│   │   ├── components/     # 组件
│   │   ├── pages/          # 页面
│   │   ├── services/       # API服务
│   │   ├── stores/         # 状态管理
│   │   └── ...
│   └── ...
├── server/                 # 后端项目
│   ├── src/
│   │   ├── routes/         # 路由
│   │   ├── middleware/     # 中间件
│   │   ├── socket/         # WebSocket
│   │   └── ...
│   └── prisma/
│       └── schema.prisma   # 数据库模型
└── README.md
```

## 🛠️ 技术栈

### 前端

- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI 组件**: Ant Design 5
- **状态管理**: Zustand
- **数据请求**: React Query + Axios
- **拖拽功能**: dnd-kit
- **实时通信**: Socket.IO Client

### 后端

- **框架**: Express + TypeScript
- **ORM**: Prisma
- **数据库**: PostgreSQL
- **认证**: JWT
- **实时通信**: Socket.IO
- **文件处理**: SheetJS (xlsx)

## 📝 环境变量说明

### 后端 (.env)

```env
# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/wedding_seating"

# JWT配置
JWT_SECRET="your-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# 服务器配置
PORT=3001
NODE_ENV=development

# 前端地址（CORS）
CLIENT_URL=http://localhost:5173
```

### 前端 (.env)

```env
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
```

## 🔑 API 接口

### 认证

- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `POST /api/auth/refresh` - 刷新 Token
- `GET /api/auth/me` - 获取当前用户

### 项目

- `GET /api/projects` - 获取项目列表
- `POST /api/projects` - 创建项目
- `GET /api/projects/:id` - 获取项目详情
- `PUT /api/projects/:id` - 更新项目
- `DELETE /api/projects/:id` - 删除项目

### 宾客

- `GET /api/guests/project/:projectId` - 获取宾客列表
- `POST /api/guests` - 添加宾客
- `PUT /api/guests/:id` - 更新宾客
- `DELETE /api/guests/:id` - 删除宾客
- `POST /api/guests/import/:projectId` - 导入 Excel

### 桌位

- `GET /api/tables/project/:projectId` - 获取桌位列表
- `POST /api/tables` - 创建桌位
- `POST /api/tables/batch` - 批量创建桌位

### 座位安排

- `POST /api/seating/assign` - 安排座位
- `DELETE /api/seating/unassign/:guestId` - 移除座位
- `PUT /api/seating/move` - 移动宾客
- `POST /api/seating/auto-assign` - 自动排座

## 🔄 CI/CD

项目使用 GitHub Actions 自动构建和推送 Docker 镜像。

### 自动构建触发条件

- 推送到 `main` / `master` 分支
- 创建版本标签 `v*`（如 `v1.0.0`）
- 手动触发

### 使用预构建镜像部署

```bash
# 1. 下载生产环境配置
wget https://raw.githubusercontent.com/your-username/wedding-seating/main/docker-compose.prod.yml

# 2. 创建环境变量文件
cat > .env << EOF
POSTGRES_PASSWORD=your-secure-password
JWT_SECRET=your-jwt-secret-at-least-32-characters
JWT_REFRESH_SECRET=your-refresh-secret-at-least-32-characters
SERVER_IMAGE=ghcr.io/your-username/wedding-seating-server:latest
CLIENT_IMAGE=ghcr.io/your-username/wedding-seating-client:latest
EOF

# 3. 启动服务
docker-compose -f docker-compose.prod.yml up -d
```

### GitHub Secrets 配置

如果使用 Docker Hub，需要在仓库设置中添加以下 Secrets：

- `DOCKERHUB_USERNAME`: Docker Hub 用户名
- `DOCKERHUB_TOKEN`: Docker Hub Access Token

## 📄 License

MIT License
