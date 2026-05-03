# ParaRouter Gateway 1.0.0 Refactoring Summary
**Date:** 2026-04-07
**Status:** Completed

This document outlines the architectural shift and implementation steps undertaken to safely transition the ParaRouter Gateway onto the new lightweight `unigateway-core` engine.

## 核心重构理念 (Core Refactoring Philosophy)

本次重构的最核心动力，是将高并发网关从**“沉重的数据库绑定” (Heavy monolith)** 的旧版模型中剥离出来，进化为完全利用常驻内存进行极速调度代理的 **“Micro-Kernel Shell”** 模型。

底层繁重且易错的串流与并发失败重试等内核机制交由不包含任何存储业务逻辑的 `unigateway-core` 库承担，而 ParaRouter Gateway 作为包壳层 (Shell) 将专注负责它特有的商业语义（API鉴权、用户定价模型分流、统计上报记账）。

## 实施成果与闭环阶段 (Implementation Phases)

### Phase 1: 建立坚固的请求防护林 (Closure A & B)
在此阶段，我们通过引入明确的模块职责体系，为网关重塑了骨架：
- **`Translators Layer` (协议防腐层)**: 实现了高度宽容的 `PermissiveChatRequest`，让进入网关的奇异 Payload 也能被安全承接和重构，不仅防止了生吞 JSON 导致的核心层崩溃，也将杂乱的外部流量提纯为了纯净的 `ProxyChatRequest`。
- **`Auth & Routing Middleware`**: 脱离了原点强编排的假服务名绑定机制。现在 Gateway 实打实地挂载了 `AuthenticatedUser` Extractor 钩子校验 `user_api_keys`，并基于入参拦截到 `model_provider_pricings` 表做查询，最终实现动态映射对应的 `provider_account`（即核心池路由靶点）。这标志着网关多租户形态和模型路由形态双双复活。

### Phase 2: 驱逐热点路径中的数据库 (Closure C)
这是性能产生质变的核心改造点：
- 终结了原先每发起一次对话前都要通过 SQL 扫库来寻找活跃节点池的心智包袱。修改了 `RuntimePoolHost` 的透传策略，使其对 `unigateway` 底层的 fallback 热查请求全部强行阻拦 (`Ok(None)`)。
- **`Snapshot Sync Engine`**: 开发了全局异步的心跳快照同步大循环 (`src/sync/pools.rs` & `bootstrap.rs`)。从网关启动起，该系统将在后台长驱执行——提取目前处于 online 在线状态的主池 (`provider_accounts`) 和其绑定令牌（`provider_api_keys`）结构化塞入 `engine.upsert_pool()` 常驻内存引擎。周期定格每 60 秒对齐状态并清除离线配置，对前端网关流量产生了极美的吞吐量增益保护效应。

### Phase 3: 找回产品级连贯性 (Closure D & E)
针对企业级商用必须提供的计费监控与通用适配协议支持，我们将其无缝连结入系统生命脉络：
- **`/v1/models` 端点复建**: 将旧代码抛弃不用，重新依赖了最新版 `model_provider_pricings` 中 status 为 online 的模型作为映射底座下发，从而保证了业务前后端在显示和网关实际代理可达性上的强制一致。
- **`GatewayHooks` 离线账本**: 通过引入 `unigateway_core::GatewayHooks` 的拦截能力（在执行器执行完成但尚未关闭管道的后置环节），提取 `latency`, `TokenUsage` 等结果态，以及由阶段 1 层层渗透送下层的 `metadata (user_id)`，异步低延迟地写入了 Postgres 的 `activity` 流水表内，计费链路畅通无阻，实现收尾。

## 目录与架构指引 (Modules Architecture)
经历此役，当前网关呈现极具生命力的规整目录形式：

- `src/api/` -> Axum 入口路由和统一请求处理封装 (`openai`, `models`)
- `src/auth/` -> 拦截解析原始请求并做租户合法性剥离
- `src/routing/` -> 定义抽象的网关名到内部多池资源结构的解析关系
- `src/translators/` -> 抵御多变格式客户端的类型兼容中间层
- `src/sync/` -> 处理 Gateway 内存池和 Postgres 实际源数据的状态同步快照
- `src/usage/` -> 与核心引擎生命周期绑定的计费报表与事件跟踪
- `src/runtime.rs` -> 对外部核心引擎的宿主特征描述与对接总集成

--- 
**结论：**
迁移极为成功，我们获取了一个具备生产级隔离能力的极速现代 LLM 路由网关。
