@echo off
title 魔丸 - Mowan Harness
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-or-restart-web.ps1"
if errorlevel 1 pause
exit /b %ERRORLEVEL%
