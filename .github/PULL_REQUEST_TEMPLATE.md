name: Pull request
about: 提交代码变更
title: ""
labels: []
assignees: []

---

## 改了什么

<!-- 用一两句话描述本次 PR 的核心目的 -->

## 关联 Issue

<!-- `Closes #123`，或 `Refs #456`；没有就写 N/A -->

## 改动点

<!-- 关键文件 / 函数 / API 变更，方便 reviewer 快速进入 -->

## 验证步骤

<!-- 你手动验证过什么？哪些场景？截图 / 录屏请放这里 -->

## 影响面

<!-- 是否影响现有功能？是否需要更新文档 / CHANGELOG？是否新增依赖？ -->

## 自检清单

- [ ] `ruff check .` 通过
- [ ] `black --check .` 通过
- [ ] 没有遗留 `print(...)` / `console.log(...)` 调试代码
- [ ] 没有把 `data/` `assets/` `history.json` `*.env` 等用户数据加进 commit
- [ ] 新增 / 修改的 API 在 OpenAPI 文档里能查到（如适用）
- [ ] 已更新 `CHANGELOG.md`（如适用）