@echo off
REM disable-rtl.cmd — turn the Persian RTL layer fully OFF (privacy default).
REM
REM Self-detaching (see enable-rtl.cmd): the visible call returns at once and
REM spawns the hidden chain, because closing the debug port requires a ZCode
REM restart and the agent lives inside ZCode.
REM
REM Chain: pause the RTL layer now (instant, if the port is open) -> wait 20s
REM -> restart ZCode WITHOUT the debug port.
if "%~1"=="--run" goto chain
start "" /min cmd /c ""%~f0" --run"
echo RTL hard-off scheduled: the layer pauses now and ZCode restarts once without the debug port in ~20s.
exit /b 0

:chain
node "%~dp0inject-rtl.mjs" --set off
timeout /t 20 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-zcode.ps1" -NoPort
