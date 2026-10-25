@echo off
REM enable-rtl.cmd — turn the Persian RTL layer ON, reliably.
REM
REM Self-detaching: the first (agent-visible) call returns immediately and
REM spawns a hidden chain, because the chain RESTARTS ZCode — and the agent
REM runs inside ZCode, so a synchronous restart would kill the session
REM mid-command. Never run restart-zcode.ps1 directly from an agent session.
REM
REM Chain: wait 20s (let the agent reply) -> graceful restart WITH the debug
REM port -> poll up to 45s for the port -> inject + enable the RTL layer.
if "%~1"=="--run" goto chain
start "" /min cmd /c ""%~f0" --run"
echo RTL enable scheduled: ZCode will restart once in ~20s and the RTL layer will turn on automatically.
exit /b 0

:chain
timeout /t 20 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-zcode.ps1"
for /L %%i in (1,1,45) do (
  timeout /t 1 /nobreak >nul
  curl -s --max-time 1 http://127.0.0.1:9222/json/version >nul 2>&1 && goto portup
)
exit /b 1
:portup
timeout /t 5 /nobreak >nul
node "%~dp0inject-rtl.mjs" --set on
