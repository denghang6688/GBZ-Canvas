@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set PY=
if exist "%~dp0python\python.exe" set PY="%~dp0python\python.exe"
if "%PY%"=="" where python >nul 2>nul && set PY=python
if "%PY%"=="" where py >nul 2>nul && set PY=py
if "%PY%"=="" (
  echo [ERROR] Python not found. Please install Python 3.10+ or run with the bundled runtime.
  pause
  exit /b 1
)

echo ============================================
echo   GBZ Canvas - Publish New Release
echo ============================================
echo.
%PY% "%~dp0tools\publish_release.py" %*
echo.
pause
