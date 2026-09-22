# Mowan Harness release packager script
# Builds launcher and prepares portable distribution folders

$ErrorActionPreference = "Stop"

Write-Host "=== Step 1: Building Go Launcher for Windows & macOS ===" -ForegroundColor Cyan
$env:GOCACHE = Join-Path $PSScriptRoot "..\.gocache"
Push-Location (Join-Path $PSScriptRoot "..\launcher")

$env:GOOS = "windows"; $env:GOARCH = "amd64"
go build -ldflags="-H windowsgui -s -w" -o Mowan-Harness.exe .
Write-Host "✓ Windows launcher built: launcher/Mowan-Harness.exe" -ForegroundColor Green

$env:GOOS = "darwin"; $env:GOARCH = "arm64"
go build -ldflags="-s -w" -o Mowan-Harness-darwin-arm64 .
Write-Host "✓ macOS arm64 launcher built: launcher/Mowan-Harness-darwin-arm64" -ForegroundColor Green

$env:GOOS = "darwin"; $env:GOARCH = "amd64"
go build -ldflags="-s -w" -o Mowan-Harness-darwin-amd64 .
Write-Host "✓ macOS amd64 launcher built: launcher/Mowan-Harness-darwin-amd64" -ForegroundColor Green

$env:GOOS = "windows"; $env:GOARCH = "amd64"
Pop-Location

Write-Host "`n=== Step 2: Preparing Portable Release Directories ===" -ForegroundColor Cyan
$distRoot = Join-Path $PSScriptRoot "..\dist"
$winDist = Join-Path $distRoot "Mowan-Harness-win-x64"
$macDist = Join-Path $distRoot "Mowan-Harness-mac"

New-Item -ItemType Directory -Force -Path $winDist | Out-Null
New-Item -ItemType Directory -Force -Path $macDist | Out-Null

Copy-Item (Join-Path $PSScriptRoot "..\launcher\Mowan-Harness.exe") (Join-Path $winDist "Mowan-Harness.exe") -Force
Copy-Item (Join-Path $PSScriptRoot "..\launcher\Mowan-Harness-darwin-arm64") (Join-Path $macDist "Mowan-Harness-arm64") -Force
Copy-Item (Join-Path $PSScriptRoot "..\launcher\Mowan-Harness-darwin-amd64") (Join-Path $macDist "Mowan-Harness-amd64") -Force

# Readme for end users
$winReadme = @"
======================================================
           Mowan Harness 桌面启动器使用指南
======================================================

1. 双击启动:
   双击运行 `Mowan-Harness.exe`。
   程序启动后会在系统托盘常驻图标，并自动在系统默认浏览器中打开控制台:
   http://127.0.0.1:3090 (默认端口 3090)

2. 系统托盘菜单功能 (右键托盘图标):
   - 打开 Web 控制台: 重新在浏览器中打开主界面
   - 复制公网访问地址: 自动获取 Cloudflare Tunnel 临时穿透地址（带 Token），方便发送到手机等设备
   - 重启本地服务: 重启 Harness 服务
   - 退出: 关闭服务并安全退出

3. 手机与外网访问:
   进入网页后，点击「设置」->「远程访问」，即可开启公网穿透并生成扫码配对二维码。
======================================================
"@
Set-Content -Path (Join-Path $winDist "使用说明.txt") -Value $winReadme -Encoding utf8
Set-Content -Path (Join-Path $macDist "使用说明.txt") -Value $winReadme -Encoding utf8

Write-Host "✓ Release packaging complete!" -ForegroundColor Green
Write-Host "Windows Release: $winDist"
Write-Host "macOS Release:   $macDist"
