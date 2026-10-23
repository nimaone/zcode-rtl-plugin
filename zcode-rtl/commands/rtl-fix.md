---
description: Re-apply or diagnose the Persian RTL fix in the ZCode chat UI (inject via CDP)
---

Apply the Persian RTL fix to the ZCode Desktop chat UI, or diagnose it.

The injector ships inside this plugin. Locate the script first (the plugin
install cache is the reliable place):

```
~/.zcode/cli/plugins/cache/**/zcode-rtl/*/scripts/inject-rtl.mjs
```

On Windows that resolves to `C:\Users\<you>\.zcode\cli\plugins\cache\...`.
Pick the highest version folder. It requires ZCode to be running with
`--remote-debugging-port=9222`, which the "ZCode (RTL)" launcher shortcut
provides (see the plugin README). Override the port with env `ZCODE_RTL_PORT`.

User arguments: "$ARGUMENTS"

Steps:

1. If the arguments mention `status`, run:
   `node "<plugin>/scripts/inject-rtl.mjs" --status`
   and report whether the debug port is open and which page targets exist. Stop there.

2. If the arguments contain `eval` followed by a JS expression, run the script with
   `--eval "<expression>"` and report the printed result. Useful for inspecting the
   live DOM (class names) after a ZCode update changed the markup, e.g.:
   `--eval "JSON.stringify([...document.querySelectorAll('[class*=message i]')].slice(0,5).map(e=>e.className))"`

3. Otherwise (default, including "apply"/"fix"): run the injector one-shot:
   `node "<plugin>/scripts/inject-rtl.mjs" --verbose`

   - If it reports `RTL injected: ...`, the fix is now live in the chat transcript.
     Ask the user to confirm Persian messages render right-aligned RTL.
   - If it reports the debug port is not reachable, tell the user to fully quit
     ZCode and relaunch it via the "ZCode (RTL)" desktop shortcut (or run the
     plugin's `scripts/start-rtl.ps1`), then retry this command.
   - If it reports the payload threw an exception, the app update changed the DOM:
     read `assets/zcode-rtl-fix.js` in the same plugin folder, fix the selectors/logic
     (see the SKILL.md "After a ZCode update breaks the layout" section),
     and re-run the injector.

Reply in the user's language (often Persian).
