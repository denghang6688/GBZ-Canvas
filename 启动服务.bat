@echo off
chcp 65001 >nul
REM ============================================
REM   启动服务.bat —— 兼容旧入口，实际逻辑统一在 start.bat
REM ============================================
cd /d "%~dp0"

if exist "%~dp0start.bat" (
    call "%~dp0start.bat" %*
) else (
    echo [ERROR] 找不到 start.bat，无法启动。
    pause
    exit /b 1
)
