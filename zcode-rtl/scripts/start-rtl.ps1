# ZCode RTL smart launcher (Windows).
# - Kills any stale RTL watcher (prevents duplicate injectors).
# - If ZCode is already running WITHOUT the debug port: restarts it with the
#   port open. (Electron is single-instance: launching a second copy with the
#   flag while one is alive just forwards to it and exits, so the port would
#   never open.)
# - If ZCode already runs WITH the port: keeps the app, only (re)starts the
#   watcher.
# Run hidden via rtl-launcher.vbs / the "ZCode (RTL)" desktop shortcut.
param(
  # Auto-detected below; override here if ZCode.exe lives somewhere unusual.
  [string]$ZCodeExe = ""
)
$ErrorActionPreference = "SilentlyContinue"

$port = 9222

if (-not $ZCodeExe) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\zcode\ZCode.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\ZCode\ZCode.exe"),
    "C:\Program Files\zcode\ZCode.exe",
    "C:\Program Files\ZCode\ZCode.exe",
    "D:\app\zcode\ZCode.exe",
    "J:\app\zcode\ZCode.exe"
  )
  # Also ask every Start Menu shortcut where the real exe lives.
  $sh = New-Object -ComObject WScript.Shell
  $roots = @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
             "$env:ProgramData\Microsoft\Windows\Start Menu\Programs")
  foreach ($root in $roots) {
    Get-ChildItem -Path $root -Recurse -Filter "*.lnk" -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like "*zcode*" } |
      ForEach-Object { $candidates += $sh.CreateShortcut($_.FullName).TargetPath }
  }
  $ZCodeExe = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $ZCodeExe -or -not (Test-Path $ZCodeExe)) {
  Write-Host "ZCode.exe not found. Run this script with -ZCodeExe, e.g.:"
  Write-Host '  powershell -File start-rtl.ps1 -ZCodeExe "C:\path\to\ZCode.exe"'
  exit 1
}

function Test-Port([int]$p) {
  $c = New-Object Net.Sockets.TcpClient
  $ok = $c.ConnectAsync("127.0.0.1", $p).Wait(500)
  $c.Close()
  return [bool]$ok
}

# 1. Stop stale watchers (keep unrelated node processes untouched).
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -like "*inject-rtl.mjs*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# 2. Ensure the app runs WITH the debug port.
$running = [bool](Get-Process ZCode -ErrorAction SilentlyContinue)
if ($running -and -not (Test-Port $port)) {
  # Graceful close first; force after a grace period (tray apps ignore WM_CLOSE).
  taskkill /IM ZCode.exe | Out-Null
  Start-Sleep -Seconds 3
  if (Get-Process ZCode -ErrorAction SilentlyContinue) {
    taskkill /F /IM ZCode.exe | Out-Null
    Start-Sleep -Seconds 2
  }
  $running = $false
}
if (-not $running -and -not (Test-Port $port)) {
  Start-Process -FilePath $ZCodeExe -ArgumentList "--remote-debugging-port=$port"
  # Wait up to 15 s for the renderer to come up.
  for ($i = 0; $i -lt 15 -and -not (Test-Port $port); $i++) { Start-Sleep -Seconds 1 }
}

# 3. Hidden watcher: injects into new/reloaded renderers for as long as it lives.
Start-Process -WindowStyle Hidden -FilePath "node" `
  -ArgumentList ('"' + (Join-Path $PSScriptRoot "inject-rtl.mjs") + '" --watch')
