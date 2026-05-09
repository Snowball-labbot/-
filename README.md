# 资产配置记录应用

这是一个用于管理个人资产配置、持仓流水和历史趋势的全栈网页应用。

## 功能特点

- **邀请注册登录**：自建 FastAPI Auth，使用 httpOnly Cookie 保存会话。
- **真实持仓记账**：资产、持仓份额、单位成本、费用、币种和汇率分开记录。
- **交易流水**：支持买入、卖出、手动调价/调整，自动更新持仓成本和估值。
- **历史趋势**：基于估值快照生成总资产和单资产趋势。
- **旧数据导入**：可把旧版 localStorage 中的资产导入为初始持仓。

## 技术栈

- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + Zustand + ECharts
- Backend: FastAPI + SQLAlchemy 2 + Postgres
- Auth: Argon2 password hash + server-side session cookie

## 本地启动

### 1. 安装前端依赖

```bash
npm install
```

### 2. 启动数据库和后端

推荐安装 Docker Desktop 后运行：

```bash
docker compose up --build
```

如果不用 Docker，需要先安装 `backend/requirements.txt`，并准备一个 Postgres 数据库：

```bash
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### 3. 创建管理员账号

```bash
python -m backend.scripts.create_admin --email you@example.com --password your-password
```

如果使用 Docker 后端：

```bash
docker compose exec backend python -m backend.scripts.create_admin --email you@example.com --password your-password
```

管理员登录后可通过 API 创建邀请码：

```bash
curl -X POST http://localhost:8000/api/admin/invites \
  -H "Content-Type: application/json" \
  --cookie "asset_session=<your-session-cookie>" \
  -d "{\"max_uses\":1}"
```

### 4. 启动前端

```bash
npm run dev
```

前端开发服务器会把 `/api` 代理到 `http://localhost:8000`。

## 构建和检查

```bash
npm run check
npm run build
python -m compileall backend
```
