# ParaRouter: 动态流量路由策略 (Dynamic Routing Strategy)

本文档面向系统管理员（Admin），阐述 ParaRouter 网关层在处理 C 端 API 请求时，如何动态地将单一「模型请求」分发调度到后方多个不透明「供应商渠道」的设计与管理策略。

初期的路由控制将以**静态权重优选**为主，未来可横向扩展出基于成本或时延的智能动态选路机制。

## 1. 核心架构解耦
ParaRouter 最大的特性在于 **面向 C 端只保留 Model ID，面向 Admin 隐蔽所有 Provider**。
当客户发起一个针对 `gpt-4o` 的调用时：
- 客户认为自己正在直接访问 OpenAI 官方。
- 网关拦截后，查询 `model_provider_pricings` 表，发现有 3 个供应商（渠道商 A、Azure 订阅 B、官方原始端 C）都能提供 `gpt-4o`。
- 网关根据**路由选取策略 (Routing Strategy)** 决定挑选哪一条链路承载该次请求。

---

## 2. 第一阶段方案：优先级单主备路由 (Top Provider Fallback)

在当前初期版本中（网关层 `resolve_model_target` 实现），系统采用的是最轻量但极其可靠的 **“标记优先型寻址” (Top Provider Priority)**：

在管理员端（Hub），您会看到该模型下挂载的所有供应商列表。

### 管理参数：`is_top_provider` (主通道标记) 与 `status` (上下线)
- 网关层收到请求后，仅过滤出 `status = 'online'` 的活跃供应商。
- 随后，网关强校验 `is_top_provider = true` 的供应商作为**首发流量出口**。
- 一旦主供应商掉线（比如欠费被您手动把 `status` 标为 `offline`），网关 SQL 的请求游标会自动顺延至下一个拥有该模型且状态良好的备用通道。

**Admin 日常维护方法：**
1. 找出进货价最低、“量大管饱”的那个中转供应商，勾选它的 `is_top_provider`。
2. 储备 1 到 2 个贵一点但极端稳定的备用通道放着，确保 `status = 'online'`。
3. 当且仅当主通道爆了，流量会自动流转。

> [!NOTE]
> *(当前代码表现为：`ORDER BY is_top_provider DESC LIMIT 1`，它优先提取打勾的主权重节点)*。

---

## 3. 第二阶段预期方案：智能复合路由池 (Compound Target Pool)

未来我们会随着 Unigateway 核心的迭代，引入更强悍的调度算法：

### A. 成本最低选路法 (Cost-Optimized Routing)
Admin 不再需要手动指定谁是主、谁是备。系统会自动对比当时后台所有在线供应商的 `input_cost` 和 `output_cost`。谁当下拿的进货价便宜，网络并发就往谁头上打。

### B. 按权平滑轮询分配 (Weighted Round Robin)
为了防止单一低价渠道被平台客户的高并发瞬间打死产生被封号风险。Admin 可以给不同渠道设定百分比权重（例如：渠道 A 承载 80%，官方保底渠道承载 20%）。

### C. 故障时延转移 (Latency-Aware Failover)
网关根据最近 1 分钟内的接口超时响应率或 HTTP 500 退回率，自动在毫秒级将出错信道隔离降级，流量瞬间被丢进另一个可用渠道。

> **当前阶段的实践准则：** 只要各位 Admin 保证一个热门模型至少挂载 2 个以上的在线渠道，并标注好最高优先级的（即最帮您省钱的）主渠道，这套早期的单发寻址逻辑就足以稳定承载数十万级的并发而不会造成通道瘫痪。
