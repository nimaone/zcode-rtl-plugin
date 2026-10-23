# Creates the "ZCode (RTL)" desktop shortcut. Run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File make-shortcut.ps1
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$lnkPath   = Join-Path ([Environment]::GetFolderPath("Desktop")) "ZCode (RTL).lnk"
$sh        = New-Object -ComObject WScript.Shell
$lnk       = $sh.CreateShortcut($lnkPath)
$lnk.TargetPath       = "wscript.exe"
$lnk.Arguments        = '"' + (Join-Path $scriptDir "rtl-launcher.vbs") + '"'
$lnk.WorkingDirectory = $scriptDir
$lnk.Description      = "ZCode with the Persian RTL fix (debug port + auto-injector)"
$lnk.Save()
Write-Host "Created: $lnkPath"
