# AI Agent 协作规则

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
