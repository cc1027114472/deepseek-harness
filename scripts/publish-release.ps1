<#
.SYNOPSIS
    魔丸 (Mowan Agent) 生产版本一键发布脚本
.DESCRIPTION
    1. 递增并同步版本号
    2. 执行生产打包 (build-setup-exe.ps1) 生成全量安装包
    3. 计算安装包 SHA-256 与文件大小
    4. 同步至 sub2api 官方主站 downloads 目录及配置常量
    5. 创建 GitHub Release (wensheng-ai/mowan-agent-releases) 并上传安装包
    6. 生成并推送云端 releases/latest.json
    7. 直传部署 ukapi.cc 生产服务器 (/var/www/sub2api-downloads/)
.EXAMPLE
    .\scripts\publish-release.ps1 -Version "2.0.2" -Changelog "✨ 新增特性A;🚀 优化性能B"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [string]$Changelog = "Performance improvements;Bug fixes",

    [Parameter(Mandatory = $false)]
    [string]$Repo = "wensheng-ai/mowan-agent-releases",

    [Parameter(Mandatory = $false)]
    [switch]$SkipBuild = $false,

    [Parameter(Mandatory = $false)]
    [switch]$SkipServer = $false,

    [Parameter(Mandatory = $false)]
    [switch]$Mandatory = $false
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$DistDir = Join-Path $RootDir "dist"

$CleanVersion = $Version.TrimStart('v').Trim()
$Tag = "v$CleanVersion"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  魔丸 (Mowan Agent) 正在启动 $Tag 自动化发布流程..." -ForegroundColor Cyan
Write-Host "  发布仓库: $Repo" -ForegroundColor Gray
Write-Host "=====================================================" -ForegroundColor Cyan

# Step 1: 同步版本号到 updater.ts
Write-Host "`n[1/7] 正在同步源码版本号为 $CleanVersion..." -ForegroundColor Yellow
$UpdaterFile = Join-Path $RootDir "packages\client\connection\src\updater.ts"
if (Test-Path $UpdaterFile) {
    $content = Get-Content $UpdaterFile -Raw -Encoding UTF8
    $content = $content -replace "export const CURRENT_VERSION = '[^']+'", "export const CURRENT_VERSION = '$CleanVersion'"
    Set-Content -Path $UpdaterFile -Value $content -Encoding UTF8
    Write-Host "  -> 已更新 packages\client\connection\src\updater.ts 中的 CURRENT_VERSION" -ForegroundColor Green
}

# Step 2: 执行构建打包
if (-not $SkipBuild) {
    Write-Host "`n[2/7] 正在执行构建与安装包生成 (build-setup-exe.ps1)..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $ScriptDir "build-setup-exe.ps1")
} else {
    Write-Host "`n[2/7] 已跳过构建 (-SkipBuild)" -ForegroundColor DarkGray
}

$SetupExe = Join-Path $DistDir "Mowan-Agent-Setup.exe"
if (-not (Test-Path $SetupExe)) {
    throw "未找到安装包产物: $SetupExe ，请先执行构建。"
}

$VersionedExe = Join-Path $DistDir "Mowan-Agent-Setup-$CleanVersion.exe"
$LatestExe = Join-Path $DistDir "Mowan-Agent-Setup-latest.exe"
Copy-Item -Path $SetupExe -Destination $VersionedExe -Force
Copy-Item -Path $SetupExe -Destination $LatestExe -Force

# Step 3: 计算 SHA-256 与文件大小
Write-Host "`n[3/7] 正在计算安装包 SHA-256 与字节大小..." -ForegroundColor Yellow
$HashInfo = Get-FileHash -Path $VersionedExe -Algorithm SHA256
$Sha256 = $HashInfo.Hash.ToLower()
$FileSize = (Get-Item $VersionedExe).Length
$SizeMB = [math]::Round($FileSize / (1024 * 1024), 1)
Write-Host "  -> 文件大小: $FileSize 字节 ($SizeMB MB)" -ForegroundColor Gray
Write-Host "  -> SHA-256 : $Sha256" -ForegroundColor Gray

# Step 4: 同步至 sub2api 项目
$Sub2apiDir = "D:\GOWorks\fanzhongli\sub2api"
$Sub2apiDownloads = Join-Path $Sub2apiDir "frontend\public\downloads"
$Sub2apiConst = Join-Path $Sub2apiDir "frontend\src\constants\agentDownload.ts"

