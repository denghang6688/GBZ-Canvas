@echo off
chcp 65001 >nul
REM ============================================
REM   GBZ 智能画布 (GBZ-Canvas) 一键启动
REM ============================================
cd /d "%~dp0"
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION

set "PORT=2000"
set "APP_DL=https://github.com/denghang6688/GBZ-Canvas/releases/latest"

echo ============================================
echo    GBZ 智能画布  (GBZ-Canvas)
echo ============================================
echo.

REM ---- 1) 选择 Python：内置运行时 > python > py -3 ----
set "PYEXE="
set "PYARG="

if exist "%~dp0python\python.exe" (
    set "PYEXE=%~dp0python\python.exe"
    echo [OK] 使用内置 Python 运行时（免安装）
)

if not defined PYEXE (
    for /f "delims=" %%P in ('where python 2^>nul') do (
        if not defined PYEXE set "PYEXE=%%P"
    )
)
if not defined PYEXE (
    for /f "delims=" %%P in ('where py 2^>nul') do (
        if not defined PYEXE set "PYEXE=%%P"
    )
    if defined PYEXE set "PYARG=-3"
)

if not defined PYEXE (
    echo.
    echo [ERROR] 没有找到 Python 3.10+，无法启动。
    echo.
    echo   方案一（推荐）：下载「免安装便携版」，自带 Python，解压双击即用
    echo       %APP_DL%
    echo.
    echo   方案二：安装 Python 3.10+，安装时勾选 "Add python.exe to PATH"
    echo       https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo [OK] Python: %PYEXE% %PYARG%
"%PYEXE%" %PYARG% --version
echo.

REM ---- 2) 端口占用检查（只认 LISTENING，且必须先经用户确认）----
set "OLDPID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do set "OLDPID=%%P"
if defined OLDPID (
    set "OLDPROC=unknown"
    for /f "tokens=1 delims=," %%N in ('tasklist /FI "PID eq %OLDPID%" /FO CSV /NH 2^>nul') do set "OLDPROC=%%~N"
    echo.
    echo [WARN] 端口 %PORT% 已被占用：PID %OLDPID%  ^(%OLDPROC%^)
    choice /C YN /N /M "[?] 是否结束该进程并继续启动？[Y/N] "
    if errorlevel 2 (
        echo [INFO] 已取消启动。请先关闭占用 %PORT% 端口的程序，
        echo        或修改 API\.env 里的 GBZ_PORT 换一个端口。
        echo.
        pause
        exit /b 1
    )
    taskkill /PID %OLDPID% /F >nul 2>nul
    ping -n 2 127.0.0.1 >nul 2>nul
)

REM ---- 3) 依赖检查：缺失则自动安装（国内镜像加速）----
if exist requirements.txt (
    "%PYEXE%" %PYARG% -c "import fastapi, uvicorn, httpx, requests, PIL, pydantic, multipart" 2>nul
    if errorlevel 1 (
        echo [INFO] 首次运行，正在自动安装依赖（使用清华镜像加速，请稍候）...
        "%PYEXE%" %PYARG% -m pip install --disable-pip-version-check --timeout 60 -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
        if errorlevel 1 (
            echo [INFO] 镜像源安装失败，改用官方源重试...
            "%PYEXE%" %PYARG% -m pip install --disable-pip-version-check --timeout 60 -r requirements.txt
        )
        if errorlevel 1 (
            echo.
            echo [ERROR] 依赖安装失败，请检查网络后手动执行：
            echo         "%PYEXE%" %PYARG% -m pip install -r requirements.txt
            echo.
            pause
            exit /b 1
        )
        echo [OK] 依赖安装完成。
    ) else (
        echo [OK] 依赖检查通过。
    )
)

REM ---- 4) 计算局域网 IP ----
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

REM 3 秒后自动打开浏览器
start /b cmd /c "ping -n 4 127.0.0.1 >nul & start http://127.0.0.1:%PORT%/"

"%PYEXE%" %PYARG% main.py
echo.
echo 服务已停止。
pause
