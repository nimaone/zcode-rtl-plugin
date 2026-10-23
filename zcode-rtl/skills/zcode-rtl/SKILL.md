---
name: zcode-rtl
description: Use when the Persian/RTL layout of the ZCode chat UI is broken or stopped applying after a ZCode app update, when Persian messages render left-aligned or direction flips wrongly, or when asked to re-apply, install, or diagnose the ZCode RTL fix. Covers the CDP injector, the launcher shortcut, and updating the payload selectors after app updates.
---

# ZCode RTL fix (plugin edition)

The ZCode Desktop chat UI has no built-in RTL support and the plugin system
cannot restyle the host UI. This plugin ships the direction fix
(`assets/zcode-rtl-fix.js`) and injects it into the running app through the
Chromium DevTools Protocol (CDP). **No app file is modified**, so ZCode
updates never break the installation — worst case the DOM markup changes and
the payload's selectors need a tweak.

The plugin's own install cache is the canonical runtime location:

```
~/.zcode/cli/plugins/cache/**/zcode-rtl/<version>/scripts/inject-rtl.mjs
```

## Architecture

- `assets/zcode-rtl-fix.js` — the payload: Persian text → RTL right-aligned,
  Latin/code → LTR, fully-RTL tables, user bubble pinned right, sidebar and
  tool-block chrome untouched, Persian prose inside tool bodies still RTL,
  MutationObserver self-heals during streaming. Idempotent.
- `scripts/inject-rtl.mjs` — zero-dependency CDP client (Node ≥ 22).
  - default: one-shot inject into every page target
  - `--watch`: keep running, inject into new targets, survive renderer reloads
  - `--status`: port + target report
  - `--eval "<expr>"`: run JS in the page and print the result (diagnostics)
  - env `ZCODE_RTL_PORT` (default 9222)
- `hooks/hooks.json` — SessionStart hook runs the injector at every session start.
- `scripts/start-rtl.ps1` + `scripts/rtl-launcher.vbs` + `make-shortcut.ps1`
  (Windows) — create a "ZCode (RTL)" shortcut that starts ZCode with
  `--remote-debugging-port=9222` and the hidden `--watch` injector.

## Routine operations

Re-apply after the app was started normally:

```bash
node "<plugin>/scripts/inject-rtl.mjs" --verbose
```

Check state: add `--status`. Inspect live DOM after an update changed markup:

```bash
node "<plugin>/scripts/inject-rtl.mjs" --eval "document.querySelector('[class*=message i]')?.className"
node "<plugin>/scripts/inject-rtl.mjs" --eval "window.__zcodeRtlProcess ? 'PAYLOAD_ACTIVE' : 'PAYLOAD_ABSENT'"
```

## After a ZCode update breaks the layout

1. `--status` → port open? If not, the user must relaunch via the RTL shortcut
   or `start-rtl.ps1`.
2. `--eval "window.__zcodeRtlProcess ? 'ACTIVE' : 'ABSENT'"` → payload alive?
3. If active but visuals are wrong, the update changed class names/markup.
   Dump representative class names with `--eval`, then update the selectors
   (`MSG_SEL`, `USER_ROW`, `ASST_ROW`, `EXCLUDE_SEL`, `TOOL_ZONE`) in
   `assets/zcode-rtl-fix.js` and re-inject. The in-page diagnostic `diag()`
   logs remaining Persian-but-LTR blocks to the renderer console.
4. Bump `version` in `.zcode-plugin/plugin.json` and refresh the plugin in
   Settings → Plugin Management so the hook uses the new payload.

## 3.16.x DOM map (for future selector repairs)

- The real sidebar is the `ASIDE` panel with `workspace-sidebar-*` classes.
- The flex row holding [sidebar | chat] carries an arbitrary Tailwind class
  containing "sidebar" (`[anchor-scope:--sidebar-task-list-divider…]`) —
  never match "sidebar" as a bare substring in `EXCLUDE_SEL`, it swallows
  the whole chat transcript.
- Tool blocks (terminal/thinking/edit) are shadcn collapsibles:
  `[data-slot=collapsible]` containing a `.tool-summary` or `.reasoning`
  marker. The zone root is pinned LTR/left; chrome rows stay LTR; Persian
  prose inside the body goes through the normal ratio rule (→ RTL).

## Notes

- The debug port binds to 127.0.0.1 only; local processes could reach it —
  acceptable on a personal machine, do not forward it.
- Windows-first (launcher scripts are PowerShell/VBS). On macOS/Linux the
  injector works the same: start ZCode with `--remote-debugging-port=9222`
  and run `inject-rtl.mjs --watch` manually.
