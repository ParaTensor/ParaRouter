# AI Agent 协作规则

## 项目规范

### ParaRouter 与 UniGateway 边界

- **ParaRouter 负责产品层配置、数据库同步、路由选择、鉴权、计费、健康检查和 UI/Hub 管理逻辑**。
- **UniGateway 负责协议层语义转换、上游请求渲染、下游响应归一化、流式协议处理和 provider driver 行为**。
- 当修复涉及 OpenAI/Anthropic 协议字段转换、provider-specific 请求体/请求头渲染、reasoning/thinking 字段解析或 SSE chunk 重写时，优先在 UniGateway 中实现；ParaRouter 只应通过 metadata 或配置声明能力，不应硬编码协议转换细节。
- ParaRouter 可以存储并注入中立 metadata（例如 `unigateway.*`），但不应在 API handler 中把这些 metadata 翻译成特定上游 provider 的 body 参数，除非已有明确的 UniGateway 约定或临时兼容方案经过评审并标注迁移计划。
- 修复前应先判断问题属于产品配置/路由数据，还是协议适配/driver 渲染；边界不清时先说明归属判断，不要把 UniGateway 责任下沉到 ParaRouter。

### 文件组织

- **严禁在根目录放置临时或测试脚本**。
- 所有测试脚本应根据所属模块放置在对应目录的 `tests/` 或 `scripts/` 下（例如 `hub/tests/`）。
- 根目录应保持整洁，仅包含项目配置文件及必要的说明文档。

### 文档命名与归档

- `docs/` 下的文档文件名应保持简短清晰，避免使用过长的复合名称。
- 当文档需要表达模块、阶段、方案、RFC 等附加区分时，优先使用子目录分类，而不是继续拉长文件名。
- 新增文档时，优先放入对应主题目录，例如 `docs/unigateway/`、`docs/ui/`、`docs/billing/`。
- 文档重构后应保持 `docs/` 顶层目录可快速浏览，必要时更新索引文档。

## 前端 UI

### 下拉选择

产品界面中的选项列表（状态、筛选条件、枚举字段等）**不得使用原生 HTML `<select>`**，应使用项目内封装组件 `web/src/components/Select.tsx`（或经评审的同等可访问自定义下拉），以保持样式一致并避免浏览器默认控件在弹窗、主题与交互上与整体设计脱节。

## 部署纪律

### 代码提交后必须监控部署状态

任何代码推送到 main 分支后，必须立即监控 GitHub Actions 部署状态，直到确认成功或失败。

**执行步骤**：
1. 推送代码后立即获取最新 workflow run ID
2. 使用 `gh run watch <run-id>` 实时监控
3. 确认 deployment job 成功完成

**命令示例**：
```bash
# 推送代码后获取 run ID
gh run list -L 1 --json databaseId

# 监控部署状态
gh run watch <databaseId>
```

**失败处理**：
- 若部署失败，立即查看日志定位问题
- 修复后重新提交并再次监控
- 不要将监控任务留给用户
