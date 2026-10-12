# 部署

> 草稿，待补详细步骤。

## 1. 本机开发

最简，直接：

```bash
# Windows
启动服务.bat

# macOS
./mac-启动服务.command

# Linux / macOS 通用
./start.sh
```

启动后访问 `http://127.0.0.1:2000/`。

## 2. 局域网 / NAS（推荐 Docker）

```bash
docker compose up -d
```

容器会把 `data/` `assets/` `workflows/` 挂到宿主机，升级 / 迁移只需备份这几个目录。

如果通过反代暴露到公网，**务必**：

1. 在 Nginx / Caddy 上加鉴权（basic auth 或 OIDC）。
2. 启用 HTTPS（Let's Encrypt）。
3. 限制上传大小（与 FastAPI 的 `max_upload_size` 保持一致）。

## 3. 反向代理示例（Nginx）

```nginx
server {
    listen 80;
    server_name canvas.example.com;
    client_max_body_size 200m;        # 与 main.py 内的上传上限一致

    location / {
        proxy_pass http://127.0.0.1:2000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

## 4. systemd 单元（非 Docker，Linux）

```ini
# /etc/systemd/system/gbz-canvas.service
[Unit]
Description=GBZ Canvas
After=network.target

[Service]
Type=simple
User=gbz
WorkingDirectory=/opt/gbz-canvas
ExecStart=/opt/gbz-canvas/.venv/bin/python main.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gbz-canvas
```

## 5. 健康检查

启动后访问 `http://host:port/api/health`，应返回：

```json
{ "status": "ok", "version": "...", "timestamp": 1700000000 }
```

Docker Compose 已内置 `healthcheck`，K8s / systemd 可仿照实现。