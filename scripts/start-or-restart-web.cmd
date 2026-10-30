@echo off
title DeepSeek Harness
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-or-restart-web.ps1"
if errorlevel 1 pause
exit /b %ERRORLEVEL%
