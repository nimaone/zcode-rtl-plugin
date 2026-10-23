' ZCode RTL launcher — runs start-rtl.ps1 hidden (see that script for logic).
' Used by the "ZCode (RTL)" desktop shortcut.
Dim sh, here
Set sh = CreateObject("WScript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
' 0 = hidden window, False = don't wait
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & here & "start-rtl.ps1""", 0, False
