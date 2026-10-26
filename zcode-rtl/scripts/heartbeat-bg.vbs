' Spawns the RTL heartbeat daemon fully detached and invisible.
' wscript is a GUI-subsystem process: the daemon escapes any console job
' object (Git Bash kills node children spawned inside its own tree).
' Usage: wscript.exe heartbeat-bg.vbs [workspace-path]
Dim sh, dir, arg
Set sh = CreateObject("WScript.Shell")
dir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
arg = ""
If WScript.Arguments.Count > 0 Then arg = " --workspace """ & WScript.Arguments(0) & """"
sh.Run "node """ & dir & "heartbeat.mjs"" --daemon" & arg, 0, False
