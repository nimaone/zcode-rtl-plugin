#!/usr/bin/env node
/*
 * ZCode RTL injector — pushes assets/zcode-rtl-fix.js into the ZCode Desktop
 * renderer through the Chrome DevTools Protocol (CDP).
 *
 * The ZCode plugin system cannot restyle the host app UI, so this rides the
 * standard Chromium debugging port instead. No app file is ever modified,
 * which is why the fix survives ZCode updates.
 *
 * Modes:
 *   (no args)         one-shot: inject into every page target, then exit
 *   --watch           stay alive; inject into new targets (app restarts, new
 *                     windows) and keep each CDP session open so the payload
 *                     also re-applies after renderer reloads
 *   --status          show port state and page targets; inject nothing
 *   --eval "<expr>"   run a JS expression in every page target, print result
 *                     (diagnostics after an app update changed the DOM)
 *   --quiet           suppress errors when the debug port is closed (hook use)
 *   --verbose         log to stderr
 *
 * Requires the app to run with --remote-debugging-port=<port>. The user's
 * normal ZCode shortcut (Start Menu) carries the flag — a one-time patch,
 * everything after that (injection at session start) runs through the
 * plugin hook in the background. The port binds to 127.0.0.1 only, so
 * nothing outside this machine can connect.
 *
 * Port: env ZCODE_RTL_PORT, default 9222. Node >= 22 (global WebSocket+fetch).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = String(process.env.ZCODE_RTL_PORT || 9222);
const BASE = `http://127.0.0.1:${PORT}`;
const HERE = dirname(fileURLToPath(import.meta.url));
const PAYLOAD_PATH = join(HERE, '..', 'assets', 'zcode-rtl-fix.js');

const args = process.argv.slice(2);
const WATCH = args.includes('--watch');
const STATUS = args.includes('--status');
const QUIET = args.includes('--quiet');
const VERBOSE = args.includes('--verbose');
const evalIdx = args.indexOf('--eval');
const EVAL = evalIdx >= 0 ? args[evalIdx + 1] : null;

const err = (...a) => { if (!QUIET) process.stderr.write(a.join(' ') + '\n'); };
const log = (...a) => { if (VERBOSE) process.stderr.write(a.join(' ') + '\n'); };

const isPortError = (e) => /fetch failed|ECONNREFUSED|WS |timeout/i.test(String(e.message || e));

async function listTargets() {
  const res = await fetch(`${BASE}/json/list`, { signal: AbortSignal.timeout(2000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from /json/list`);
  const list = await res.json();
  // Only real renderer pages; skip devtools frontends and workers.
  return list.filter((t) => t.type === 'page' && !/^devtools:\/\//i.test(t.url || ''));
}

let nextId = 1;
function attach(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    const timer = setTimeout(() => {
      reject(new Error('WS connect timeout'));
      try { ws.close(); } catch { /* already closed */ }
    }, 3000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve({
        ws,
        send(method, params = {}) {
          return new Promise((res2, rej2) => {
            const id = nextId++;
            pending.set(id, { res2, rej2 });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
      });
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.error) p.rej2(new Error(msg.error.message || 'CDP error'));
        else p.res2(msg.result);
      }
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WS error'));
    });
  });
}

function shortExc(r) {
  const d = r && r.exceptionDetails;
  if (!d) return null;
  return String((d.exception && d.exception.description) || d.text || 'unknown').slice(0, 400);
}

// One-shot: evaluate now, then disconnect. The in-page MutationObserver keeps
// the fix alive on streaming DOM changes; only a renderer reload drops it.
async function injectOnce(t, payload) {
  const { ws, send } = await attach(t.webSocketDebuggerUrl);
  try {
    const r = await send('Runtime.evaluate', { expression: payload, returnByValue: true });
    const exc = shortExc(r);
    if (exc) throw new Error(`payload threw: ${exc}`);
    return true;
  } finally {
    try { ws.close(); } catch { /* noop */ }
  }
}

