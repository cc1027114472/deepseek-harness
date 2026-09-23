@echo off
title 魔丸 (Mowan) Restart
chcp 65001 >nul
echo ====================================================
echo 正在停止占用 3090 端口的旧服务...
echo ====================================================
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3090 ^| findstr LISTENING') do (
    echo 正在关闭进程 PID: %%a
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo.
echo ====================================================
echo 正在启动 魔丸 (Mowan) Harness (已启用局域网支持)...
echo 本机地址:   http://127.0.0.1:3090
echo 局域网地址: http://192.168.1.104:3090
echo ====================================================
echo.
cd /d "%~dp0"
call scripts\start-or-restart-web.cmd
