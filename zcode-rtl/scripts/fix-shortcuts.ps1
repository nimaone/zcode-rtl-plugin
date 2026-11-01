# One-shot launch-shortcut repair for the ZCode RTL plugin (v0.6.8).
# Adds --remote-debugging-port=9222 to EVERY ZCode shortcut on this machine
# (user + machine scope, desktop + Start Menu), so every launch path —
# desktop, Start Menu, taskbar search — opens the debug port from process
# start and no heartbeat restart is ever needed.
#
# Machine-scope locations (ProgramData, Public Desktop) require elevation:
#   powershell -NoProfile -ExecutionPolicy Bypass -File fix-shortcuts.ps1
# run from an ELEVATED shell (or via /rtl-fix shortcuts with the UAC prompt).
# User-scope locations are repaired from a normal shell too; machine-scope
# entries then report DENIED and are simply left for the next elevated run.
# App updates that rewrite the shortcuts are healed again automatically
# after the next heartbeat restart (restart-zcode.ps1 does the same repair,
# best-effort).
$ErrorActionPreference = "SilentlyContinue"
$port = 9222
$flag = "--remote-debugging-port=$port"
$sh = New-Object -ComObject WScript.Shell
$roots = @(
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
  "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
  "$env:USERPROFILE\Desktop",
  "$env:PUBLIC\Desktop"
)
$patched = 0
$denied = 0
foreach ($root in $roots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem -Path $root -Recurse -Filter "*.lnk" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "*zcode*" } |
    ForEach-Object {
      $l = $sh.CreateShortcut($_.FullName)
      if ($l.TargetPath -notmatch 'ZCode\.exe$') { return }  # not the app
      if ($l.Arguments -match 'remote-debugging-port') {
        Write-Host "ok      $($_.FullName)"
      } else {
        $l.Arguments = (($l.Arguments + " " + $flag).Trim())
        $l.Save()
        if ($?) {
          Write-Host "patched $($_.FullName)"
          $patched++
        } else {
          Write-Host "DENIED  $($_.FullName)  (needs an elevated shell)"
          $denied++
        }
      }
    }
}
Write-Host "Done. patched=$patched denied=$denied"
