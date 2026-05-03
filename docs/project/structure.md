# ParaRouter 项目结构总览

> 本文档描述 ParaRouter 代码库的整体架构、模块职责与目录结构。

---

## 1. 项目总览

**ParaRouter** 是一个 LLM API 路由网关，采用**控制平面 / 数据平面分离**架构：

| 模块 | 技术栈 | 职责 | 端口 |
|------|--------|------|------|
| **Gateway** | Rust + Axum | 数据平面：LLM 请求转发、认证、计费扣费 | `8000` |
| **Hub** | Node.js + Express | 控制平面：用户管理、定价中心、Provider 配置 | `3322` |
| **Web** | React 19 + Vite | 前端控制台：模型广场、聊天 Playground、管理后台 | `5173` (dev) |

---

## 2. 顶层目录结构

```
ParaRouter/
├── gateway/              # Rust 数据平面
├── hub/                  # Node.js 控制平面 (BFF)
├── web/                  # React 前端控制台
├── packages/             # 共享库
│   └── shared/           # 类型定义 + 数据库 Schema
├── docs/                 # 架构与设计文档
├── scripts/              # 本地开发/测试脚本
├── deploy/               # 生产部署配置
├── package.json          # 根 package.json (npm workspaces)
├── README.md
└── AGENTS.md
```

---

## 3. Gateway (`gateway/`) — Rust 数据平面

### 3.1 目录结构

```
gateway/src/
├── main.rs              # 入口：加载 .env、初始化 tracing、连接 PostgreSQL、启动 Axum
├── lib.rs               # 根模块，聚合所有子模块
├── runtime.rs           # 运行时状态：PgPool + UniGatewayEngine
├── api/                 # HTTP 数据平面端点
│   ├── mod.rs           # 路由注册
│   ├── openai.rs        # POST /v1/chat/completions, POST /v1/embeddings
│   ├── anthropic.rs     # POST /v1/messages
│   └── models.rs        # GET /v1/models
├── auth/                # 认证与授权
│   ├── mod.rs
│   └── keys.rs          # API Key 校验、用户 ACL、余额检查
├── db/                  # 数据库层
│   ├── mod.rs
│   ├── init.rs          # 数据库初始化与 Schema 迁移
│   ├── pool.rs          # DatabasePool 抽象
│   ├── models.rs        # ORM/数据模型定义
│   └── schema.rs        # SQLite Schema（遗留）
├── routing/             # 路由解析
│   ├── mod.rs
│   └── resolve.rs       # model_id → Provider Pool 选路
├── sync/                # 后台同步器
│   ├── mod.rs
│   ├── bootstrap.rs     # 启动后台轮询（60 秒周期）
│   ├── pools.rs         # DB 数据加载到 UniGateway Engine
│   └── notify.rs        # 占位（stub）
├── translators/         # 协议转换层
│   ├── mod.rs
│   ├── openai.rs        # OpenAI JSON → ProxyChatRequest
│   └── anthropic.rs     # Anthropic JSON → ProxyChatRequest
└── usage/               # 计费与用量
    ├── mod.rs
    ├── hooks.rs         # GatewayHooks：扣费 + 活动记录
    └── activity.rs      # 占位（stub）
```

### 3.2 核心职责

- **多协议兼容**：同时暴露 OpenAI (`/v1/chat/completions`, `/v1/embeddings`) 和 Anthropic (`/v1/messages`) 端点，内部统一转换为 `ProxyChatRequest`。
- **认证与授权**：支持 `Authorization: Bearer <token>` 和 `x-api-key` 双头部；查询 `user_api_keys` + `users` 表；检查余额与 Key 预算限制。
- **路由解析**：根据 `model_id` 和当前定价版本查询 `model_provider_pricings`，按优先级排序选出最优 Provider。
- **后台同步**：启动时立即同步一次，随后每 60 秒从 PostgreSQL 拉取 Provider/定价配置，热更新到内存中的 UniGateway Engine。
- **实时计费**：通过 `GatewayHooks` 在请求完成后即时扣除用户余额、更新 Key 用量、写入 `activity` 表。

