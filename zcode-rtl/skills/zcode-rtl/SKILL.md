---
name: zcode-rtl
description: Use when the Persian/RTL layout of the ZCode chat UI is broken or stopped applying after a ZCode app update, when Persian messages render left-aligned or direction flips wrongly, or when asked to re-apply, enable/disable, install, or diagnose the ZCode RTL fix. Covers the CDP injector, the live on/off toggle, the default-off debug port, and updating the payload selectors after app updates.
---

# ZCode RTL fix (plugin edition)

The ZCode Desktop chat UI has no built-in RTL support and the plugin system
cannot restyle the host UI. This plugin ships the direction fix
(`assets/zcode-rtl-fix.js`) and injects it into the running app through the
Chromium DevTools Protocol (CDP). **No app file is modified**, so ZCode
updates never break the installation — worst case the DOM markup changes and
the payload's selectors need a tweak.

## Architecture (v0.4.0 — toggleable, debug port off by default)

- `assets/zcode-rtl-fix.js` — the payload: Persian text → RTL right-aligned,
  Latin/code → LTR, fully-RTL tables, user bubble pinned right, sidebar and
  tool-block chrome untouched, Persian prose inside tool bodies still RTL,
  MutationObserver self-heals during streaming. Idempotent.
  - Persistent switch: `localStorage["zcodeRtl:enabled"]` ('1' default).
  - `window.__zcodeRtlSetEnabled(true|false)` toggles live: enable runs
    `start()` instantly; disable reloads the renderer clean (nothing
    re-injects until the payload is evaluated again).
- `scripts/inject-rtl.mjs` — zero-dependency CDP client (Node ≥ 22).
  - `--set on|off`: live toggle (no app restart) — the main user-facing mode
  - default: one-shot inject into every page target
  - `--watch`: keep running, inject into new targets, survive renderer reloads
  - `--status`: port + target report
  - `--eval "<expr>"`: run JS in the page and print the result (diagnostics)
  - `--quiet` for hook use; env `ZCODE_RTL_PORT` (default 9222)
- `hooks/hooks.json` — SessionStart hook spawns `scripts/heartbeat.mjs`
  (detached, singleton via mutex port 9223, silent when the plugin toggle is
  off). The heartbeat polls `plugins.enabledPlugins` in `~/.zcode/cli/config.json`
  every ~3 s: a toggle edge syncs the in-page switch and applies/strips the
  RTL layer live (toggle ON with the port closed restarts ZCode once with the
  port — only while a ZCode process exists). Between toggle edges the in-page
  manual switch (`/rtl-fix off`) is respected.
- `scripts/restart-zcode.ps1` — on-demand helper (auto-detects ZCode.exe):
  restart WITH the port (`/rtl-fix on` when port closed) or with `-NoPort`
  (full off). The user's shortcuts stay vanilla — no permanent flag.

## State model

| State | Port 9222 | RTL layer | How to reach it |
|---|---|---|---|
| Default (privacy) | closed | off | `--set off` + `restart-zcode.ps1 -NoPort` |
| Enabled | open | on | `--set on` (first time: `restart-zcode.ps1`, then `--set on`) |
| Paused | open | off | `--set off` (instant, reload only) |

Electron reads `--remote-debugging-port` only at process start: OFF→ON (port)
costs exactly one app restart; every other transition is instant.

## Routine operations

```bash
node "<plugin>/scripts/inject-rtl.mjs" --set on     # enable (live)
node "<plugin>/scripts/inject-rtl.mjs" --set off    # pause (live)
node "<plugin>/scripts/inject-rtl.mjs" --status     # port + targets
node "<plugin>/scripts/inject-rtl.mjs" --eval "window.__zcodeRtlProcess ? 'ACTIVE' : 'ABSENT'"
```

## After a ZCode update breaks the layout

1. `--status` → port open? If closed, `restart-zcode.ps1` first.
2. `--set on` (or `--eval` payload check) → payload alive?
3. If active but visuals are wrong, the update changed class names/markup.
   Dump representative class names with `--eval`, then update the selectors
   (`MSG_SEL`, `USER_ROW`, `ASST_ROW`, `EXCLUDE_SEL`, `TOOL_ZONE`) in
   `assets/zcode-rtl-fix.js`, bump the version comment, re-run `--set on`.
   The in-page `diag()` logs remaining Persian-but-LTR blocks to the console.
4. Bump `version` in `.zcode-plugin/plugin.json` and refresh the plugin in
   Settings → Plugin Management so the hook uses the new payload.

## DOM map for future selector repairs (3.16.x → 3.17.x)

**Rule #1: never substring-match the host name.** `"zcode"` literally contains
`"code"`. On 3.17.1 `<body class="zcode-startup-ready">` and the transcript
container `[&>[data-zcode-chat-loading-slot]…]:-mt-2` were both caught by the
payload's `/code/i` className test and by `[class*="code" i]` — `<body>` got
`direction/text-align/unicode-bidi: ltr/left/embed !important` (and
`text-align` inherits), while the transcript container took the code branch
and returned early, so `processEl()` never reached a single Persian `<p>`.
Symptom: "payload is active, nothing changed". Code classes must be matched
at TOKEN level (`CODE_TOKEN` in the payload), never as a bare substring.
Generalize: any class list carrying the app name is unsafe for `[class*=…]`.

- The real sidebar is the `ASIDE` panel with `workspace-sidebar-*` classes.
- The flex row holding [sidebar | chat] carries an arbitrary Tailwind class
  containing "sidebar" (`[anchor-scope:--sidebar-task-list-divider…]`) —
  never match "sidebar" as a bare substring in `EXCLUDE_SEL`, it swallows
  the whole chat transcript.
- Tool blocks (terminal/thinking/edit) are shadcn collapsibles.
  - 3.16.x: `[data-slot=collapsible]` containing a `.tool-summary` or
    `.reasoning` marker.
  - 3.17.x: both markers were removed — the block chrome is
    `[data-slot=collapsible-trigger]`, and the body is
    `[data-slot=collapsible-content]` sitting as a direct child of
    `.history-message`. `[data-slot=collapsible]` alone is NOT a tool block:
    sidebar project/task rows use the same slot, so every tool rule is
    transcript-scoped (`isExcluded` + `inChat`) or the sidebar gets restyled
    by accident.
  - Either way: the zone root is pinned LTR/left; chrome rows stay LTR;
    Persian prose inside the body goes through the normal ratio rule (→ RTL).

## Notes

- The debug port binds to 127.0.0.1 only; local processes could reach it —
  acceptable on a personal machine, do not forward it. Default is OFF.
- Windows-first (the restart helper is PowerShell). On macOS/Linux: start
  ZCode with `--remote-debugging-port=9222` manually and run the injector;
  `--set on|off` works the same.
