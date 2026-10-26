' Spawns the RTL heartbeat daemon fully detached and invisible.
' wscript is a GUI-subsystem process: the daemon escapes any console job
' object (Git Bash kills node children spawned inside its own tree).
Dim sh, dir
Set sh = CreateObject("WScript.Shell")
dir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.Run "node """ & dir & "heartbeat.mjs"" --daemon", 0, False
