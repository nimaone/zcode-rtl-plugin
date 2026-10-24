# ZCode RTL Fix — Persian/Farsi RTL for the ZCode Desktop chat UI

[English](#english) | [فارسی](README.fa.md)

<a id="english"></a>

**ZCode Desktop** (the free AI coding app from Z.ai) renders Persian chat text left-aligned with broken word order. The app has no RTL option, and its plugin system officially cannot restyle the host UI — so this plugin takes the reliable route: it injects a battle-tested direction fix into the running app through Chromium's standard DevTools Protocol (CDP). **No ZCode file is ever modified**, which is why the fix keeps working across app updates.

**Design goals (v0.4.0):**

- **Privacy by default** — the debug server is **off**. Your normal ZCode shortcut stays untouched; no permanent flags, no background processes, no launcher icons.
- **Live toggle** — while the port is open, `/rtl-fix off` and `/rtl-fix on` switch the RTL layer instantly. No app restart.
- **One honest limitation** — Chromium only reads `--remote-debugging-port` at process start, so going from *port closed* to *port open* costs exactly one app restart (handled automatically for you by `/rtl-fix on`).

> Why not like the DSH Arabic/Rastin plugins, which need none of this? Those target DeepSeek Harness, whose plugin API exposes official UI-injection hooks (`webserver/index-inject`, style seats). ZCode (as of 3.16.x) exposes no such extension point — its plugin system is agent-only — so a CDP bridge is the only reliable vector. If ZCode ever adds an official injection hook, this plugin can drop the port entirely.

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

## Installation (2 steps)

### 1. Add this repo as a plugin marketplace

In ZCode: **Plugin Marketplace → Add → Add Plugin Marketplace**, then paste:

```
https://github.com/nimaone/zcode-rtl-plugin
```

### 2. Install the plugin

Open the marketplace you just added (**Personal** tab), find **ZCode RTL Fix**, press **Install**. You should see it under **Settings → Plugin Management → Installed**.

Done. Nothing listens, nothing runs — you installed a switch, and it's off.

## Turning RTL on and off

Type `/rtl-fix` in the ZCode chat (the plugin ships this slash command):

| Command | What happens |
|---|---|
| `/rtl-fix on` | Enables the RTL layer **live**. If the debug port is still closed (your first time), it restarts ZCode once with the port via the bundled `restart-zcode.ps1` — your session is restored — then enables it. |
| `/rtl-fix off` | Disables the RTL layer **instantly** (the page reloads clean). The port stays open. |
| `/rtl-fix off hard` | Also closes the debug server — back to the full privacy default (one restart). |
| `/rtl-fix status` | Reports: port open/closed, page targets, payload state. |

Under the hood the toggle is `localStorage["zcodeRtl:enabled"]` plus an in-page switch (`window.__zcodeRtlSetEnabled(true|false)`), so it survives page reloads and needs no app restart — except the single restart that opens the port the first time.

Your ZCode shortcuts are never modified. If you prefer the *always-on* style instead, you can add ` --remote-debugging-port=9222` to your ZCode shortcut's Target once — then RTL comes back automatically in every new session via the SessionStart hook.

## Manual setup

Any platform:

```bash
# quit ZCode, then start it with the port
zcode --remote-debugging-port=9222 &        # or the full path to the binary

# live toggle
node <plugin-folder>/scripts/inject-rtl.mjs --set on
node <plugin-folder>/scripts/inject-rtl.mjs --set off

# diagnostics
node <plugin-folder>/scripts/inject-rtl.mjs --status
node <plugin-folder>/scripts/inject-rtl.mjs --eval "window.__zcodeRtlProcess ? 'ACTIVE' : 'ABSENT'"
```

## How it works (in one paragraph)

`scripts/inject-rtl.mjs` is a zero-dependency Node CDP client. It finds every renderer page via `http://127.0.0.1:9222/json/list`, connects over WebSocket and evaluates `assets/zcode-rtl-fix.js` in the page. The payload assigns per-element direction: Persian-dominant leaves get `direction: rtl; unicode-bidi: embed`, Latin runs and code stay LTR, the sidebar and tool-block chrome are explicitly excluded, and a `MutationObserver` re-processes streamed nodes. Because it only touches live style, it never modifies the app on disk.

**Privacy/security note:** the debug port binds to `127.0.0.1` only and is reachable from your machine only. Don't forward it. It is closed unless you explicitly turn RTL on. This is a user-side style injection, not an app modification.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/rtl-fix on` says `PORT_CLOSED` | Expected on first enable — the command itself runs `restart-zcode.ps1` (one restart), then re-run `/rtl-fix on` |
| Persian still LTR right after enabling | The page may still be restoring — run `/rtl-fix on` once more or start a new message |
| Layout broke after a ZCode update | `/rtl-fix on`; if still broken, the DOM changed — update the payload selectors (see the bundled skill) |
| Want it gone completely | `/rtl-fix off hard` |

## License

MIT — see [LICENSE](LICENSE).