### 3.3 关键技术栈

| 类别 | 依赖 | 用途 |
|------|------|------|
| Web 框架 | `axum 0.7`, `tower 0.4`, `tower-http 0.5` | HTTP 服务、路由、CORS、Trace |
| 异步运行时 | `tokio 1.0` | 异步 IO、后台任务 |
| LLM 引擎 | `unigateway-sdk 1.7.1` | 核心网关引擎：驱动注册、Pool 管理、负载均衡、流式响应 |
| 序列化 | `serde`, `serde_json`, `serde_yaml` | JSON/YAML 序列化 |
| HTTP 客户端 | `reqwest 0.12` | 上游 LLM Provider 请求 |
| 数据库 | `sqlx 0.8` (Postgres + SQLite + migrate) | 异步 SQL、连接池、模型映射 |
| 日志 | `tracing`, `tracing-subscriber` | 结构化日志 |
| 安全/邮件 | `bcrypt 0.16`, `resend-rs 0.21.1` | 密码哈希、邮件发送 |

---

## 4. Hub (`hub/`) — Node.js 控制平面

### 4.1 目录结构

```
hub/
├── server.ts            # Express 入口：初始化数据库、注册路由、集成 Vite SSR/静态托管
├── db.ts                # PostgreSQL 连接池与数据库初始化
├── types.ts             # AuthenticatedRequest 类型扩展
├── utils.ts             # 工具函数：密码哈希、Resend 邮件、Provider 目录抓取
├── middleware/
│   └── auth.ts          # JWT/Bearer Token 认证与角色权限中间件
├── routes/
│   ├── auth.ts          # 登录/注册/验证码/密码修改
│   ├── billing.ts       # 管理员余额充值
│   ├── chat.ts          # Playground 聊天代理（转发到 Gateway）
│   ├── customers.ts     # 客户/子账号 CRUD、API Key 管理
│   ├── gateway.ts       # Gateway 实例注册、配置下发、用量上报
│   ├── keys.ts          # 用户自有 API Key 管理
│   ├── llm_models.ts    # 全局 LLM 模型元数据管理
│   ├── models.ts        # 路由模型列表、同步、Provider 绑定
│   ├── pricing.ts       # 定价草稿/发布/历史版本管理
│   ├── providers.ts     # Provider 账户与密钥、刷新上游模型目录
│   ├── activity.ts      # 活动日志查询与统计
│   └── rankings.ts      # 模型排行榜与综合统计
├── scripts/             # （当前为空）
└── tests/               # 测试脚本
    ├── memtensor_newapi_models.test.ts
    └── ...
```

### 4.2 核心职责

- **用户与认证**：自定义 Session 机制（`auth_sessions` 表，30 天过期），支持用户名/邮箱 + 密码登录、邮箱验证码注册、密码修改。
- **客户管理**：管理员可创建客户并绑定 API Key；支持为客户充值、设置定价倍数、允许模型列表。
- **定价中心**：唯一对客售价入口，支持 `fixed` / `markup` 两种 price_mode；草稿编辑 → 预览差异 → 一键发布（事务保证 + `pg_notify` 通知 Gateway）。
- **Provider 管理**：管理上游 Provider 账户与 API Key；自动抓取上游模型目录并持久化。
- **配置下发**：Gateway 通过 HTTP 向 Hub 注册并拉取配置；Hub 通过 `pg_notify('config_changed', ...)` 实现配置热更新通知。
- **Playground 代理**：`chat.ts` 自动为用户生成临时 API Key，将聊天请求转发到本地 Gateway (`127.0.0.1:8000`)，支持 SSE 流式透传。
- **统计与洞察**：活动日志查询、7 天统计摘要（Token / Cost / Latency 及环比）、每日趋势图表、模型排行榜。

