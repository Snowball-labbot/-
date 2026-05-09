# 资产配置管理应用

一个用于记录个人资产配置、持仓流水、历史趋势和策略对比的全栈网页应用。

## 功能概览

- 邮箱密码登录、邀请码注册、管理员创建邀请码。
- Postgres 持久化保存持仓、交易流水和估值快照。
- 支持基金、股票、债券、现金、房产、其他资产分类。
- 支持买入、卖出、调整、现金增减等交易流水，并自动重算持仓份额、成本和估值。
- 支持行情代码绑定、单资产价格刷新、浮盈浮亏展示。
- 支持总览趋势、单资产趋势、资产配置策略对比。
- 支持 AI 策略助手、持仓截图识别、HTML 资产分析报告。
- 支持当前资产导出和导入，推荐使用 `portfolio_backup_v1` JSON 格式。

## 技术栈

- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + Zustand + ECharts
- Backend: FastAPI + SQLAlchemy 2 + Postgres
- Auth: Argon2 password hash + server-side session cookie
- Market data: AKShare based backend quote service

## 本地启动

### 1. 安装前端依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，并按需修改：

```bash
DATABASE_URL=postgresql+psycopg://asset_user:asset_pass@localhost:5432/asset_manager
SESSION_SECRET=replace-with-a-long-random-secret
APP_ORIGIN=http://localhost:5173
```

如需使用 AI 策略助手，请在 `.env` 中额外配置：

```bash
AI_API_KEY=your-api-key
AI_BASE_URL=https://your-openai-compatible-endpoint/v1
AI_MODEL=your-chat-model
AI_VISION_MODEL=your-vision-model
```

不要提交 `.env`。

### 3. 启动数据库和后端

推荐安装 Docker Desktop 后运行：

```bash
docker compose up --build
```

如果不用 Docker，需要先安装后端依赖并准备 Postgres：

```bash
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### 4. 创建管理员账号

本机后端：

```bash
python -m backend.scripts.create_admin --email you@example.com --password your-password
```

Docker 后端：

```bash
docker compose exec backend python -m backend.scripts.create_admin --email you@example.com --password your-password
```

### 5. 启动前端

```bash
npm run dev
```

前端开发服务器会把 `/api` 代理到 `http://localhost:8000`。

## 常用命令

```bash
npm run check
npm run build
npm run test
python -m compileall backend
```

## 数据导入导出

侧边栏提供：

- 导出资产：下载 `portfolio_backup_YYYY-MM-DD.json`。
- 导入资产：上传同格式 JSON，导入后会在当前账号下新增资产，不覆盖已有资产。

推荐使用 JSON 而不是 CSV，因为 JSON 可以清楚保存持仓、交易流水、市场、代码、币种、汇率和行情更新时间等结构化信息。

## 安全说明

- `.env` 已被 `.gitignore` 忽略，不应上传 API Key、数据库密码或 Session Secret。
- 用户账号、资产持仓、交易流水存储在 Postgres 中，不会被 Git 代码提交包含。
- AI 策略助手仅用于分析和整理，不构成投资建议。
