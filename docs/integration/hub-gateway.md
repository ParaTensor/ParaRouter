# Hub 与 Gateway 集成机制说明

## 1. 角色与边界

- **Hub（控制面）**：负责配置管理、密钥管理、网关注册状态、用量汇总展示。
- **Gateway（数据面）**：负责实际 LLM 请求转发、模型调用、协议兼容接口（OpenAI/Ollama/Anthropic）。
- **核心原则**：控制与转发分离，业务流量不经过 Hub，Hub 只做控制与观测。

---

## 2. 通信机制总览

当前采用 **Gateway 主动发起的 HTTP + JSON（REST）** 通信：

1. Gateway 启动后向 Hub 注册自身状态。
2. Gateway 从 Hub 拉取配置（providers / keys）。
3. Gateway 在运行中向 Hub 上报 usage/activity。

即：**Pull 配置 + Report 状态**，而不是 Hub 推送配置。

---

## 3. 当前接口契约（已落地）

## 3.1 注册网关

- **Gateway -> Hub**
- `POST /api/gateway/register`

请求体（示例）：

```json
{
  "instance_id": "gw-1775064645-0.0.0.0-3000",
  "status": "online"
}
```

Hub 行为：

- 以 `instance_id` 作为唯一标识写入/更新 `gateways` 表。
- 更新在线状态与 `last_seen`。

---

## 3.2 拉取配置

- **Gateway -> Hub**
- `GET /api/gateway/config`

返回体（示例）：

```json
{
  "providers": [
    {
      "id": "openai",
      "name": "openai",
      "label": "OpenAI",
      "base_url": "https://api.openai.com/v1",
      "driver_type": "openai_compatible",
      "models": "[...]",
      "docs_url": "https://platform.openai.com/docs/models"
    }
  ],
  "keys": [
    {
      "provider": "openai",
      "key": "sk-***",
      "status": "active"
    }
  ]
}
```

Gateway 行为：

- 读取 `providers`，按 `name/base_url` 生成或更新本地 provider_type（已实现 HubSyncer）。
- 后续可扩展：基于 `driver_type` 绑定不同真实 Provider 驱动。

---

## 3.3 上报用量

- **Gateway -> Hub**
- `POST /api/gateway/usage`

用途：

- 上报模型调用统计（tokens、latency、status、cost、user_id 等）。
- Hub 落库到 `activity`，用于控制台监控与账单分析。

---

## 4. 时序（启动到稳定运行）

1. Gateway 启动，读取 `HUB_URL` 与 `DATABASE_URL`。
2. 初始化本地数据库与 provider_types 基础表。
3. 调用 `/api/gateway/register` 完成注册。
4. 调用 `/api/gateway/config` 拉取配置并执行本地同步。
5. 开始对外提供 `/v1/*` 兼容 API。
6. 请求执行后调用 `/api/gateway/usage` 上报统计。

---

## 5. 为什么这个机制合理

1. **解耦**：Hub 与 Gateway 可独立部署、独立扩缩容、独立发布。
2. **容灾**：Hub 短时不可用时，Gateway 仍可基于本地已同步配置继续服务。
3. **性能**：高并发请求不经过 Hub，避免控制面成为数据平面瓶颈。
4. **安全边界清晰**：Hub 只暴露少量控制接口，Gateway 专注执行。

---

## 6. 生产化建议（下一阶段）

## 6.1 配置一致性

- 增加 `config_version` 与 `ETag/If-None-Match`，减少全量拉取。
- 支持增量配置同步与快速回滚。

## 6.2 可用性

- Gateway 维护“最后一次成功配置”本地快照。
- 配置拉取失败时退避重试（指数退避）。

## 6.3 安全

- Hub 接口增加网关级鉴权（Bearer Token / mTLS）。
- 为 register/config/usage 增加签名或短期令牌，防伪造上报。

## 6.4 观测

- usage 上报增加 `request_id` 幂等键，避免重复记账。
- 增加 trace_id 贯通 Hub 与 Gateway 日志链路。

---

## 7. 部署建议

- 架构上保持 **进程独立**（Hub 与 Gateway 不合并）。
- 体验上可通过 docker-compose/k8s chart 提供“一键部署”。
- 推荐拓扑：`1 Hub + N Gateway`，Gateway 可按地域/租户分组。

