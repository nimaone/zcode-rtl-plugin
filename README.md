# ZCode RTL Fix — Persian/Farsi RTL for the ZCode Desktop chat UI

[English](#english) | [فارسی](README.fa.md)

<a id="english"></a>

**ZCode Desktop** (the free AI coding app from Z.ai) renders Persian chat text left-aligned with broken word order. The app has no RTL option, and its plugin system officially cannot restyle the host UI — so this plugin takes the reliable route: it injects a battle-tested direction fix into the running app through Chromium's standard DevTools Protocol (CDP). **No ZCode file is ever modified**, which is why the fix keeps working across app updates.

**Architecture (simple by design):** no launcher scripts, no desktop icons, no background processes. ZCode starts once with a debug-port flag (one-time tweak of your existing shortcut), and a plugin hook silently re-applies the fix at the start of every session.

## What you get

| Element | Behavior |
|---|---|
| Persian text in chat | RTL, right-aligned (ratio-based, so mostly-English "thinking" blocks stay LTR) |
| Code blocks, terminal commands | LTR, untouched |
| Tool blocks (terminal / thinking / edit) | Block chrome and layout stay LTR; Persian prose inside the body is RTL |
| Tables | Fully RTL (first column at the right), values wrap instead of overflowing |
| User bubble | Pinned right; assistant bubble left |
| App sidebar | Completely untouched |

The payload self-heals while the model is streaming (debounced 200 ms rescan), so Persian text that appears mid-answer is corrected immediately.

## Requirements

- **ZCode Desktop** (Windows instructions below; the injector itself also works on macOS/Linux — see [Manual setup](#manual-setup))
- **Node.js ≥ 22** (`node --version` to check)

## Installation (3 steps)

### 1. Add this repo as a plugin marketplace

In ZCode: **Plugin Marketplace → Add → Add Plugin Marketplace**, then paste:

```
https://github.com/nimaone/zcode-rtl-plugin
```

### 2. Install the plugin

Open the marketplace you just added (**Personal** tab), find **ZCode RTL Fix**, press **Install**. You should see it under **Settings → Plugin Management → Installed**.

### 3. One-time: start ZCode with the debug port

The injection needs the app to run with `--remote-debugging-port=9222`. Easiest way — patch your existing ZCode shortcut once (PowerShell):

```powershell
$sh = New-Object -ComObject WScript.Shell
$lnk = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\ZCode.lnk"
$s = $sh.CreateShortcut($lnk)
if ($s.Arguments -notlike '*remote-debugging-port*') { $s.Arguments = ($s.Arguments.Trim() + ' --remote-debugging-port=9222').Trim(); $s.Save() }
```

(or manually: right-click the ZCode shortcut → **Properties** → append ` --remote-debugging-port=9222` to the **Target** field.)

Then fully quit ZCode (tray icon → Quit) and start it again from that same shortcut. From now on, every session gets the fix injected automatically by the SessionStart hook — nothing else to run, ever.

That's it — Persian messages now render RTL.

## Daily use

- **/rtl-fix** — slash command inside ZCode: re-applies the fix or prints a status report.
- **After a ZCode update** — if the layout looks wrong again, just run `/rtl-fix`. If the update changed the app's DOM class names, ask your ZCode agent to update the selectors in `assets/zcode-rtl-fix.js` (the bundled `zcode-rtl` skill contains a repair playbook, including a map of the current DOM structure).

## Manual setup

Any platform:

```bash
# start ZCode with the debug port (quit it first)
zcode --remote-debugging-port=9222 &        # or the full path to the binary

# the SessionStart hook injects automatically; for a manual one-shot:
node <plugin-folder>/scripts/inject-rtl.mjs
```

Check state with `--status`, poke the live DOM with `--eval "<js>"`, add `--verbose` for logs, or run `--watch` to keep a persistent injector alive across renderer reloads (not required for the hook-based setup).

## How it works (in one paragraph)

`scripts/inject-rtl.mjs` is a zero-dependency Node CDP client. It finds every renderer page via `http://127.0.0.1:9222/json/list`, connects over WebSocket and evaluates `assets/zcode-rtl-fix.js` in the page. The payload assigns per-element direction: Persian-dominant leaves get `direction: rtl; unicode-bidi: embed`, Latin runs and code stay LTR, the sidebar and tool-block chrome are explicitly excluded, and a `MutationObserver` re-processes streamed nodes. Because it only touches live style, it never modifies the app on disk.

**Privacy/security note:** the debug port binds to `127.0.0.1` only and is reachable from your machine only. Don't forward it. This is a user-side style injection, not an app modification.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/rtl-fix` says the port is closed | ZCode is running without the flag: fully quit (tray → Quit) and relaunch from the patched shortcut |
| Persian still LTR after relaunch | Run `/rtl-fix` once — the SessionStart hook may have run before the window opened |
| Layout broke after a ZCode update | `/rtl-fix`; if still broken, the DOM changed — update the payload selectors (see the skill) |

## License

MIT — see [LICENSE](LICENSE).
