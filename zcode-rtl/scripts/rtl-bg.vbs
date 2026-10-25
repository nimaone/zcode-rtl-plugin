' Fully invisible background runner — wscript is GUI-subsystem, so nothing
' flashes: the PowerShell chain starts with window style 0 (hidden).
' Usage: wscript.exe rtl-bg.vbs enable|disable|restart
Dim sh, dir, mode
Set sh = CreateObject("WScript.Shell")
dir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
mode = WScript.Arguments(0)
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & dir & "rtl-chain.ps1"" -Mode " & mode, 0, False