### 4.3 API 端点概览

#### 公开端点（无需认证）
- `GET  /api/health`
- `GET  /api/llm-models`
- `GET  /api/models`
- `POST /api/auth/login`
- `POST /api/auth/register/request`
- `POST /api/auth/register/verify`
- `POST /api/gateway/usage`

#### 认证后通用端点
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `POST /api/auth/change-password`
- `GET|POST|PATCH|DELETE /api/user-api-keys`
- `POST /api/chat/completions`

#### Admin 专属端点
- `POST /api/auth/set-admin`
- `POST /api/auth/admin/create-customer`
- `GET|POST|PATCH /api/admin/customers`
- `POST /api/billing/recharge`
- `GET|PUT|POST|DELETE /api/pricing/*`
- `GET|POST|PUT /api/llm-models`
- `GET|PUT|DELETE /api/provider-keys/*`

### 4.4 关键技术栈

| 层面 | 技术选型 |
|------|----------|
| 运行时 | Node.js + TypeScript（ESM 模块） |
| 开发工具 | `tsx`（直接执行 TS）、`typescript ~5.8.2` |
| Web 框架 | Express 4.x |
| 数据库 | PostgreSQL（`pg` 驱动，连接池管理） |
| 前端集成 | Vite（开发模式 SSR 中间件；生产模式托管 `dist`） |
| 共享包 | `@pararouter/shared` |
| 认证 | Bearer Token + `auth_sessions` 表 |
| 通信机制 | `pg_notify('config_changed', ...)` |
| 密码安全 | `scryptSync` + 随机 Salt + `timingSafeEqual` |
| 邮件服务 | Resend API |

---

## 5. Web (`web/`) — React 前端控制台

### 5.1 目录结构

```
web/src/
├── main.tsx             # 入口：异步初始化 i18n，挂载 BrowserRouter
├── App.tsx              # 根组件：路由定义、全局壳层、权限守卫
├── i18n.ts              # i18n 初始化与异步语言包加载（en/zh/ja/ko）
├── index.css            # Tailwind v4 全局样式 + 品牌色/字体/滚动条
├── vite-env.d.ts        # Vite 环境类型声明
├── components/
│   ├── Navbar.tsx       # 顶部导航：路由链接、用户下拉、语言切换、admin 入口
│   ├── Sidebar.tsx      # 侧边栏（早期设计，当前主用 Navbar）
│   ├── LocaleSwitcher.tsx
│   └── Select.tsx       # 通用选择组件
├── lib/
│   ├── api.ts           # HTTP 客户端：fetch 封装 + Bearer Token + ApiError
│   ├── session.ts       # localStorage 存 token/user，支持 admin/user 角色
│   ├── utils.ts         # cn() = clsx + tailwind-merge
│   ├── appShellLayout.ts
│   ├── modelSort.ts
│   └── modelCardShell.ts
├── locales/
│   ├── en.json, zh.json, ja.json, ko.json
└── views/
    ├── Landing.tsx                   # 未登录首页：Hero、统计条、懒加载模型目录
    ├── Login.tsx                     # 登录/注册（含邮箱验证码流程）
    ├── Models.tsx                    # 模型广场：已路由模型 + 全局目录双列表
    ├── Chat.tsx                      # 聊天界面：侧边会话栏、SSE 流式、模型选择器
    ├── Insights.tsx                  # Insights 容器：Tab 切换 Rankings / Activity
    ├── Rankings.tsx                  # 模型排行榜
    ├── Activity.tsx                  # 用量/活动：Recharts 面积图 + 最近请求表格
    ├── Pricing.tsx                   # 定价中心：draft/published 合并列表
    ├── Providers.tsx                 # 服务商管理（admin）
    ├── ModelProviders.tsx            # 单模型多服务商路由配置
    ├── GlobalModels.tsx              # 全局模型库维护（admin）
    ├── Keys.tsx                      # 用户 API Key 管理
    ├── Settings.tsx                  # 账户/安全/设置
    ├── Docs.tsx                      # OpenAI 兼容接口文档
    ├── Customers.tsx                 # 客户管理（admin）
    ├── HubConsole.tsx                # Hub 控制台：Gateway 实例监控（admin）
    ├── landing/
    │   └── LandingCatalogSection.tsx
    └── pricing/
        ├── types.ts
        ├── pricingEditUiStore.ts     # 模块级 store（useSyncExternalStore）
        ├── PricingHeader.tsx
        ├── PricingTable.tsx
        ├── EditPriceModal.tsx
        └── ProviderAccountModal.tsx
```

