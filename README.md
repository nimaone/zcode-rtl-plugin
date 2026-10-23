# ZCode RTL Fix — Persian/Farsi RTL for the ZCode Desktop chat UI

[English](#english) | [فارسی](README.fa.md)

<a id="english"></a>

**ZCode Desktop** (the free AI coding app from Z.ai) renders Persian chat text left-aligned with broken word order. The app has no RTL option, and its plugin system officially cannot restyle the host UI — so this plugin takes the reliable route: it injects a battle-tested direction fix into the running app through Chromium's standard DevTools Protocol (CDP). **No ZCode file is ever modified**, which is why the fix keeps working across app updates.

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

- **ZCode Desktop** for Windows (Windows-first; on macOS/Linux the injector itself works — see [Manual setup](#manual-setup-without-the-shortcut))
- **Node.js ≥ 22** (`node --version` to check)

## Installation (3 steps)

### 1. Add this repo as a plugin marketplace

In ZCode: **Plugin Marketplace → Add → Add Plugin Marketplace**, then paste:

```
https://github.com/nimaone/zcode-rtl-plugin
```

### 2. Install the plugin

Open the marketplace you just added (**Personal** tab), find **ZCode RTL Fix**, press **Install**. You should see it under **Settings → Plugin Management → Installed**.

### 3. Launch ZCode through the RTL shortcut

The injection needs the app to run with an open debug port. Create the launcher once:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<plugin-folder>\scripts\make-shortcut.ps1"
```

Not sure where the plugin folder is? It's the install cache:

```
%USERPROFILE%\.zcode\cli\plugins\cache\<marketplace>\zcode-rtl\<version>\
```

This creates a **ZCode (RTL)** shortcut on your desktop. From now on, start ZCode with that shortcut (double-click it; it also closes an already-running instance without the port and relaunches it properly). A hidden watcher keeps the fix alive across renderer reloads, and a SessionStart hook re-applies it in every new session as a second safety net.

That's it — Persian messages now render RTL.

> If ZCode.exe is installed in a non-standard location the launcher can't find, run it manually once:
> `powershell -File start-rtl.ps1 -ZCodeExe "C:\path\to\ZCode.exe"`

## Daily use

- **/rtl-fix** — slash command inside ZCode: re-applies the fix or prints a status report.
- **After a ZCode update** — if the layout looks wrong again, just run `/rtl-fix`. If the update changed the app's DOM class names, ask your ZCode agent to update the selectors in `assets/zcode-rtl-fix.js` (the bundled `zcode-rtl` skill contains a repair playbook, including a map of the current DOM structure).

## Manual setup (without the shortcut)

Any platform:

```bash
# start ZCode with the debug port (quit it first)
zcode --remote-debugging-port=9222 &        # or the full path to the binary

# keep the fix applied
node <plugin-folder>/scripts/inject-rtl.mjs --watch
```

One-shot instead of a watcher: drop `--watch` (add `--verbose` for logs). Check state with `--status`, poke the live DOM with `--eval "<js>"`.

## How it works (in one paragraph)

`scripts/inject-rtl.mjs` is a zero-dependency Node CDP client. It finds every renderer page via `http://127.0.0.1:9222/json/list`, connects over WebSocket and evaluates `assets/zcode-rtl-fix.js` in the page (with `Page.addScriptToEvaluateOnNewDocument` in watch mode, so it also survives reloads). The payload assigns per-element direction: Persian-dominant leaves get `direction: rtl; unicode-bidi: embed`, Latin runs and code stay LTR, the sidebar and tool-block chrome are explicitly excluded, and a `MutationObserver` re-processes streamed nodes. Because it only touches live style, it never modifies the app on disk.

**Privacy/security note:** the debug port binds to `127.0.0.1` only and is reachable from your machine only. Don't forward it. This is a user-side style injection, not an app modification.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/rtl-fix` says the port is closed | Quit ZCode fully (tray → Quit) and start it with the **ZCode (RTL)** shortcut |
| Persian still LTR after relaunch | Run `/rtl-fix` once — the SessionStart hook may have run before the window opened |
| Layout broke after a ZCode update | `/rtl-fix`; if still broken, the DOM changed — update the payload selectors (see the skill) |
| Watcher missing after reboot | Start via the **ZCode (RTL)** shortcut; the SessionStart hook covers sessions anyway |

## License

MIT — see [LICENSE](LICENSE).
