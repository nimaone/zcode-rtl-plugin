---
description: Toggle or diagnose the Persian RTL layer in the ZCode chat UI (on/off live, always-on boot mode, status, eval, shortcut repair)
---

Control the Persian RTL layer of the ZCode Desktop chat UI.

**Since v0.5.0 the Plugin Management toggle is a LIVE master switch**: a
background heartbeat (spawned by the SessionStart hook, singleton) watches
`~/.zcode/cli/config.json` every ~3 s and applies/strips the RTL layer in the
running renderer when the user flips the plugin toggle. Toggling ON with the
debug port closed even restarts ZCode once invisibly (only while a ZCode
process exists). `/rtl-fix` remains for quick manual control and diagnostics.

Locate the plugin's scripts folder (the install cache is the reliable place):

```
~/.zcode/cli/plugins/cache/**/zcode-rtl/*/scripts
```

(Windows: `C:\Users\<you>\.zcode\cli\plugins\cache\...` — pick the highest
version folder.) All commands below use `<S>` = that scripts folder.
The injector talks to the ZCode renderer over the Chromium DevTools Protocol
on port 9222 (env `ZCODE_RTL_PORT` overrides). The debug port is read by
Electron only at process start, and the agent runs inside ZCode — therefore
**never run `restart-zcode.ps1` synchronously from a session** (it kills the
app and this session). Use the self-detaching cmd scripts, which schedule the
restart and return immediately.

User arguments: "$ARGUMENTS"

Pick the branch (default when arguments are empty or say "apply"/"fix" → **on**):

1. **`on`** — enable the RTL layer:
   - Run: `node "<S>/inject-rtl.mjs" --set on`
   - `RTL on: ... -> RTL_ENABLED` → done, no restart happened. Report success.
   - `PORT_CLOSED` → run: `wscript.exe "<S>/rtl-bg.vbs" enable` — fully
     invisible background chain: returns immediately, restarts ZCode once
     with the port (~20 s), then enables RTL automatically. Tell the user the
     app will blink once and RTL comes back on by itself. NEVER call
     `restart-zcode.ps1` synchronously from the session (it kills this app
     and the session with it) and never use `start`/`cmd /c start` (opens a
     visible console window).

2. **`off`** — pause the RTL layer instantly (port stays open):
   - Run: `node "<S>/inject-rtl.mjs" --set off`

3. **`off hard`** (or `default`) — full privacy default:
   - Run: `wscript.exe "<S>/rtl-bg.vbs" disable` — pauses the layer now and
     restarts ZCode without the debug port (~20 s, invisible background).

4. **`always-on`** (or `boot`) — make every future app start come up with RTL:
   - Patch the user's own Start Menu shortcut once:
     ```powershell
     $sh = New-Object -ComObject WScript.Shell
     $lnk = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\ZCode.lnk"
     $s = $sh.CreateShortcut($lnk)
     if ($s.Arguments -notlike '*remote-debugging-port*') { $s.Arguments = ($s.Arguments.Trim() + ' --remote-debugging-port=9222').Trim(); $s.Save() }
     ```
   - For the current session run `node "<S>/inject-rtl.mjs" --set on`; after
     that the SessionStart hook injects automatically at every app start.
     Machine-scope launch paths (taskbar search, desktop) should carry the
     flag too — run branch `shortcuts` once.
   - Undo later with `off hard`.

5. **`status`** — run `node "<S>/inject-rtl.mjs" --status` and also
   `--eval "window.__zcodeRtlProcess ? 'PAYLOAD_ACTIVE' : 'PAYLOAD_ABSENT'"`;
   report port state, targets, payload and `localStorage['zcodeRtl:enabled']`.

6. **`eval <js>`** — run `node "<S>/inject-rtl.mjs" --eval "<expression>"`
   and report the printed result. For DOM inspection after an app update, e.g.:
   `--eval "JSON.stringify([...document.querySelectorAll('[class*=message i]')].slice(0,5).map(e=>e.className))"`

7. **`shortcuts`** — repair the launch shortcuts so every app start (desktop,
   Start Menu, taskbar search) opens the debug port from process start and no
   heartbeat restart is needed:
   - Run: `powershell -NoProfile -ExecutionPolicy Bypass -File "<S>/fix-shortcuts.ps1"`
     From a normal shell the user-scope shortcuts are fixed; machine-scope
     ones (ProgramData, Public Desktop) report DENIED. For a full repair run
     it elevated and tell the user a UAC prompt will appear.
   - Report the ok/patched/DENIED lines. `restart-zcode.ps1` repeats this
     repair best-effort after every restart, so the elevated run is needed
     only once per machine (and again after an app update rewrites shortcuts).

Notes for the agent:
- If `--set on` reports the payload threw an exception, a ZCode update changed
  the DOM: read `assets/zcode-rtl-fix.js` next to the injector, fix the
  selectors (SKILL.md has the repair playbook + 3.16.x DOM map), retry.
- Reply in the user's language (often Persian).