### 5.2 页面路由概览

| 路由 | 视图 | 说明 | 权限 |
|------|------|------|------|
| `/` | `Landing` | 未登录营销首页；已登录跳转 `/models` | 公开 |
| `/login` | `Login` | 登录/注册（含验证码） | 公开 |
| `/models` | `Models` | 模型广场 | 需登录 |
| `/models/:modelId/providers` | `ModelProviders` | 单模型多服务商路由与定价 | 需登录 |
| `/insights` | `Insights` | Tab 容器：默认 `Rankings` | 需登录 |
| `/insights?tab=activity` | `Activity` | 用量统计 + 趋势图 + 日志 | 需登录 |
| `/pricing` | `Pricing` | 定价中心（draft / published） | 需登录（admin 可见） |
| `/providers` | `Providers` | 服务商账号与 API Key 管理 | admin |
| `/global-models` | `GlobalModels` | 全局 LLM 元数据/定价维护 | admin |
| `/customers` | `Customers` | 客户/子账号管理 | admin |
| `/chat` | `Chat` | 多会话聊天、SSE 流式输出 | 需登录 |
| `/docs` | `Docs` | OpenAI 兼容 API 文档 | 需登录 |
| `/keys` | `Keys` | 个人 API Key 管理 | 需登录 |
| `/settings` | `Settings` | 账户/安全/设置 | 需登录 |

### 5.3 关键技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + React DOM 19 |
| 构建工具 | Vite 6 + `@vitejs/plugin-react` |
| 语言 | TypeScript ~5.8 |
| 样式 | Tailwind CSS v4 (`@tailwindcss/vite`) |
| 路由 | `react-router-dom` v7 |
| 国际化 | `i18next` + `react-i18next` + 浏览器语言检测 |
| UI 组件 | `@headlessui/react`, `lucide-react` |
| 动画 | `motion` (原 Framer Motion) |
| 图表 | `recharts` |
| 状态管理 | 以 React Hooks 为主；Pricing 弹窗使用自定义模块级 store |
| API 通信 | 原生 `fetch`，SSE 流式解析在 `Chat.tsx` 中手写 `getReader()` |

---

## 6. Packages (`packages/shared/`) — 共享库

```
packages/shared/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts         # 导出核心 TypeScript 类型
└── schema.sql           # 完整 PostgreSQL 初始化与迁移脚本
```

### 6.1 导出类型

- `ModelPayload` — 模型元数据（id/name/provider/pricing/tags/status 等）
- `PricingDraftUpsertRequest` — 定价草稿增删改请求体
- `AuthUser` — 用户对象（id/username/email/role/balance）
- `AuthSessionResponse` — 登录/会话响应（token + 用户信息）

### 6.2 数据库 Schema (`schema.sql`)

涵盖以下表结构与迁移：
- 模型表：`models`, `llm_models`
- 供应商表：`provider_types`, `provider_accounts`, `provider_api_keys`
- 用户与认证：`users`, `auth_sessions`, `email_verifications`
- 定价体系：`model_provider_pricings`, `model_provider_pricings_draft`, `pricing_releases`, `pricing_state`
- 用量与计费：`activity`, `billing_records`
- 网关注册：`gateways`

