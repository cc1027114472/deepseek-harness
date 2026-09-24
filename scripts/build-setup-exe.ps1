# Build Mowan-Agent-Setup.exe installer
$ErrorActionPreference = "Stop"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "      Mowan Agent (魔丸) Windows Setup.exe Builder    " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

$root = $PSScriptRoot | Split-Path -Parent
Push-Location $root

# 1. Build launcher
Write-Host "`n[1/5] Building launcher..." -ForegroundColor Yellow
$env:GOCACHE = Join-Path $root ".gocache"
Push-Location "$root\launcher"
$env:GOOS = "windows"; $env:GOARCH = "amd64"
go build -ldflags="-H windowsgui -s -w" -o "$root\Mowan-Agent.exe" .
Pop-Location
Write-Host "✓ Launcher built: Mowan-Agent.exe" -ForegroundColor Green

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

# 4. Generate clean flat bundle, obfuscate proprietary code, and pack payload archive
Write-Host "`n[4/5] Generating hoisted flat bundle and packing archive..." -ForegroundColor Yellow
node "$root\scripts\bundle-flat.mjs"
node "$root\scripts\obfuscate-flat-bundle.mjs"

$distDir = "$root\dist"
$flatDir = "$distDir\flat-bundle"
$payloadZip = "$distDir\payload.zip"
if (Test-Path $payloadZip) { Remove-Item -Force $payloadZip }

Push-Location $flatDir
if (Get-Command 7z -ErrorAction SilentlyContinue) {
    & 7z a -tzip -mx=1 -mmt=on -bso0 -bsp0 $payloadZip .
} else {
    tar.exe -c -a -f $payloadZip *
}
Pop-Location

$zipSizeMB = [math]::Round((Get-Item $payloadZip).Length / 1MB, 2)
Write-Host "✓ Payload archive created: $payloadZip ($zipSizeMB MB)" -ForegroundColor Green

# 5. Assemble SFX Setup.exe
Write-Host "`n[5/5] Assembling standalone Mowan-Agent-Setup.exe..." -ForegroundColor Yellow
$setupExe = "$distDir\Mowan-Agent-Setup.exe"
if (Test-Path $setupExe) { Remove-Item -Force $setupExe }

cmd /c "copy /b `"$root\installer\installer-base.exe`" + `"$payloadZip`" `"$setupExe`"" | Out-Null
Remove-Item -Force $payloadZip

$desktop = [Environment]::GetFolderPath("Desktop")
Copy-Item $setupExe "$desktop\Mowan-Agent-Setup.exe" -Force
New-Item -ItemType Directory -Force -Path "$root\apps\web\dist" | Out-Null
Copy-Item $setupExe "$root\apps\web\dist\Mowan-Agent-Setup.exe" -Force

$setupSizeMB = [math]::Round((Get-Item $setupExe).Length / 1MB, 2)
Write-Host "`n======================================================" -ForegroundColor Green
Write-Host "🎉 Standalone Setup Installer Created Successfully!" -ForegroundColor Green
Write-Host "Output:  $setupExe" -ForegroundColor Green
Write-Host "Desktop: $desktop\Mowan-Agent-Setup.exe" -ForegroundColor Green
Write-Host "Size:    $setupSizeMB MB" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green

Pop-Location
