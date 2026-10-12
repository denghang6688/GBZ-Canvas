@echo off
REM ============================================
REM   GBZ 智能画布  (GBZ-Canvas) 一键启动
REM ============================================

cd /d "%~dp0"

setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION

REM ---- 1) 选择 Python ----
set "PYEXE="
if exist "%~dp0python\python.exe" set "PYEXE=%~dp0python\python.exe"
if not defined PYEXE (
    where python >nul 2>nul && (set "PYEXE=python")
)
if not defined PYEXE (
    echo [ERROR] 找不到 Python。
    echo         请安装 Python 3.10+ 并加入 PATH，或下载嵌入式 Python 解压到 python\
    pause
    exit /b 1
)

echo ============================================
echo    GBZ 智能画布  (GBZ-Canvas)
echo ============================================
echo [OK] 使用 Python: %PYEXE%
"%PYEXE%" --version

REM ---- 2) 端口检查 ----
set "PORT=2000"
for /f "tokens=*" %%P in ('netstat -ano ^| findstr /R "TCP.*:%PORT% .*LISTENING"') do (
    set "OLDPID=%%P"
)
if defined OLDPID (
    for /f "tokens=5" %%P in ("%OLDPID%") do (
        echo [WARN] 端口 %PORT% 被 PID %%P 占用，尝试结束它...
        taskkill /PID %%P /F >nul 2>nul
    )
)

REM ---- 3) 依赖检查 ----
if exist requirements.txt (
    "%PYEXE%" -c "import fastapi, uvicorn, httpx, requests, PIL" 2>nul
    if errorlevel 1 (
        echo [INFO] 缺少依赖，准备安装...
        "%PYEXE%" -m pip install --disable-pip-version-check -r requirements.txt
        if errorlevel 1 (
            echo [ERROR] 依赖安装失败，请检查网络或手动运行：
            echo         %PYEXE% -m pip install -r requirements.txt
            pause
            exit /b 1
        )
    ) else (
        echo [OK] 依赖检查通过。
    )
)

REM ---- 4) 计算本机 IP ----
set "LAN_IP=127.0.0.1"
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ip=(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } | Select-Object -First 1 -ExpandProperty IPv4Address).IPAddress; if(-not $ip){$ip=(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Sort-Object InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress)}; if($ip){$ip}else{'127.0.0.1'}"`) do set "LAN_IP=%%I"

echo.
echo --------------------------------------------
echo  本机访问：  http://127.0.0.1:%PORT%/
echo  局域网：    http://%LAN_IP%:%PORT%/
echo  API 文档：  http://127.0.0.1:%PORT%/docs
echo  按 Ctrl+C 停止服务
echo --------------------------------------------
echo.

REM 后台 3 秒后自动打开浏览器
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:%PORT%/"

"%PYEXE%" main.py
echo.
echo 服务已停止。
pause