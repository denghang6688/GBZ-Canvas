#!/bin/bash
# 修复权限并启动服务
# 双击运行即可

cd "$(dirname "$0")"

echo "============================================"
echo "   ComfyUI-API-Modelscope"
echo "============================================"
echo ""
echo "修复权限中..."

# 移除安全限制（只针对实际存在的文件类型）
xattr -r -d com.apple.quarantine *.command 2>/dev/null
xattr -r -d com.apple.quarantine main.py 2>/dev/null

# 设置执行权限（修正：原脚本引用了不存在的 启动服务.command/启动服务.py）
chmod +x *.command 2>/dev/null
chmod +x main.py 2>/dev/null

echo "权限已修复！"
echo ""

# 清理占用 2000 端口的旧进程，避免 address already in use
OLD_PID=$(lsof -ti :2000 2>/dev/null)
if [ -n "$OLD_PID" ]; then
    echo "检测到 2000 端口被占用，正在停止旧进程 (PID: $OLD_PID)..."
    kill $OLD_PID 2>/dev/null
    sleep 1
    # 仍未退出则强制结束
    if lsof -ti :2000 >/dev/null 2>&1; then
        kill -9 $(lsof -ti :2000) 2>/dev/null
    fi
    echo "旧进程已停止。"
    echo ""
fi

echo "正在启动服务..."
echo "本机访问： http://127.0.0.1:2000/"
echo "============================================"
echo ""

# 优先使用已装好依赖的隔离 Python 环境（WorkBuddy venv），其次 Homebrew Python
if [ -x /Users/hans/.workbuddy/binaries/python/envs/default/bin/python3 ]; then
    PY_BIN=/Users/hans/.workbuddy/binaries/python/envs/default/bin/python3
elif [ -x /opt/homebrew/bin/python3 ]; then
    PY_BIN=/opt/homebrew/bin/python3
elif [ -x /usr/local/bin/python3 ]; then
    PY_BIN=/usr/local/bin/python3
elif command -v python3 >/dev/null 2>&1; then
    PY_BIN=$(command -v python3)
else
    echo "错误：找不到 Python3，请先安装 Python 3.10+："
    echo "https://www.python.org/downloads/"
    read -p "按 Enter 键退出..."
    exit 1
fi

# 后台启动服务，等待就绪后用 Microsoft Edge 打开页面
"$PY_BIN" main.py &
SERVICE_PID=$!

for i in $(seq 1 30); do
    if curl -s -o /dev/null --max-time 1 http://127.0.0.1:2000/; then
        break
    fi
    sleep 1
done

EDGE_BIN="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
if [ -d "/Applications/Microsoft Edge.app" ]; then
    echo "使用 Microsoft Edge 打开页面..."
    open -a "Microsoft Edge" "http://127.0.0.1:2000/"
else
    echo "未找到 Microsoft Edge，使用系统默认浏览器打开..."
    open "http://127.0.0.1:2000/"
fi

# 保持脚本前台运行，直到服务退出（关闭终端窗口即停止服务）
wait $SERVICE_PID
