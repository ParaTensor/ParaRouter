# 端到端计费流测试指南 (Billing E2E Testing Guide)

这份文档旨在指导开发者或管理员以“普通真实用户”的第一视角，在本地环境中验证从注册、充值，到模型消耗及准确计费落库的整个端到端流程。

## 测试准备工作

在开始测试前，请确保本地的两个核心服务已经正常启动运行：
1. **Hub Backend**: `cd hub && npm run dev`
2. **Rust Gateway**: `cd gateway && cargo run`

---

## 阶段一：账户开通与初始余额验证

### 1. 模拟用户注册
通过 Web 前端 UI 进入系统的注册页面，注册一个新的测试账号（例如：`tester@pararouter.local` / 密码: `Password123!`）。
*(注意：也可以使用本地现有的任意用户，或直接从后台数据库插入新用户)。*

### 2. 查看默认余额
使用刚才注册的用户登录平台，前往左侧导航栏的 **Settings (设置) -> Billing (计费/余额)**。
* **预期结果**：系统默认会赠送测试余额（通常为 `$10.00` 这个数值），应能在 UI 上动态拉取并展示，而不是原先的静态占位符。

---

## 阶段二：管理员人工充值测试

普通用户目前没有自动付款渠道，额度如果耗尽需要管理员在后台为其人工充值。我们将通过 API 来验证充值操作与余额同步机制：

### 1. 提权发放配额
在任意终端或 Postman 中，使用**拥有 Admin 权限系统管理员的 Bearer Token** 发起手工充值请求，为刚才的测试用户（`tester`）充入 `$50.00`：

```bash
curl -X POST http://localhost:3322/api/billing/recharge \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <Admin_的_Token>" \
  -d '{"username": "tester", "amount": 50.0}'
```

### 2. 检查充值入账
* **预期结果**：该 POST 请求将成功响应新余额。
* 切回 Web UI 页面中的 **Settings -> Billing** 并刷新。
* **预期结果**：UI 将实时更新其最新余额（即：原始金额 `$10` + 新注入的 `$50` = 最新余额 `$60.00`）。后台的 `billing_records` 审计表内也会永久留存这条流水。

---

## 阶段三：拦截控制与计费抵扣验证

在此阶段将验证核心业务：**Rust Gateway 拦截逻辑及计费回填**。为确保可触发扣费，请先在您的 Admin 后台中配置好至少 1 个能够走通的 Provider 模型（例如真实配置了 Key 的 `gpt-4o-mini`），并将其 Pricing 发布状态设为 Online。

### 1. 申请独立 API Key
测试用户（`tester`）在自己首页或 Settings 面板通过 **Create Key** 申请属于自己的通信令牌，名字自拟（例如 `sk-user-xxxx`）。

### 2. 情境测试 A：正常抵扣业务
使用该 Key 向您本地监听在 `8000` 端口的 Gateway 发起推理测试（建议只说一句 `hello` 将 token 消耗降至最低以便观察小数点）：

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-user-xxxx" \
  -d '{
    "model": "gpt-4o-mini", 
    "messages": [{"role": "user", "content": "say hello world"}]
  }'
```
* 等待终端请求正常返回内容。
* 打开 Hub Web UI 的 **Activity（活动中心）或 Billing 页**。
* **预期结果**：余额将精准地根据 `gpt-4o-mini` 对应在数据库公式中的每 M tokens 标价，对响应所消耗的 prompt 和 completion 代价完成极其轻微的抵扣结算 (例如余额变为：`$59.9995`)。

### 3. 情境测试 B：恶意白嫖防御（402 Payment Required）
此项特此验证 Rust 网关的安全管控。可通过直连数据库将 `tester` 用户的余额粗暴归零：
```sql
-- 在本地 PostgreSQL psql 面板中执行
UPDATE users SET balance = 0 WHERE username = 'tester';
```
再次使用上面的 `curl` 发送推理请求。
* **预期结果**：系统不予放行并立即中断返回 API-native 错误 `402 Payment Required: Insufficient balance. Please recharge your account.` 并且此笔调用上游没有产生任何计费和带宽消耗。

---

## 自动化测试备忘（供快速回归）

为了让团队免除重复配置工作从而一键进行上述闭环断言测试，系统已内置自动化脚本，可无界限地完成这套端到端注册流程。

**执行方式**：
```bash
npx tsx scripts/test_billing_end_to_end.ts
```
* **工作机制**：它会自动完成模拟写入库 -> 人工加款 -> 建 Key -> 发起 Gateway Curl 等上述所有情景并自动进行 `Assert`。当代码底层有大变动时，此脚本是快速定位异常边界的最佳助手。
