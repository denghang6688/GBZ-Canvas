#!/usr/bin/env bash
# GBZ 智能画布 一键启动脚本（Linux / macOS 通用）
# 用法： ./start.sh  或  bash start.sh

set -e

# 切到脚本所在目录
cd "$(dirname "$0")"

echo "============================================"
echo "   GBZ 智能画布  (GBZ-Canvas)"
echo "============================================"
echo ""

# 1) 选择 Python 解释器
PY=""
for candidate in \
    "$PWD/python/bin/python3" \
    "$PWD/python/python.exe" \
    /opt/homebrew/bin/python3 \
    /usr/local/bin/python3 \
    "$(command -v python3)" \
    "$(command -v python)"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
        PY="$candidate"
        break
    fi
done

if [ -z "$PY" ]; then
    echo "[ERROR] 找不到可用的 Python 3。"
    echo "  - macOS: brew install python 或下载 https://www.python.org/downloads/"
    echo "  - Linux: sudo apt install python3 python3-venv python3-pip"
    exit 1
fi
echo "[OK] 使用 Python: $PY"
$PY --version

# 2) 端口占用检测
PORT=2000
if command -v lsof >/dev/null 2>&1; then
    OLD_PID=$(lsof -ti :$PORT 2>/dev/null || true)
    if [ -n "$OLD_PID" ]; then
        echo "[WARN] 端口 $PORT 被旧进程占用 (PID: $OLD_PID)，尝试结束它..."
        kill $OLD_PID 2>/dev/null || true
        sleep 1
        if lsof -ti :$PORT >/dev/null 2>&1; then
            kill -9 $(lsof -ti :$PORT) 2>/dev/null || true
        fi
        echo "[OK] 旧进程已清理。"
    fi
fi

# 3) 检查依赖（requirements.txt）
if [ -f requirements.txt ]; then
    if ! $PY -c "import fastapi, uvicorn, httpx, requests, PIL" 2>/dev/null; then
        echo "[INFO] 缺少依赖，准备安装..."
        if $PY -m pip --version >/dev/null 2>&1; then
            $PY -m pip install --disable-pip-version-check -r requirements.txt
        else
            echo "[ERROR] 检测到 pip 不可用，请确认 Python 安装包完整或手动安装："
            echo "        $PY -m pip install -r requirements.txt"
            exit 1
        fi
    else
        echo "[OK] 依赖检查通过。"
    fi
fi

# 4) 计算本机 IP
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ -z "$LAN_IP" ]; then
    LAN_IP="$(ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}')"
fi
[ -z "$LAN_IP" ] && LAN_IP="127.0.0.1"

echo ""
echo "--------------------------------------------"
echo " 本机访问：  http://127.0.0.1:$PORT/"
echo " 局域网：    http://$LAN_IP:$PORT/"
echo " API 文档：  http://127.0.0.1:$PORT/docs"
echo " 按 Ctrl+C 停止服务"
echo "--------------------------------------------"
echo ""

# 5) 后台自动打开浏览器（不影响服务运行）
( sleep 3 && (xdg-open "http://127.0.0.1:$PORT/" 2>/dev/null || open "http://127.0.0.1:$PORT/" 2>/dev/null || true) ) &

# 6) 真正启动服务
exec $PY main.py