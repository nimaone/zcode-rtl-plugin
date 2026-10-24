---
description: Re-apply or diagnose the Persian RTL fix in the ZCode chat UI (inject via CDP)
---

Apply the Persian RTL fix to the ZCode Desktop chat UI, or diagnose it.

The injector script lives at `C:\Users\nima\ZCodeProject\plugins\zcode-rtl\scripts\inject-rtl.mjs`
(the plugin's stable source copy; `${CLAUDE_PLUGIN_ROOT}` is not expanded in commands).
It requires ZCode to be running with `--remote-debugging-port=9222`, which the
normal Start Menu shortcut already carries. Override the port with env `ZCODE_RTL_PORT`.

User arguments: "$ARGUMENTS"

Steps:

1. If the arguments mention `status`, run:
   `node "C:/Users/nima/ZCodeProject/plugins/zcode-rtl/scripts/inject-rtl.mjs" --status`
   and report whether the debug port is open and which page targets exist. Stop there.

2. If the arguments contain `eval` followed by a JS expression, run the script with
   `--eval "<expression>"` and report the printed result. Useful for inspecting the
   live DOM (class names) after a ZCode update changed the markup, e.g.:
   `--eval "JSON.stringify([...document.querySelectorAll('[class*=message i]')].slice(0,5).map(e=>e.className))"`

3. Otherwise (default, including "apply"/"fix"): run the injector one-shot:
   `node "C:/Users/nima/ZCodeProject/plugins/zcode-rtl/scripts/inject-rtl.mjs" --verbose`

   - If it reports `RTL injected: ...`, the fix is now live in the chat transcript.
     Ask the user to confirm Persian messages render right-aligned RTL.
   - If it reports the debug port is not reachable, tell the user to fully quit
     ZCode (tray icon → Quit) and relaunch it from the normal shortcut — Electron
     is single-instance, so a second launch cannot add the flag to the running
     copy. Then retry this command.
   - If it reports the payload threw an exception, the app update changed the DOM:
     read `assets/zcode-rtl-fix.js` in the plugin source, fix the selectors/logic,
     increment the version comment, and re-run the injector.

Reply in the user's language (usually Persian).
