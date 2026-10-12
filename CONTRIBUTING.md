# 贡献指南

感谢你愿意让 GBZ 智能画布变得更好。本指南会帮助你快速上手并提交高质量的修改。

## 行为准则

- 友善、专业、就事论事。
- 接受建设性批评，把分歧留在 Issue / PR 的技术讨论里。
- 优先考虑用户隐私和数据安全。本项目处理用户上传的图片、API Key、画布状态，禁止在代码 / 日志中泄露任何用户数据。

## 我能贡献什么

- 🐛 **Bug 修复**：复现 → 写最小测试 → 修复 → 跑测试 → 提 PR。
- ✨ **新功能**：先开 Issue 讨论设计，确认后再写代码，避免做无用功。
- 📚 **文档**：README / 教程 / API 文档的错别字、不清楚的地方都很欢迎。
- 🌐 **翻译**：i18n 字符串新增 / 校对。
- 🎨 **工作流**：放进 `workflows/custom/` 并附一张封面图与简短说明。

## 开发环境

```bash
git clone https://github.com/denghang6688/GBZ-Canvas.git
cd GBZ-Canvas

# 推荐 Python 3.10+
python -m venv .venv
source .venv/bin/activate                  # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt

# 启动开发模式（热重载）
uvicorn main:app --reload --host 0.0.0.0 --port 2000
```

### 提交前检查清单

- [ ] `ruff check .` 通过
- [ ] `black --check .` 通过（或 `black .` 后再提交）
- [ ] 涉及后端变更：在 PR 描述里附上你手动验证的步骤 / 截图
- [ ] 涉及前端变更：在 `Chrome 120+` / `Edge 120+` 至少打开一次，确认没有 console error
- [ ] 任何 `print(...)` / `console.log(...)` 调试代码都已移除
- [ ] 没有把 `data/`、`assets/`、`history.json`、`*.env` 等用户数据加进 commit

## 提 PR 的流程

1. Fork 仓库，从 `main` 拉新分支：
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. 单一 PR 聚焦单一目的；如果你同时做两件事，请拆两个 PR。
3. 提交信息建议遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：
   ```
   feat(canvas): 支持选中节点后通过快捷键批量对齐
   fix(canvas): 修复拖拽时 iframe 失焦导致粘贴失效的问题
   docs: 补 README 中 Docker 启动的镜像体积说明
   ```
4. 推送到你的 fork，然后在 GitHub 上发起 PR：
   - 标题清晰描述「改了什么」
   - 正文写「动机 / 改动点 / 截图 / 验证步骤 / 是否影响现有功能 / 是否需要更新文档」
5. 等 CI 通过、reviewer 看完。冲突时优先 rebase 而不是 merge commit。

## 报告 Bug

请用 [Bug report 模板](../../.github/ISSUE_TEMPLATE/bug_report.md)，附上：

- 操作系统与 Python 版本
- 复现步骤（越具体越好）
- 期望结果 / 实际结果
- 截图或错误日志（**注意脱敏：API Key 不要贴出来**）

## 提新功能

请用 [Feature request 模板](../../.github/ISSUE_TEMPLATE/feature_request.md)，先描述：

- 你想解决什么问题
- 期望的交互 / 体验
- 是否愿意自己实现

## 代码风格

- **Python**：PEP 8 + 类型注解；模块顶部 `from __future__ import annotations`；新写的函数加上 docstring。
- **JS / HTML**：保持现有 4 空格缩进；新增组件尽量放到独立的 `static/js/*.js` 模块里，不混进 `index.html`。
- **CSS**：优先用现有的 Tailwind 工具类，避免新增零散的内联样式。

## 安全问题

**请不要**在公开 Issue 里发漏洞细节。详见 [`SECURITY.md`](SECURITY.md)。

---

再次感谢贡献，让我们一起把它做得更好用。