async function evalIn(t, expr) {
  const { ws, send } = await attach(t.webSocketDebuggerUrl);
  try {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    const exc = shortExc(r);
    if (exc) return `EXCEPTION: ${exc}`;
    const v = r && r.result && r.result.value;
    return typeof v === 'string' ? v : JSON.stringify(v);
  } finally {
    try { ws.close(); } catch { /* noop */ }
  }
}

// Watch: keep each session OPEN — Page.addScriptToEvaluateOnNewDocument is
// session-scoped, so an open connection keeps the payload registered across
// renderer reloads. New targets (app restart, second window) get injected too.
async function watchLoop() {
  const payload = readFileSync(PAYLOAD_PATH, 'utf8');
  const sessions = new Map(); // targetId -> ws
  for (;;) {
    try {
      const targets = await listTargets();
      for (const t of targets) {
        if (sessions.has(t.targetId)) continue;
        try {
          const { ws, send } = await attach(t.webSocketDebuggerUrl);
          sessions.set(t.targetId, ws);
          ws.addEventListener('close', () => sessions.delete(t.targetId));
          await send('Page.addScriptToEvaluateOnNewDocument', { source: payload });
          const r = await send('Runtime.evaluate', { expression: payload, returnByValue: true });
          const exc = shortExc(r);
          if (exc) err(`[zcode-rtl] payload exception in "${t.title || t.url}": ${exc}`);
          else log(`[zcode-rtl] injected: ${t.title || t.url}`);
        } catch (e) {
          sessions.delete(t.targetId);
          err(`[zcode-rtl] target failed (${t.title || t.url}): ${e.message}`);
        }
      }
    } catch (e) {
      log(`[zcode-rtl] waiting for app on port ${PORT} (${e.message})`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function main() {
  if (STATUS) {
    let targets;
    try {
      targets = await listTargets();
    } catch (e) {
      console.log(`port ${PORT}: CLOSED (${e.message})`);
      console.log('Start ZCode with --remote-debugging-port=9222 (patch the Start Menu shortcut once — see the plugin README).');
      return;
    }
    console.log(`port ${PORT}: OPEN, ${targets.length} page target(s)`);
    for (const t of targets) {
      console.log(`- ${t.title || '(untitled)'}  ${String(t.url).slice(0, 80)}`);
    }
    return;
  }

  if (EVAL) {
    const targets = await listTargets();
    if (!targets.length) { console.log('no page targets'); return; }
    for (const t of targets) {
      const out = await evalIn(t, EVAL);
      console.log(`--- ${t.title || t.url} ---`);
      console.log(out === undefined ? '(undefined)' : out);
    }
    return;
  }

  if (WATCH) {
    await watchLoop();
    return;
  }

  // Default: one-shot injection.
  const payload = readFileSync(PAYLOAD_PATH, 'utf8');
  const targets = await listTargets();
  if (!targets.length) {
    err(`[zcode-rtl] port ${PORT} open but no page targets`);
    process.exitCode = 1;
    return;
  }
  let ok = 0;
  for (const t of targets) {
    try {
      await injectOnce(t, payload);
      ok++;
      console.log(`RTL injected: ${t.title || t.url}`);
    } catch (e) {
      err(`[zcode-rtl] failed (${t.title || t.url}): ${e.message}`);
    }
  }
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  if (isPortError(e)) {
    // Expected state when the app was not launched with the debug port.
    // Say it on stdout (hook stdout becomes session context) and exit clean.
    console.log(`[zcode-rtl] NOT APPLIED: debug port ${PORT} is closed. Fully quit ZCode and relaunch it from its normal shortcut (it must carry --remote-debugging-port=9222 — see the plugin README), then run /rtl-fix.`);
    process.exit(0);
  }
  err(`[zcode-rtl] ${e.stack || e.message || e}`);
  process.exit(1);
});
