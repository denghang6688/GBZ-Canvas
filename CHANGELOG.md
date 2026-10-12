# CHANGELOG

GBZ 智能画布的所有显著变更都会记录在这里。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)（推荐从 0.x 起步）。

## [Unreleased]

### Added

- 一键 Docker 启动（`docker compose up -d`）。
- `/api/health` 健康检查端点，供监控 / NAS 健康检查使用。
- 完整的开源基础设施：`README.md` / `LICENSE` / `CONTRIBUTING.md` / `SECURITY.md` / Issue & PR 模板 / `.gitignore` / `requirements*.txt`。

## [2026.07.18] - 2026-07-18

> 该版本的项目代号沿用了日期格式，下次发版开始切换为 SemVer。

### Added

- 画布内支持 `Ctrl+C` / `Ctrl+V` 复制粘贴节点、工作流模块和组合，粘贴时会重新生成节点 ID 并保留组内成员与连线关系。
- 画布内支持按住 `Ctrl` 拖拽复制节点、图片缩略图、智能分组和工作流组合，保留原有 `Alt` 拖拽复制能力。
- 局域网内可发布新版本，其他客户端通过主机地址检测并一键更新。

### Fixed

- 修复画布脚本缓存更新时导致画布空白的问题，并更新 `smart-canvas.js` 缓存版本号。
- 优化左侧竖向工具栏的版本号和更新入口显示，移除画布内重复外露的更新按钮。
- 增强外层 AI Studio 与画布 iframe 的快捷键桥接，焦点不在画布内时也能触发画布复制粘贴。
- 修复 `Ctrl` 拖拽复制工作流模块时只复制外框、不复制组内成员和内部连线的问题。

[Unreleased]: https://github.com/denghang6688/GBZ-Canvas/compare/v2026.07.18...HEAD
[2026.07.18]: https://github.com/denghang6688/GBZ-Canvas/releases/tag/v2026.07.18