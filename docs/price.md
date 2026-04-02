# OpenHub 定价中心开发规划（由浅入深）

## 1. 目标
- 建立唯一“对客售价”入口：`/admin/pricing`。
- 将 Provider 连接管理与定价彻底解耦，避免重复维护和口径不一致。
- 支持草稿、发布、回滚，保证线上计费稳定可审计。

## 2. 边界与原则
- Provider 页面：只管理连接能力与上游成本参数（可选），不编辑对客售价。
- 定价中心：唯一可写对客售价入口。
- 结算优先级固定：`provider_account + model 覆写 > global model 价格 > reject`。
- 禁止“固定价 + markup_rate”同时生效，防止重复加价。
- 使用显式 `price_mode` 并配合数据库 `CHECK` 约束，避免“魔法值”导致误计费。

## 3. 交互分层（由浅入深）
### L1 快速定价（默认）
- 按模型维护全局 `input/output` 单价。
- 3 步完成：筛选模型 -> 改价 -> 发布。

### L2 批量规则
- 按模型前缀、Provider 分组批量调价（如“OpenAI 全系 +15%”）。
- 展示本次影响模型数与变更摘要。

### L3 高级模式
- 单模型+单 Provider Account 覆写价。
- 发布前利润预估、命中路径预览、灰度发布（后续）。

## 4. 数据模型（MVP）
```sql
-- 正式表（只读给运行时）
CREATE TABLE model_pricings (
  id BIGSERIAL PRIMARY KEY,
  model TEXT NOT NULL,
  provider_account_id TEXT NOT NULL DEFAULT '', -- ''=全局，非空=绑定 Provider Account
  price_mode TEXT NOT NULL,                    -- fixed | markup
  input_price DECIMAL(12,6),
  output_price DECIMAL(12,6),
  cache_read_price DECIMAL(12,6),
  cache_write_price DECIMAL(12,6),
  markup_rate DECIMAL(8,4),
  currency TEXT NOT NULL DEFAULT 'USD',
  version TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(model, provider_account_id, version)
);

-- 草稿表（编辑区）
CREATE TABLE model_pricings_draft (
  id BIGSERIAL PRIMARY KEY,
  model TEXT NOT NULL,
  provider_account_id TEXT NOT NULL DEFAULT '',
  price_mode TEXT NOT NULL,
  input_price DECIMAL(12,6),
  output_price DECIMAL(12,6),
  cache_read_price DECIMAL(12,6),
  cache_write_price DECIMAL(12,6),
  markup_rate DECIMAL(8,4),
  currency TEXT NOT NULL DEFAULT 'USD',
  updated_at BIGINT NOT NULL,
  UNIQUE(model, provider_account_id)
);

-- 发布记录
CREATE TABLE pricing_releases (
  version TEXT PRIMARY KEY,
  status TEXT NOT NULL,                        -- published | rolled_back
  summary JSONB NOT NULL,
  operator TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  config_version BIGINT NOT NULL
);

-- 当前生效价格版本（单体热更新锚点）
CREATE TABLE pricing_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  current_version TEXT NOT NULL DEFAULT 'bootstrap',
  config_version BIGINT NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);
```

## 5. API 规划（MVP）
- `GET /api/pricing`：读取当前正式价格。
- `GET /api/pricing/draft`：读取草稿价格。
- `PUT /api/pricing/draft`：新增/更新草稿项。
- `POST /api/pricing/preview`：返回影响范围、变更摘要、预计毛利变化。
- `POST /api/pricing/publish`：原子发布草稿到正式表，生成 `version`。
- `POST /api/pricing/rollback/:version`：回滚到指定版本。
- `GET /api/pricing/state`：读取当前 `version/config_version`。

## 6. 开发分期
### Phase A（先落地）
- 数据表与后端 CRUD + preview/publish/rollback。
- 定价中心 L1 页面（全局价编辑 + 发布）。
- Gateway 读取正式价并按优先级结算。
- 发布/回滚自动写入审计事件（含 version、affected、margin_delta）。

### Phase B
- 批量规则引擎（前缀/Provider 条件）。
- 变更影响分析增强（毛利、命中分布）。

### Phase C
- 灰度发布、审批流、xtrace 发布事件联动。

## 7. 验收标准
- 任一模型可在 1 分钟内完成“改价->预览->发布”。
- 价格缺失请求严格 reject，返回标准错误：`pricing_not_found`。
- 任一发布版本可一键回滚，回滚后新请求立即生效。
