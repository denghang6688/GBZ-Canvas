# GBZ 智能画布 / GBZ-Canvas

> 一个面向创作者的本地化 AI 无限画布工作台 —— 在浏览器里拖拽节点、组装工作流、调任意大模型（对话 / 文生图 / 文生视频 / LoRA / ControlNet / ComfyUI），一键导出可复用的工作流。

[![License](https://img.shields.io/badge/license-Commercial--No%20Resale-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org)
[![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688.svg)](https://fastapi.tiangolo.com)

## 亮点

- 🧩 **无限画布**：节点 + 连线 + 分组，支持复制粘贴、Ctrl 拖拽复制、缩略图拖入工作流。
- 🤖 **多模型统一接口**：对话、文生图、文生视频默认接入 [APIMart](https://apimart.ai) / [ModelScope](https://modelscope.cn)，可一键切换到本地 ComfyUI 或 RunningHub 云端工作流。
- 🎬 **全链路**：从提示词 → 参考图 → 工作流 → 多宫格分镜 → 视频成片，一条龙在画布里完成。
- 📚 **可复用的工作流库**：画布内拼好的工作流可一键导出成 `.zip`，分享给他人导入即用。
- 🖥️ **离线优先**：本地 Python + 浏览器即可运行；自动更新支持魔搭社区与 GitHub 双源；局域网内其他设备也能访问。
- 🌗 **主题 / 多语言**：内置深色 / 浅色 / 自定义主题，支持中英双语。

## 📦 下载方式

| 方式 | 适合 | 说明 |
| --- | --- | --- |
| [`git clone` 源码（推荐）](#5-分钟上手从源码运行) | 大多数用户 | 需要 Python 3.10+；双击 `启动服务.bat` 会自动检测并安装依赖 |
| [Docker](#docker推荐用于服务器--nas) | 服务器 / NAS | `docker compose up -d`，一条命令起服务 |

> ⚠️ GitHub 页面上的 **Code → Download ZIP** 给的是**源码包**（约 3 MB），不含 Python 运行时；
> 装了 Python 3.10+ 的机器双击 `启动服务.bat` 会自动装依赖并启动。

## 5 分钟上手（从源码运行）

### Windows

```bat
git clone https://github.com/denghang6688/GBZ-Canvas.git
cd GBZ-Canvas
启动服务.bat
```

首次启动会自动检测并安装依赖（优先走清华镜像，失败自动回退官方源）；机器上找不到 Python 3.10+ 时，
脚本会给出安装指引。启动后浏览器会自动打开 `http://127.0.0.1:2000/`，局域网内其他设备可通过 `http://<你的IP>:2000/` 访问。

### macOS / Linux

```bash
git clone https://github.com/denghang6688/GBZ-Canvas.git
cd GBZ-Canvas
./start.sh        # 或 macOS 用户双击 mac-启动服务.command
```

### Docker（推荐用于服务器 / NAS）

```bash
docker compose up -d
# 访问 http://<服务器IP>:2000/
```

## 文档

- 新手教程：[`MAC-使用说明.md`](MAC-使用说明.md)（macOS 用户先看这个）
- API 文档：启动后访问 `http://127.0.0.1:2000/docs`
- 更新日志：[`CHANGELOG.md`](CHANGELOG.md)
- 安全策略：[`SECURITY.md`](SECURITY.md)

## 目录结构

```
DH智能画布/
├── main.py                 # FastAPI 应用入口（已包含全部 API 路由）
├── requirements.txt        # Python 依赖
├── VERSION                 # 当前版本号
├── 启动服务.bat            # Windows 一键启动
├── mac-启动服务.command    # macOS 一键启动
├── start.sh                # Linux/macOS 通用启动脚本
├── static/                 # 前端静态资源
│   ├── index.html          # AI Studio 主壳
│   ├── canvas.html         # 智能画布
│   ├── smart-canvas.html   # 智能画布（旧版，保留兼容）
│   ├── js/                 # 前端逻辑
│   ├── css/                # 样式
│   ├── vendor/             # 本地化的第三方依赖（Tailwind、Lucide、Three.js、字体）
│   └── update-notes.json   # 内嵌的版本更新说明
├── workflows/              # ComfyUI 工作流配置（可分享 / 可导入）
├── assets/                 # 用户上传 / 生成的素材（不入库）
├── data/                   # 运行时状态（API 配置、画布、提示词库等，不入库）
├── python/                 # Windows 嵌入式 Python 运行时（不入库）
├── tools/                  # 辅助脚本（即梦 CLI 安装 / 登录）
└── .github/                # Issue / PR 模板
```

## 配置

启动后，左下角 → 「API 设置」配置以下任一来源即可开始：

| 来源 | 适用场景 | 备注 |
| --- | --- | --- |
| [APIMart](https://apimart.ai) | 一站式，多模型 | 默认 `https://api.apimart.ai`，选 `APIMart异步` 协议 |
| [ModelScope](https://modelscope.cn) | 国内直连 + 免费额度 | 需 ModelScope API Token；可调用 LoRA |
| 本地 ComfyUI | 离线 / 自定义工作流 | 启动 ComfyUI 后填入地址即可 |
| [RunningHub](https://runninghub.cn) | 云端 ComfyUI | 不需要本地显卡 |

## 开发

```bash
# 推荐 Python 3.10+
python -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt

# 启动开发模式（热重载）
uvicorn main:app --reload --host 0.0.0.0 --port 2000
```

代码贡献请参考 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

## 安全

- 本应用默认监听 `0.0.0.0:2000`，意味着同一局域网都能访问。请仅在受信网络（家庭 / 公司内网）使用，不要直接暴露到公网。
- API Key 通过环境变量或本地 `API/.env` 管理，不会上传到任何远端。
- 漏洞上报请见 [`SECURITY.md`](SECURITY.md)。

## 路线图

- [ ] 前端拆模块（Vite + 原生 ES Modules）
- [ ] 把画布渲染迁移到 Canvas/WebGL（Konva 或 PixiJS），节点支持到 1000+
- [ ] 自动更新增加 SHA256 签名校验
- [ ] OpenAPI 文档补全（每个字段加 description + example）
- [ ] CI / 单元测试
- [ ] 国际化扩到日 / 韩

完整计划见 [`CHANGELOG.md`](CHANGELOG.md) 和 GitHub Issues。

## 致谢

- [FastAPI](https://fastapi.tiangolo.com/) —— 后端框架
- [Tailwind CSS](https://tailwindcss.com/) / [Lucide](https://lucide.dev/) / [Three.js](https://threejs.org/) —— 前端依赖
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) —— 本地工作流引擎
- [ModelScope 魔搭社区](https://modelscope.cn/) —— 国内模型与社区支持
- 所有提交 Issue、PR、反馈的朋友

## 许可证

**允许商用，禁止转售与封装**（自定义许可，非 OSI 开源许可）：

- 允许任何商业目的使用，包括公司内部用于自身业务，**无需取得授权**；
- 禁止转售、转授权、封装，或以本项目（含其修改版）对外提供收费产品或服务；
- 基于本项目二次开发的软件必须保持开源，并注明原作者与来源。

完整条款见 [LICENSE](LICENSE)。

## Star History

如果这个项目对你有帮助，欢迎点个 ⭐ —— 这是作者最大的鼓励。