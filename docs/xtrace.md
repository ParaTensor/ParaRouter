**ParaRouter + xtrace 可观测性集成文档 v1.0**

**目标**：在 ParaRouter 单体 Rust 后端（Axum）中集成 xtrace，实现 LLM 全链路 trace、observation、metrics 和 Dashboard。

### 1. 前置条件
- ParaRouter 已完成高内聚单体重构（Rust + Axum）。
- xtrace 服务已独立部署（https://github.com/lipish/xtrace）。
- 环境变量准备：
  - `XTRACE_BASE_URL=http://xtrace:8742`
  - `XTRACE_API_TOKEN=your-secret-token`（xtrace 生成的 Bearer token）

### 2. Backend 集成（Rust）

**步骤 2.1：添加依赖**（Cargo.toml）
```toml
[dependencies]
xtrace-client = { version = "0.0.15", features = ["tracing"] }
```

**步骤 2.2：初始化 xtrace Client + Layer**（src/main.rs 或 config/mod.rs）
```rust
use xtrace_client::{Client, XtraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

pub async fn init_tracing() -> anyhow::Result<()> {
    let client = Client::new(
        &std::env::var("XTRACE_BASE_URL").unwrap(),
        &std::env::var("XTRACE_API_TOKEN").unwrap(),
    )?;

    tracing_subscriber::registry()
        .with(XtraceLayer::new(client))
        .with(tracing_subscriber::fmt::layer()) // 保留控制台日志
        .init();

    Ok(())
}
```

在 `main.rs` `#[tokio::main]` 最开始调用：
```rust
init_tracing().await?;
```

**步骤 2.3：LLM 核心路径打点**（router/llm.rs 或 adapter 驱动内）

自动 span（推荐）：
```rust
let _span = tracing::info_span!(
    "llm_completion",
    model = %model_name,
    provider = %provider_id,
    request_id = %request_id,
    session_id = %session_id.unwrap_or_default(),
    turn_id = %turn_id.unwrap_or_default()
).entered();
```

自动 metrics（任何 event 带 `metric=` 和 `value=` 即自动上报）：
```rust
tracing::info!(
    metric = "llm_tokens_input",
    value = input_tokens,
    model = %model_name,
    provider = %provider_id
);

tracing::info!(
    metric = "llm_tokens_output",
    value = output_tokens,
    model = %model_name,
    provider = %provider_id
);

tracing::info!(
    metric = "llm_cost_usd",
    value = cost_usd,
    model = %model_name,
    provider = %provider_id
);

tracing::info!(
    metric = "llm_latency_ms",
    value = latency_ms,
    model = %model_name
);
```

**计费后结算点**（engine/billing.rs）：
```rust
tracing::info!(
    metric = "user_quota_deducted",
    value = deducted_quota,
    user_id = %user_id,
    model = %model_name
);
```

### 3. Docker Compose 联合部署（docker-compose.yml）
```yaml
services:
  pararouter:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - XTRACE_BASE_URL=http://xtrace:8742
      - XTRACE_API_TOKEN=${XTRACE_API_TOKEN}
      - DATABASE_URL=...
    depends_on:
      - xtrace

  xtrace:
    build: https://github.com/lipish/xtrace.git#main
    ports:
      - "8742:8742"
    environment:
      - DATABASE_URL=postgres://postgres:postgres@postgres:5432/xtrace
    depends_on:
      - postgres

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: pararouter,xtrace
```

### 4. 前端 Dashboard 嵌入（ParaRouter frontend）

**步骤 4.1：在 frontend/.env 添加**
```
VITE_XTRACE_BASE_URL=http://localhost:8742
VITE_XTRACE_API_TOKEN=your-token
```

**步骤 4.2：新增 Observability Tab**（src/views/Observability.tsx）
```tsx
import { useEffect, useState } from 'react';

export default function ObservabilityView() {
  const [tracesUrl] = useState(`${import.meta.env.VITE_XTRACE_BASE_URL}/api/public/traces`);
  // 可直接 iframe 或用 fetch 调用 xtrace API
  return (
    <iframe
      src={`${import.meta.env.VITE_XTRACE_BASE_URL}/dashboard?token=${import.meta.env.VITE_XTRACE_API_TOKEN}`}
      className="w-full h-[calc(100vh-12rem)] border-0 rounded-2xl"
      title="xtrace Dashboard"
    />
  );
}
```

在 App.tsx 添加 tab：
```tsx
case 'observability':
  return <ObservabilityView />;
```

### 5. 测试验证
1. 重启 ParaRouter。
2. 通过 ChatView 发送一次请求。
3. 打开 xtrace Dashboard（http://localhost:8742）：
   - 看到带 session_id 的 trace 树。
   - 看到 llm_tokens_*、llm_cost_usd、llm_latency_ms 等 metrics。
4. 查询 metrics：
   ```rust
   // 可在 ParaRouter 内部加一个 /api/metrics/test endpoint 调用 client.query_metrics
   ```

### 6. 配置参考表
| 环境变量              | 说明                          | 示例值                     |
|-----------------------|-------------------------------|----------------------------|
| XTRACE_BASE_URL      | xtrace 服务地址               | http://xtrace:8742        |
| XTRACE_API_TOKEN     | Bearer Token                  | xtrace-generated-token    |
| VITE_XTRACE_*        | 前端 iframe 使用              | 同上                      |

集成完成。所有 LLM 请求自动获得生产级 trace + metrics，无需额外 Collector。
