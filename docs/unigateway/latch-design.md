# UniGateway 与 Latch 集成设计建议

Status: Draft

Date: 2026-05-01

Authors: ParaRouter synthesis note

## 1. Summary

本文档用于给 UniGateway 提出一份边界清晰的设计建议：

- `latch-score` 等 Latch 能力不应整体内置到 UniGateway Core。
- UniGateway 应当下沉并标准化与这些能力配套的通用观测原语、生命周期 hook 和可注入策略接口。
- 宿主网关（如 ugate、ParaRouter）负责将 UniGateway 的原始观测事件转译为 Latch 的输入，并决定是否把 Latch 的输出反馈给路由层。

换言之：

- UniGateway 负责“原始事件与扩展点”。
- Latch 负责“纯计算原语与中立策略”。
- 宿主系统负责“胶水、存储、业务规则和产品化集成”。

## 2. Problem Statement

围绕动态质量路由、流式观测和评分反馈，有一个容易混淆的问题：

> UniGateway 是否应该直接实现评分逻辑，还是只提供评分所需的基础能力？

该问题的核心不在于“评分是否重要”，而在于：

- 哪些是通用网关内核应承担的职责。
- 哪些是策略层应承担的职责。
- 哪些是宿主产品层应承担的职责。

如果边界不清楚，容易出现两种坏结果：

1. UniGateway 变成一个带强产品倾向的 opinionated framework。
2. 上层网关必须反复重写 stream wrapper、观测转译和反馈桥接，无法复用。

## 3. Core Distinction: Observation Primitives vs Policy

这份建议的关键前提是区分两类东西。

### 3.1 观测原语

观测原语是原始事件，不带策略解释。

示例：

- request 开始
- attempt 开始 / 结束
- first chunk arrived
- chunk emitted
- stream completed
- stream aborted
- correlation id
- endpoint_id / pool_id / provider metadata
- 标准错误分类入口

这些能力是中立的、可复用的，适合下沉到 UniGateway。

### 3.2 评分与路由策略

策略是对原始事件的解释与决策，不是原始事件本身。

示例：

- TTFT 500ms 算快还是慢
- TPS 如何映射成质量分
- stream broken 应扣多少分
- availability / latency / quality / cost 权重如何分配
- recent_failures 如何归一化
- PoolFeedback 应如何影响最终路由

这些能力带有明显策略属性，不应直接写进 UniGateway Core。

## 4. Design Conclusion

结论如下：

- `latch-score` 的具体评分逻辑不应放进 UniGateway。
- Latch 不应变成 UniGateway 的内建子模块。
- 但 UniGateway 应主动提供一等集成点，使上层系统可以自然接入 Latch。

更精确地说：

- UniGateway 应下沉“观测原语”和“注入接口”。
- Latch 应保持“纯同步、零 I/O、运行时无关”的中立原语库定位。
- ugate / ParaRouter 这类宿主应负责观测转译、持久化、后台展示和业务决策整合。

## 5. Responsibility Split

### 5.1 UniGateway 应负责

- 标准 request / attempt / stream lifecycle hooks
- correlation id 的生成与透传
- endpoint_id / pool_id / provider metadata 透传
- 标准化执行报告与错误分类
- 可注入的路由反馈接口
- 可选策略插槽，但不绑定某个具体评分实现

### 5.2 Latch 应负责

- 纯同步的评分、路由、重试、计量等原语
- 统一的中立数据结构
- 对观测数据进行计算并输出反馈
- 不依赖任何具体 gateway 或 runtime

### 5.3 宿主网关应负责

- 认证、配额、预算、价格和租户策略
- 后台 API 与管理界面
- 数据库存储与异步缓冲层
- 将 UniGateway 事件转译为 Latch 输入
- 将 Latch 输出与产品业务规则合并

## 6. What UniGateway Should Integrate

这里的“集成”不等于“内置评分逻辑”，而是“为 Latch 提供原生兼容面”。

### 6.1 标准 Hooks

UniGateway 应优先补齐以下 hook：

- `on_request_started`
- `on_attempt_started`
- `on_attempt_finished`
- `on_request_finished`
- `on_stream_started` 或 `on_first_chunk`
- `on_stream_chunk`
- `on_stream_completed`
- `on_stream_aborted`

其中 stream 相关 hook 的意义是暴露原始事件，而不是在 UniGateway 内部计算 TTFT/TPS 分数。

### 6.2 标准 Report Types

建议 UniGateway 定义并稳定暴露以下报告类型：

- `RequestReport`
- `AttemptReport`
- `StreamReport`

这些报告应尽量包含：

- `request_correlation_id`
- `endpoint_id`
- `pool_id`
- `provider metadata`
- `latency`
- `usage`
- `success / failure`
- `error kind`
- `stream lifecycle outcome`

上层系统和 Latch 适配层都可以直接消费这些标准类型。

### 6.3 Correlation ID

UniGateway 应把 correlation id 视为核心执行元数据，而不是宿主临时补丁。

建议：

- 每个 request 在进入执行路径时生成 `request_correlation_id`
- attempt、stream、request report 都带上它
- hook 回调中统一可见

这样上层宿主可以把 request、stream、activity、billing 等记录自然关联起来。

### 6.4 标准错误分类入口

UniGateway 不需要替上层定义完整的评分语义，但应为错误分类提供稳定入口。

建议最少支持：

- timeout
- rate_limited
- upstream_5xx
- upstream_4xx
- connection_failure
- invalid_response
- cancelled_by_client

