---
name: zcode-rtl
description: Use when the Persian/RTL layout of the ZCode chat UI is broken or stopped applying after a ZCode app update, when Persian messages render left-aligned or direction flips wrongly, or when asked to re-apply, install, or diagnose the ZCode RTL fix. Covers the CDP injector (hook-driven, background) and updating the payload selectors after app updates.
---

# ZCode RTL fix (plugin edition)

The ZCode Desktop chat UI has no built-in RTL support and the plugin system
cannot restyle the host UI. This plugin ships the battle-tested direction fix
(`assets/zcode-rtl-fix.js`, v24) and injects it into the running app through
the Chromium DevTools Protocol (CDP). **No app file is modified**, so ZCode
updates never break the installation — worst case the DOM markup changes and
the payload's selectors need a tweak.

## Architecture

- `assets/zcode-rtl-fix.js` — the payload: Persian text → RTL right-aligned,
  Latin/code → LTR, fully-RTL tables, user bubble pinned right, sidebar
  untouched, MutationObserver self-heals during streaming. Idempotent.
- `scripts/inject-rtl.mjs` — zero-dependency CDP client (Node ≥ 22).
  - default: one-shot inject into every page target
  - `--watch`: keep running, inject into new targets, survive renderer reloads
  - `--status`: port + target report
  - `--eval "<expr>"`: run JS in the page and print the result (diagnostics)
  - `--quiet` for hook use; env `ZCODE_RTL_PORT` (default 9222)
- `hooks/hooks.json` — SessionStart hook runs the injector quietly, so every
  session re-applies the fix even without the watcher.
- The debug port comes from the user's normal ZCode shortcut: the Start Menu
  `ZCode.lnk` carries `--remote-debugging-port=9222` (one-time patch, already
  applied). No dedicated launcher, desktop icon or background script — the
  hook is the only thing that runs.

## Routine operations

Re-apply after the app was started normally:

```bash
node "C:/Users/nima/ZCodeProject/plugins/zcode-rtl/scripts/inject-rtl.mjs" --verbose
```

Check state: add `--status`. Inspect live DOM after an update changed markup:

```bash
node ".../inject-rtl.mjs" --eval "document.querySelector('[class*=message i]')?.className"
node ".../inject-rtl.mjs" --eval "window.__zcodeRtlProcess ? 'PAYLOAD_ACTIVE' : 'PAYLOAD_ABSENT'"
```

## After a ZCode update breaks the layout

1. `--status` → port open? If not, ZCode was launched without the flag
   (Electron is single-instance: launching a second copy with the flag while
   one is alive just forwards to it and exits). Fully quit ZCode (tray →
   Quit) and relaunch from the normal shortcut.
2. `--eval "window.__zcodeRtlProcess ? 'ACTIVE' : 'ABSENT'"` → payload alive?
3. If active but visuals are wrong, the update changed class names/markup.
   Dump representative class names with `--eval`, then update the selectors
   (`MSG_SEL`, `USER_ROW`, `ASST_ROW`, `EXCLUDE_SEL`) in `assets/zcode-rtl-fix.js`,
   bump the version comment (v25, ...), and re-inject. The in-page diagnostic
   `diag()` logs remaining Persian-but-LTR blocks to the renderer console.
4. Bump `version` in `.zcode-plugin/plugin.json` and refresh the plugin in
   Settings → Plugin Management so the hook uses the new payload.

## Notes

- 3.16.3 DOM map (for future selector repairs): the real sidebar is the
  `ASIDE` panel with `workspace-sidebar-*` classes; the flex row holding
  [sidebar | chat] carries an arbitrary class containing "sidebar"
  (`[anchor-scope:--sidebar-task-list-divider…]`) — never match "sidebar" as
  a bare substring. Tool blocks (terminal/thinking/edit) are shadcn
  collapsibles: `[data-slot=collapsible]` containing a `.tool-summary` or
  `.reasoning` marker — they are hard-locked LTR by `TOOL_ZONE` (`:has()`).
- The debug port binds to 127.0.0.1 only; local processes could reach it —
  acceptable on a personal machine, do not forward it.
- Keep the workspace source (`C:\Users\nima\ZCodeProject\plugins\zcode-rtl`) as
  the canonical copy; the installed plugin is a cache copy.
- If ZCode is reinstalled to a different path, update the Start Menu
  shortcut so its target is the new exe and its arguments keep
  `--remote-debugging-port=9222`.
