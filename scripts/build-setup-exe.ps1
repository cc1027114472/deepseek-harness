# Build Mowan-Harness-Setup.exe installer
$ErrorActionPreference = "Stop"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "      Mowan Harness Windows Setup.exe Builder         " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

$root = $PSScriptRoot | Split-Path -Parent
Push-Location $root

# 1. Build launcher
Write-Host "`n[1/5] Building launcher..." -ForegroundColor Yellow
$env:GOCACHE = Join-Path $root ".gocache"
Push-Location "$root\launcher"
$env:GOOS = "windows"; $env:GOARCH = "amd64"
go build -ldflags="-H windowsgui -s -w" -o "$root\Mowan-Harness.exe" .
Pop-Location
Write-Host "✓ Launcher built: Mowan-Harness.exe" -ForegroundColor Green

# 2. Prepare embedded node runtime
Write-Host "`n[2/5] Preparing embedded Node.js runtime..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$root\runtime" | Out-Null
$sysNode = (Get-Command node).Source
Copy-Item $sysNode "$root\runtime\node.exe" -Force
Write-Host "✓ Embedded runtime ready: runtime\node.exe" -ForegroundColor Green

# 3. Build installer base shell
Write-Host "`n[3/5] Compiling native Win32 installer..." -ForegroundColor Yellow
Push-Location "$root\installer"
go build -ldflags="-H windowsgui -s -w" -o "$root\installer\installer-base.exe" .
Pop-Location
Write-Host "✓ Installer shell built: installer\installer-base.exe" -ForegroundColor Green

# 4. Pack payload archive
Write-Host "`n[4/5] Packing full self-contained payload archive (tar.exe)..." -ForegroundColor Yellow
$distDir = "$root\dist"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$payloadZip = "$distDir\payload.zip"
if (Test-Path $payloadZip) { Remove-Item -Force $payloadZip }

# Compress necessary runtime files
tar.exe -c -a -f $payloadZip `
    --exclude=".git*" `
    --exclude=".gocache*" `
    --exclude="dist*" `
    --exclude="installer*" `
    --exclude="launcher*" `
    --exclude="tests*" `
    --exclude="packages/*/*/node_modules*" `
    --exclude="packages/*/*/src*" `
    --exclude="packages/*/*/tests*" `
    --exclude="apps/*/node_modules*" `
    --exclude="vendor/*/node_modules*" `
    --exclude="native/*/*/node_modules*" `
    --exclude="*.ts" `
    --exclude="*.map" `
    --exclude="*.log" `
    Mowan-Harness.exe runtime apps packages vendor node_modules package.json pnpm-workspace.yaml

$zipSizeMB = [math]::Round((Get-Item $payloadZip).Length / 1MB, 2)
Write-Host "✓ Payload archive created: $payloadZip ($zipSizeMB MB)" -ForegroundColor Green

# 5. Assemble SFX Setup.exe
Write-Host "`n[5/5] Assembling standalone Mowan-Harness-Setup.exe..." -ForegroundColor Yellow
$setupExe = "$distDir\Mowan-Harness-Setup.exe"
if (Test-Path $setupExe) { Remove-Item -Force $setupExe }

cmd /c "copy /b `"$root\installer\installer-base.exe`" + `"$payloadZip`" `"$setupExe`"" | Out-Null
Remove-Item -Force $payloadZip

$setupSizeMB = [math]::Round((Get-Item $setupExe).Length / 1MB, 2)
Write-Host "`n======================================================" -ForegroundColor Green
Write-Host "🎉 Standalone Setup Installer Created Successfully!" -ForegroundColor Green
Write-Host "Output: $setupExe" -ForegroundColor Green
Write-Host "Size:   $setupSizeMB MB" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green

Pop-Location