这样宿主和 `latch-score` 可以在边界处直接做可靠映射，而不是靠字符串猜测。

### 6.5 中立的反馈注入接口

如果 UniGateway 将来需要在分发决策时消费动态质量信号，应提供一个中立接口。

不建议命名为 `ScoreProvider`，因为这个名字隐含“反馈一定是分数”。

更推荐：

- `RoutingFeedbackProvider`
- `DispatchFeedbackProvider`
- `EndpointSignalProvider`

建议的接口形态如下：

```rust
pub trait RoutingFeedbackProvider: Send + Sync {
    fn feedback(&self, pool_id: &str) -> RoutingFeedback;
}

pub struct RoutingFeedback {
    pub endpoint_signals: std::collections::HashMap<String, EndpointSignal>,
}

pub struct EndpointSignal {
    pub score: Option<f64>,
    pub excluded: bool,
    pub cooldown_until: Option<std::time::SystemTime>,
    pub recent_error_rate: Option<f64>,
}
```

这个接口允许 UniGateway 未来消费动态信号，但不要求信号一定来自 `latch-score`。

## 7. What Should Stay Out of UniGateway

以下内容不应直接进入 UniGateway Core：

- `latch-score` 的打分公式
- availability / latency / quality / cost 的权重定义
- TTFT / TPS 阈值
- recent_failures 的归一化策略
- PoolFeedback 到最终路由的产品策略映射
- 管理后台 API
- 数据库存储
- 用户、租户、预算、价格等业务规则

这些都应保留在宿主层，或保留在 Latch 的纯计算 crate 内。

## 8. What Latch Should Provide

为了让 UniGateway 更好兼容 Latch，Latch 自身也应保持明确边界。

### 8.1 Latch 的定位

Latch 应继续保持如下特性：

- 纯同步
- 零 I/O
- 运行时无关
- 不依赖具体 gateway
- 类型和算法可被任意宿主复用

### 8.2 Latch 的能力层次

对 UniGateway 最有兼容价值的 Latch 能力包括：

- `latch-score`: 观测到质量分的纯计算
- `latch-router`: 中立的路由启发式
- `latch-retry`: 中立的重试 / fallback 原语
- `latch-meter`: 中立的会话级计量原语

但这些能力更适合作为：

- 宿主显式依赖的 crate
- 或 UniGateway 的 optional integration

而不是 UniGateway Core 的内建行为。

### 8.3 与 UniGateway 的连接方式

Latch 不应直接依赖 UniGateway。

更推荐的方式是：

- UniGateway 暴露标准事件与接口
- 宿主系统做一个 adapter / bridge
- adapter 把 UniGateway 事件转成 Latch 输入

这能保持双方中立，也更易测试。

## 9. What ugate / ParaRouter Should Own

ugate 和 ParaRouter 这样的宿主仍然必须承担以下职责：

- 认证与权限校验
- 预算与计费
- activity / stream / audit 落库
- 后台查询与展示
- 将 hook 数据转成 `RequestObservation`
- 调用 `latch-score` 得到 `EndpointScore` / `PoolFeedback`
- 决定是否把反馈再次注入 UniGateway 的路由层

这部分不应下沉到 UniGateway。

## 10. Recommended Integration Path

建议按以下阶段推进，而不是一步把评分逻辑塞进 UniGateway。

### Phase 1: 补齐观测原语

UniGateway 新增并稳定以下能力：

- request / attempt / stream hooks
- correlation id
- 标准 stream lifecycle 事件
- 更完整的 RequestReport / AttemptReport

这一步完成后，上层网关不再需要各自实现脆弱的 stream wrapper。

### Phase 2: 宿主对接 Latch

ugate / ParaRouter 在宿主层：

- 订阅 UniGateway hooks
- 将原始观测转译为 `RequestObservation`
- 调用 `latch-score`
- 落库存档并做后台展示

这一步不要求 UniGateway 改动其内部分发逻辑。

### Phase 3: UniGateway 可选消费反馈

如果确有需要，再在 UniGateway 引入中立的 `RoutingFeedbackProvider` 接口。

此时：

- UniGateway 只消费反馈
- ugate / ParaRouter 用 `latch-score` 实现反馈提供者
- 评分逻辑仍然不进入 UniGateway Core

## 11. Proposed Normative Guidance

建议对 UniGateway 设计采用如下约束：

- UniGateway MUST 提供标准 request / attempt / stream lifecycle hooks。
- UniGateway MUST 提供稳定的 correlation id 透传。
- UniGateway MUST 暴露 endpoint / pool 级执行元数据。
- UniGateway SHOULD 提供中立的反馈注入接口，而不是绑定具体评分实现。
- UniGateway MUST NOT 内置 `latch-score` 的具体评分公式和业务策略。
- UniGateway MUST NOT 负责业务后台、数据库持久化、预算和计费逻辑。

## 12. Final Recommendation

这份建议的最终结论可以总结为一句话：

> UniGateway 不应内置 Latch 的评分策略，但应原生支持 Latch 所需的观测原语与反馈注入接口。

更直白地说：

- 评分逻辑不进 UniGateway。
- 观测事件和生命周期 hook 要进 UniGateway。
- Latch 保持独立、纯计算、中立。
- ugate / ParaRouter 负责把两者粘起来，并承担产品化职责。

这是当前最清晰、最稳健、也最利于长期复用的边界划分。