$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = '魔丸 - Mowan Harness'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

if (-not $env:MOWAN_HOME) {
  $env:MOWAN_HOME = "$env:USERPROFILE\.mowan"
}

$log = Join-Path $PSScriptRoot 'start-web.last.log'
function Write-Log([string]$message) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Host $message
}

Set-Content -Path $log -Value '' -Encoding UTF8
Write-Log '魔丸 (Mowan) start/restart'
Write-Log ("Repo: {0}" -f $repo)

$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $node)) {
  $fromPath = Get-Command node -ErrorAction SilentlyContinue
  if ($fromPath) { $node = $fromPath.Source }
}
if (-not (Test-Path $node)) {
  Write-Log 'ERROR: node.exe not found. Install Node.js and try again.'
  Read-Host 'Press Enter to close'
  exit 1
}

$env:Path = @(
  'C:\Program Files\nodejs'
  "$env:APPDATA\npm"
  "$env:LOCALAPPDATA\pnpm"
  "$env:USERPROFILE\AppData\Roaming\npm"
  $env:Path
) -join ';'

Write-Log ("Node: {0}" -f $node)

function Get-PortPids([int]$port) {
  $pids = @()
  try {
    $listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
    if ($listen) {
      $pids += ($listen | Select-Object -ExpandProperty OwningProcess)
    }
  } catch {
    $lines = netstat -ano | Select-String (":{0}\s+.*LISTENING\s+(\d+)" -f $port)
    foreach ($line in $lines) {
      $pids += [int]$line.Matches[0].Groups[1].Value
    }
  }
  return ($pids | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
}

$pids = Get-PortPids 3090
if ($pids) {
  foreach ($procId in $pids) {
    Write-Log ("Stopping PID {0} on port 3090..." -f $procId)
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath "taskkill.exe" -ArgumentList "/F", "/T", "/PID", $procId -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
}

$left = Get-PortPids 3090
if ($left) {
  Write-Log 'ERROR: port 3090 is still in use.'
  Read-Host 'Press Enter to close'
  exit 1
}
Write-Log 'Port 3090 is free.'

$lanIps = @()
try {
  $adapters = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.InterfaceAlias -notmatch 'Loopback' -and
      $_.IPAddress -notlike '169.254*' -and
      $_.IPAddress -notlike '127.*'
    }
  $sorted = $adapters | Sort-Object {
    $alias = $_.InterfaceAlias.ToLower()
    $isVirtual = $alias -match 'vmware|virtual|vethernet|wsl|docker'
    if ($isVirtual) { 1 } else { 0 }
  }
  $lanIps = ($sorted | Select-Object -ExpandProperty IPAddress)
} catch {}
if (-not $lanIps) {
  try {
    $lanIps = (ipconfig | Select-String "IPv4.*:\s*([0-9.]+)" | ForEach-Object { $_.Matches.Groups[1].Value })
  } catch {}
}

if ($lanIps) {
  $lanMsg = ($lanIps | ForEach-Object { "http://{0}:3090" -f $_ }) -join ', '
  Write-Log ("Starting web UI at http://127.0.0.1:3090 (LAN: {0})" -f $lanMsg)
} else {
  Write-Log 'Starting web UI at http://127.0.0.1:3090'
}
Write-Log 'Close this window or press Ctrl+C to stop.'

Start-Process -WindowStyle Hidden powershell.exe -ArgumentList @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
  "Start-Sleep -Seconds 5; try { Invoke-WebRequest -Uri 'http://127.0.0.1:3090' -UseBasicParsing -TimeoutSec 3 | Out-Null; Start-Process 'http://127.0.0.1:3090' } catch {}"
) | Out-Null

try {
  & $node --import tsx/esm apps/cli/src/bin.ts web --host 0.0.0.0 --no-open
  $code = $LASTEXITCODE
} catch {
  Write-Log ("ERROR: {0}" -f $_.Exception.Message)
  $code = 1
}

if ($code -ne 0) {
  Write-Log ("Failed with exit code {0}" -f $code)
  if ([Environment]::UserInteractive) {
    try { Read-Host 'Press Enter to close' } catch {}
  }
}
exit $code
