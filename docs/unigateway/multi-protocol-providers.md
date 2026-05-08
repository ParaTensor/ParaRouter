# 多协议上游服务商配置指南

## 问题背景

某些上游服务商（如 BAI、台州/Taotoken）同时支持多种协议：
- **OpenAI 协议** (`/v1/chat/completions`)
- **Anthropic 协议** (`/v1/messages`)

但这些服务商同时提供多种模型：
- **Claude 模型**：需要通过 Anthropic 协议连接，以保留完整的 thinking 内容
- **GPT 模型**：通过 OpenAI 协议连接即可

## 问题

ParaRouter 当前的 `driver_type` 配置在 `provider_type` 层面，粒度太粗。如果一个服务商被配置为 `openai_compatible`，那么它所有的模型都会通过 OpenAI 协议连接，这可能导致 Claude 模型的 thinking 内容丢失。

## 解决方案：多个 Provider Account

为同一个服务商创建多个 Provider Account，每个使用不同的 `driver_type`。

### 优点
- 无需修改数据库 schema
- 无需修改代码
- 完全利用现有架构
- 灵活性高（可为每个 account 配置不同的模型）

### 缺点
- 配置稍微冗余（需要创建多个 account）
- 用户需要理解为什么需要创建多个 account

## 配置步骤

### 步骤 1：创建多个 Provider Account

在 ParaRouter UI（`/providers` 页面）中，为同一个服务商创建多个 account：

**示例：配置 BAI 服务商**

1. **创建 Account 1：BAI (OpenAI Compatible)**
   - 点击"Add Provider"按钮
   - `Display Name`: `BAI (OpenAI)`
   - `Protocol`: `OpenAI`
   - `Base URL`: `https://api.bai.com/v1` (替换为实际 URL)
   - 在"API Channels"部分，点击"Add Key"添加 API Key
   - 点击"Create Provider"保存

2. **创建 Account 2：BAI (Anthropic)**
   - 再次点击"Add Provider"按钮
   - `Display Name`: `BAI (Anthropic)`
   - `Protocol`: `Anthropic`
   - `Base URL`: `https://api.bai.com/v1` (相同 base_url，UniGateway 会根据 driver 选择路径)
   - 在"API Channels"部分，点击"Add Key"添加 API Key（可能与 Account 1 相同）
   - 点击"Create Provider"保存

### 步骤 2：配置模型路由

在 Models 管理页面（`/models`），配置 `model_provider_pricings`：

1. 找到 Claude 模型（如 `claude-3-5-sonnet`）
   - 编辑该模型的 Provider 映射
   - 选择 `BAI (Anthropic)` 作为 Provider Account
   - 设置 `provider_model_id` 为上游的模型 ID（如 `claude-3-5-sonnet-20241022`）
   - 保存

2. 找到 GPT 模型（如 `gpt-4o`）
   - 编辑该模型的 Provider 映射
   - 选择 `BAI (OpenAI)` 作为 Provider Account
   - 设置 `provider_model_id` 为上游的模型 ID（如 `gpt-4o`）
   - 保存

### 步骤 3：验证配置同步

ParaRouter Gateway 会自动同步配置到 UniGateway：

1. **检查 Gateway 日志**，确认收到配置更新通知
   ```bash
   # 查看 Gateway 日志
   docker logs pararouter-gateway
   ```

2. **检查 UniGateway 配置**，确认生成了两个 Endpoint：
   - Endpoint 1: `driver_id = "openai-compatible"`, `provider_kind = OpenAiCompatible`
   - Endpoint 2: `driver_id = "anthropic"`, `provider_kind = Anthropic`

### 步骤 4：测试

1. **测试 Claude 模型**：
   ```bash
   curl http://localhost:8000/v1/messages \
     -H "Content-Type: application/json" \
     -H "x-api-key: YOUR_PARAROUTER_KEY" \
     -d '{
       "model": "claude-3-5-sonnet",
       "max_tokens": 1024,
       "messages": [{"role": "user", "content": "Hello"}]
     }'
   ```
   确认 UniGateway 使用 `/v1/messages` 路径连接上游，并保留完整的 thinking blocks。

2. **测试 GPT 模型**：
   ```bash
   curl http://localhost:8000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_PARAROUTER_KEY" \
     -d '{
       "model": "gpt-4o",
       "messages": [{"role": "user", "content": "Hello"}]
     }'
   ```
   确认 UniGateway 使用 `/v1/chat/completions` 路径连接上游，且工作正常。

## 工作原理

1. **ParaRouter** 根据 `model_provider_pricings` 的配置，为不同模型选择不同的 Provider Account。

2. **ParaRouter Gateway** 从数据库加载配置，为每个 Provider Account 创建一个 Endpoint：
   - `BAI (OpenAI)` → Endpoint with `driver_id = "openai-compatible"`
   - `BAI (Anthropic)` → Endpoint with `driver_id = "anthropic"`

3. **UniGateway** 根据 Endpoint 的 `driver_id` 选择对应的 Driver：
   - `openai-compatible` → `OpenAiCompatibleDriver`
   - `anthropic` → `AnthropicDriver`

4. **请求流程**：
   - Claude 模型请求 → ParaRouter 选择 `BAI (Anthropic)` → UniGateway 使用 `AnthropicDriver` → 请求上游的 `/v1/messages`
   - GPT 模型请求 → ParaRouter 选择 `BAI (OpenAI)` → UniGateway 使用 `OpenAiCompatibleDriver` → 请求上游的 `/v1/chat/completions`

## 注意事项

1. **Base URL 配置**：
   - 某些服务商（如 BAI）的 OpenAI 和 Anthropic 协议可能使用相同的 base URL（如 `https://api.bai.com/v1`）
   - UniGateway 会根据 `driver_id` 自动选择正确路径（`/v1/chat/completions` 或 `/v1/messages`）
   - 但如果服务商的 Anthropic 协议使用不同的 base URL（如 `https://api.bai.com/v1/anthropic`），则需要在创建 Account 时分别设置

2. **API Key**：
   - 某些服务商的 OpenAI 和 Anthropic 协议可能使用相同的 API Key
   - 但某些服务商可能为不同协议提供不同的 API Key
   - 在创建 Account 时，确保使用正确的 API Key

3. **Model ID 映射**：
   - 不同协议可能使用不同的模型 ID
   - 例如，Anthropic 协议的模型 ID 可能包含版本号（如 `claude-3-5-sonnet-20241022`）
   - 而 OpenAI 协议的模型 ID 可能更简短（如 `gpt-4o`）
   - 在配置 `model_provider_pricings` 时，确保设置正确的 `provider_model_id`

## 长期优化方案

如果方案 2 的配置冗余问题严重，可以考虑以下长期优化：

### 优化 1：在 `provider_accounts` 表增加 `driver_type_override` 字段

允许 Account 覆盖 Provider Type 的 `driver_type`，无需创建多个 Account。

**修改文件**：
- `packages/shared/schema.sql`
- `hub/routes/providers.ts`
- `gateway/src/sync/pools.rs`

### 优化 2：在 `model_provider_pricings` 表增加 `driver_type` 字段

粒度最细，每个模型可以独立配置协议。

**修改文件**：
- `packages/shared/schema.sql`
- `hub/routes/models.ts`
- `gateway/src/sync/pools.rs`

这些长期优化可以在方案 2 验证成功后，根据实际使用反馈决定是否实施。
