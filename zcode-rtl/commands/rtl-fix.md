---
description: Toggle or diagnose the Persian RTL layer in the ZCode chat UI (on/off live, status, eval)
---

Control the Persian RTL layer of the ZCode Desktop chat UI.

Locate the injector inside this plugin's install cache:

```
~/.zcode/cli/plugins/cache/**/zcode-rtl/*/scripts/inject-rtl.mjs
```

(Windows: `C:\Users\<you>\.zcode\cli\plugins\cache\...` — pick the highest version folder.)
It talks to the ZCode renderer over the Chromium DevTools Protocol on port 9222
(env `ZCODE_RTL_PORT` overrides). The debug port is **off by default**; the RTL
layer can be toggled live whenever the port is open.

User arguments: "$ARGUMENTS"

Semantics (pick by the arguments; default when empty or "apply"/"fix" is **on**):

1. **`on`** — enable the RTL layer:
   - Run: `node "<plugin>/scripts/inject-rtl.mjs" --set on`
   - If it prints `RTL on: ... -> RTL_ENABLED`, done — Persian is RTL now. No restart happened.
   - If it prints `PORT_CLOSED`, the debug server is off (the privacy default).
     Start it with ONE app restart, then re-run `--set on`:
     `powershell -NoProfile -ExecutionPolicy Bypass -File "<plugin>/scripts/restart-zcode.ps1"`
     (gracefully closes and relaunches ZCode with `--remote-debugging-port=9222`;
     the session is restored). After it comes back, re-run `--set on` or wait for
     the SessionStart hook of the next session.

2. **`off`** — disable the RTL layer instantly (no app restart):
   - Run: `node "<plugin>/scripts/inject-rtl.mjs" --set off`
   - The renderer reloads clean with nothing injected. The debug port stays open.

3. **`off hard`** — also close the debug server (back to the full privacy default):
   - Run `--set off` first, then:
     `powershell -NoProfile -ExecutionPolicy Bypass -File "<plugin>/scripts/restart-zcode.ps1" -NoPort`

4. **`status`** — run with `--status` and report: port open/closed, page targets.

5. **`eval <js>`** — run with `--eval "<expression>"` and report the printed result.
   Useful after a ZCode update changed the DOM, e.g.:
   `--eval "JSON.stringify([...document.querySelectorAll('[class*=message i]')].slice(0,5).map(e=>e.className))"`
   `--eval "window.__zcodeRtlProcess ? 'PAYLOAD_ACTIVE' : 'PAYLOAD_ABSENT'"`

Notes for the agent:
- The default bare `/rtl-fix` means **on** (step 1).
- If the payload threw an exception during `--set on`, the app update changed the
  DOM: read `assets/zcode-rtl-fix.js` in the same plugin folder, fix the
  selectors/logic (SKILL.md has the repair playbook and a 3.16.x DOM map), then retry.
- Reply in the user's language (often Persian).
