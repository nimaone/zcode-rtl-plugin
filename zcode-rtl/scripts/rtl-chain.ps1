# Background enable/disable chain for the ZCode RTL layer.
# Always launched hidden via rtl-bg.vbs (wscript) — never from a visible
# console, and never synchronously from an agent session: enabling may
# restart ZCode, and the agent lives inside ZCode.
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('enable', 'disable')]
  [string]$Mode
)
$ErrorActionPreference = "SilentlyContinue"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 9222

function Test-Port([int]$p) {
  $c = New-Object Net.Sockets.TcpClient
  $ok = $c.ConnectAsync("127.0.0.1", $p).Wait(500)
  $c.Close()
  return [bool]$ok
}

if ($Mode -eq 'enable') {
  Start-Sleep -Seconds 20   # let the agent deliver its reply first
  if (-not (Test-Port $port)) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'restart-zcode.ps1')
    for ($i = 0; $i -lt 45; $i++) {
      Start-Sleep -Seconds 1
      if (Test-Port $port) { break }
    }
    Start-Sleep -Seconds 5   # let the renderer settle
  }
  & node (Join-Path $dir 'inject-rtl.mjs') --set on
} else {
  # pause the layer now (instant if the port is open), then restart
  # ZCode once WITHOUT the port — the full privacy default.
  & node (Join-Path $dir 'inject-rtl.mjs') --set off
  Start-Sleep -Seconds 20
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'restart-zcode.ps1') -NoPort
}