---

## 7. Scripts (`scripts/`) — 本地运维与测试

| 脚本 | 用途 |
|------|------|
| `start_local.sh` | 一键启动本地开发环境 |
| `stop_local.sh` | 停止本地开发环境 |
| `test_billing_end_to_end.ts` | 计费端到端测试 |
| `test_openai_api.sh` | OpenAI 协议兼容性测试 |
| `test_anthropic_prompt.sh` | Anthropic 协议兼容性测试 |
| `test_pararouter.sh` | 整体功能测试 |

---

## 8. Deploy (`deploy/`) — 生产部署

| 文件 | 用途 |
|------|------|
| `pararouter-gateway.service` | Gateway systemd 服务单元 |
| `pararouter-hub.service` | Hub systemd 服务单元 |
| `nginx/` | Nginx 反向代理/静态资源/SSL 配置 |
| `remote_setup_and_build.sh` | 远程服务器一键拉取、构建、启动脚本 |

---

## 9. 架构数据流

```
                        ┌─────────────────┐
                        │   User / API    │
                        │    Client       │
                        └────────┬────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │                    │                    │
            ▼                    ▼                    ▼
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │   Web Console   │  │   Hub API       │  │   Gateway API   │
   │  (React/Vite)   │  │  (/api/*)       │  │   (/v1/*)       │
   └────────┬────────┘  └─────────────────┘  └────────┬────────┘
            │                                          │
            │                    ┌─────────────────────┘
            │                    │
            ▼                    ▼
   ┌─────────────────┐  ┌─────────────────┐
   │   Hub Backend   │  │   Gateway       │
   │  (Express/TS)   │  │   (Rust/Axum)   │
   │     :3322       │  │     :8000       │
   └────────┬────────┘  └────────┬────────┘
            │                    │
            │         ┌──────────┘
            │         │
            ▼         ▼
   ┌─────────────────────────────┐
   │      PostgreSQL             │
   │  (Schema + Config + Users   │
   │   + Billing + Activity)     │
   └─────────────────────────────┘
            │
            │  pg_notify('config_changed')
            └────────────────────────────► Gateway 热更新
```

### 请求处理流程（Gateway）

1. **协议翻译**：`translators::openai.rs` / `anthropic.rs` 将外部请求转换为内部 `ProxyChatRequest`
2. **认证授权**：`auth::keys.rs` 校验 API Key、ACL、余额
3. **路由解析**：`routing::resolve.rs` 按定价版本 + 模型名选出最优 Provider
4. **执行下发**：`unigateway_sdk::host::dispatch_request` 转发到上游 endpoint
5. **计费回调**：`usage::hooks.rs` 在请求完成后扣费、记录用量

### 控制平面与数据平面交互

- **Hub → Database**：所有配置变更（Provider、定价、用户）写入 PostgreSQL。
- **Hub → Gateway**：通过 `pg_notify` 发送配置变更通知。
- **Gateway → Database**：每 60 秒轮询同步 Provider/定价配置；实时读取用户/API Key 信息。
- **Gateway → Hub**：Gateway 实例主动注册；请求完成后上报用量/活动日志。

---

## 10. 技术栈汇总

| 层级 | 技术选型 |
|------|----------|
| 数据平面 | Rust, Axum, Tokio, UniGateway SDK, SQLx, Reqwest |
| 控制平面 | Node.js, TypeScript, Express, PostgreSQL (`pg`) |
| 前端 | React 19, Vite 6, Tailwind CSS v4, React Router v7 |
| 共享库 | TypeScript ESM 包（类型 + SQL Schema） |
| 数据库 | PostgreSQL（Hub 与 Gateway 共享） |
| 部署 | systemd, Nginx, Shell 脚本 |
| 监控/日志 | tracing (Rust), 控制台日志 (Node.js) |