if (Test-Path $Sub2apiDir) {
    Write-Host "`n[4/7] 正在同步分发产物至 sub2api 官方主站目录..." -ForegroundColor Yellow
    if (-not (Test-Path $Sub2apiDownloads)) {
        New-Item -ItemType Directory -Force -Path $Sub2apiDownloads | Out-Null
    }
    Copy-Item $VersionedExe (Join-Path $Sub2apiDownloads "Mowan-Agent-Setup-latest.exe") -Force
    Copy-Item $VersionedExe (Join-Path $Sub2apiDownloads "Mowan-Agent-Setup-$CleanVersion.exe") -Force
    Copy-Item $VersionedExe (Join-Path $Sub2apiDownloads "Mowan-Harness-Setup.exe") -Force
    Copy-Item $VersionedExe (Join-Path $Sub2apiDownloads "Mowan-Agent-Setup.exe") -Force

    $ChangelogItems = @()
    foreach ($item in $Changelog.Split(';')) {
        $trimmed = $item.Trim()
        if ($trimmed) { $ChangelogItems += $trimmed }
    }

    $Sub2apiManifest = [ordered]@{
        version              = $CleanVersion
        releaseDate          = (Get-Date -Format "yyyy-MM-dd")
        minSupportedVersion  = "1.0.0"
        mandatory            = [bool]$Mandatory
        downloadUrl          = "https://ukapi.cc/downloads/Mowan-Agent-Setup-$CleanVersion.exe"
        backupDownloadUrl    = "https://github.com/$Repo/releases/download/$Tag/Mowan-Agent-Setup-$CleanVersion.exe"
        sha256               = $Sha256
        fileSize             = $FileSize
        changelog            = $ChangelogItems
    }
    $Sub2apiJson = $Sub2apiManifest | ConvertTo-Json -Depth 5
    Set-Content -Path (Join-Path $Sub2apiDownloads "latest.json") -Value $Sub2apiJson -Encoding UTF8

    if (Test-Path $Sub2apiConst) {
        $c = Get-Content $Sub2apiConst -Raw -Encoding UTF8
        $c = $c -replace "version: 'v[^']+'", "version: '$Tag'"
        $c = $c -replace "sha256: '[^']*'", "sha256: '$Sha256'"
        $c = $c -replace "size: '[^']+'", "size: '$SizeMB MB'"
        $c = $c -replace "releaseDate: '\d{4}-\d{2}-\d{2}'", "releaseDate: '$(Get-Date -Format "yyyy-MM-dd")'"
        Set-Content -Path $Sub2apiConst -Value $c -Encoding UTF8
        Write-Host "  -> sub2api 前端下载配置已同步为 $Tag" -ForegroundColor Green
    }
    Write-Host "  -> 已同步部署至 $Sub2apiDownloads" -ForegroundColor Green
}

# Step 5: 创建 GitHub Release 并上传资产
Write-Host "`n[5/7] 正在向 GitHub ($Repo) 发布 Release $Tag..." -ForegroundColor Yellow
$ReleaseNotes = ($ChangelogItems | ForEach-Object { "- $_" }) -join "`n"

$existingRelease = gh release view $Tag --repo $Repo 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  -> Release $Tag 已存在，正在覆盖上传最新安装包..." -ForegroundColor Gray
    gh release upload $Tag $VersionedExe $LatestExe --repo $Repo --clobber
} else {
    gh release create $Tag $VersionedExe $LatestExe --repo $Repo --title "魔丸 (Mowan Agent) $Tag" --notes $ReleaseNotes
}

$DownloadUrl = "https://github.com/$Repo/releases/download/$Tag/Mowan-Agent-Setup-$CleanVersion.exe"

# Step 6: 推送 releases/latest.json 到 GitHub
Write-Host "`n[6/7] 正在更新云端版本清单 releases/latest.json..." -ForegroundColor Yellow
$TmpRepo = Join-Path $env:TEMP "mowan-release-sync"
if (Test-Path $TmpRepo) { Remove-Item -Recurse -Force $TmpRepo }
git clone "https://github.com/$Repo.git" $TmpRepo

$ManifestObj = [ordered]@{
    version              = $CleanVersion
    releaseDate          = (Get-Date -Format "yyyy-MM-dd")
    minSupportedVersion  = "1.0.0"
    mandatory            = [bool]$Mandatory
    downloadUrl          = "https://ukapi.cc/downloads/Mowan-Agent-Setup-latest.exe"
    backupDownloadUrl    = $DownloadUrl
    sha256               = $Sha256
    fileSize             = $FileSize
    changelog            = $ChangelogItems
}

$ManifestJson = $ManifestObj | ConvertTo-Json -Depth 5
$ManifestPath = Join-Path $TmpRepo "releases\latest.json"
Set-Content -Path $ManifestPath -Value $ManifestJson -Encoding UTF8

Push-Location $TmpRepo
git add releases/latest.json
git commit -m "release: update latest.json to $Tag"
git push origin main
Pop-Location

# Step 7: 直传部署生产服务器 (ukapi.cc)
if (-not $SkipServer) {
    $uploadScript = Join-Path $ScriptDir "upload-to-server.py"
    if (Test-Path $uploadScript) {
        Write-Host "`n[7/7] 正在通过 SFTP 自动部署安装包与清单至 ukapi.cc 生产服务器..." -ForegroundColor Yellow
        python $uploadScript $CleanVersion
    }
} else {
    Write-Host "`n[7/7] 已跳过服务器直传 (-SkipServer)" -ForegroundColor DarkGray
}

Write-Host "`n=====================================================" -ForegroundColor Green
Write-Host "  ✅ 魔丸 (Mowan Agent) $Tag 发布成功！" -ForegroundColor Green
Write-Host "  🚀 主站极速直链: https://ukapi.cc/downloads/Mowan-Agent-Setup-latest.exe" -ForegroundColor Green
Write-Host "  📦 GitHub 下载 : $DownloadUrl" -ForegroundColor Green
Write-Host "  🔗 主站清单    : https://ukapi.cc/downloads/latest.json" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
