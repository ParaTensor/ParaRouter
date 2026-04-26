# AI Agent 协作规则

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
