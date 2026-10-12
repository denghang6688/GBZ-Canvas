# 架构概览

> 草稿，待补图。

## 模块划分

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │  index.html  │ │ canvas.html  │ │  api-settings.html   │ │
│  │  (AI Studio) │ │ (智能画布)    │ │  / asset-manager ... │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
│         │ 静态资源 (Tailwind / Lucide / Three.js 本地化)      │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│  FastAPI (main.py)                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │ /api/*   │ │ /api/    │ │ /api/    │ │ /api/          │ │
│  │ canvas   │ │ chat     │ │ providers│ │ workflows      │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘ │
│       │                                                    │
│  ┌────▼────┐  ┌──────────┐  ┌──────────┐                  │
│  │  Comfly │  │ ModelSc. │  │ RunningHub│                  │
│  └─────────┘  └──────────┘  └──────────┘                  │
└─────┬──────────────────────────────────────────────────────┘
      │ HTTPS / WebSocket
      ▼
   第三方 AI 服务 / 本地 ComfyUI / 即梦 CLI / Gemini CLI / Codex
```

## 关键数据流

### 画布保存

```
canvas.html  →  PUT /api/canvases/{id}  →  data/canvases/{id}.json
                                          + history.json (增量)
```

### 文生图

```
canvas 节点 → /api/online-image  →  provider(images)  →  轮询 /api/image-task-query
                                                       ↓
                                             结果写回画布节点
```

### ComfyUI 工作流

```
canvas 节点 → /api/workflows/{name}/run  →  本地 ComfyUI  /api/prompt
                                            ↓
                                       监听 WebSocket 进度
                                            ↓
                                       完成后回写到画布
```

## 单进程 vs 多 worker

当前 `main.py` 直接 `uvicorn.run(...)`，单进程。生产建议：

- 用 `gunicorn -k uvicorn.workers.UvicornWorker` 或 `uvicorn --workers N`
- 在 Nginx / Caddy 前面做反向代理
- 把 `data/` `assets/` 放到共享卷 / 对象存储

更详细的部署文档见 [`deployment.md`](deployment.md)（待补）。