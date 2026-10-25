#!/usr/bin/env node
/*
 * ZCode RTL heartbeat — makes the Plugin Management toggle a LIVE master
 * switch for the RTL layer.
 *
 * Why this exists: toggling a plugin in ZCode only rewrites
 * ~/.zcode/cli/config.json (plugins.enabledPlugins) — no process is killed,
 * no renderer reload happens, and nothing cleans the already-rendered chat
 * (confirmed in ZCode source: bootstrap setPluginEnabled → atomicWriteJson).
 * This daemon watches that file and reconciles the live page accordingly:
 *
 *   toggle OFF (edge)  -> sync page switch off + strip the RTL layer live
 *   toggle ON  (edge)  -> sync page switch on + (re)inject the RTL layer;
 *                         if the debug port is closed, restart ZCode once
 *                         with the port (only while a ZCode process exists)
 *   no toggle change   -> respect the in-page manual switch
 *                         (/rtl-fix off pauses until the next toggle edge)
 *
 * Spawned detached by the SessionStart hook (and by /rtl-fix). Singleton via
 * a mutex port; multiple sessions, app restarts and orphaned copies are all
 * harmless. Reads config.json every tick; talks CDP only when a transition
 * is needed (all page work is delegated to inject-rtl.mjs).
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { execSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(homedir(), '.zcode', 'cli', 'config.json');
const INJECT = join(HERE, 'inject-rtl.mjs');
const CDP = 'http://127.0.0.1:9222';
const MUTEX_PORT = 9223;
const TICK_MS = 3000;
const RESTART_COOLDOWN_MS = 60000;

const log = (...a) => console.error('[rtl-heartbeat]', new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => {
  const c = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
  // A spawn 'error' (ENOENT, ...) crashes the daemon if nobody listens.
  c.on('error', (e) => log('spawn failed:', cmd, e.message || e));
  c.unref();
};

function daemonize() {
  if (process.argv.includes('--daemon')) return;
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--daemon'], {
    detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.unref();
  process.exit(0);
}

function mutex() {
  // Binding the port IS the singleton lock; a second copy just exits.
  return new Promise((resolve) => {
    const srv = createServer(() => {});
    srv.once('error', () => resolve(false));
    srv.listen(MUTEX_PORT, '127.0.0.1', () => resolve(true));
  });
}

function readEnabled() {
  try {
    const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
    const eps = (cfg.plugins && cfg.plugins.enabledPlugins) || {};
    return Object.entries(eps).some(([k, v]) => k.startsWith('zcode-rtl@') && v === true);
  } catch {
    return null; // unreadable (mid-write) — treat as "no change this tick"
  }
}

function zcodeProcessExists() {
  try {
    return execSync('tasklist /FI "IMAGENAME eq ZCode.exe" /NH', { windowsHide: true })
      .toString().includes('ZCode.exe');
  } catch {
    return false;
  }
}

async function pageProbe() {
  // null = port closed or no page target yet; else { payload, ls }
  const res = await fetch(`${CDP}/json/list`, { signal: AbortSignal.timeout(1500) });
  const targets = (await res.json()).filter((t) => t.type === 'page' && !/^devtools:/i.test(t.url || ''));
  if (!targets.length) return null;
  return new Promise((resolve) => {
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    const done = (v) => { try { ws.close(); } catch { /* noop */ } resolve(v); };
    const timer = setTimeout(() => done(null), 3000);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
        expression: "JSON.stringify({p:!!window.__zcodeRtlProcess,l:localStorage.getItem('zcodeRtl:enabled')})",
        returnByValue: true,
      } }));
    });
    ws.addEventListener('message', (ev) => {
      clearTimeout(timer);
      try {
        const msg = JSON.parse(ev.data);
        const v = msg.result?.result?.value;
        done(v ? JSON.parse(v) : null);
      } catch { done(null); }
    });
    ws.addEventListener('error', () => { clearTimeout(timer); done(null); });
  });
}

let lastEnabled = null;
let lastRestart = 0;

async function tick() {
  const enabled = readEnabled();
  if (enabled === null) return;
  const edge = lastEnabled !== null && enabled !== lastEnabled;

  let probe = null;
  try { probe = await pageProbe(); } catch { probe = null; }
  const portOpen = probe !== null;

  if (portOpen) {
    // Marketplace toggle is the master switch: on an edge it overwrites the
    // in-page manual switch; between edges the manual switch is respected.
    if (edge) {
      run(process.execPath, [INJECT, '--eval',
        `try{localStorage.setItem('zcodeRtl:enabled','${enabled ? '1' : '0'}')}catch(e){};'SWITCH_SYNCED'`]);
    }
    const target = enabled && probe.l !== '0';
    if (probe.p && !target) {
      log('toggle off -> stripping RTL layer live');
      run(process.execPath, [INJECT, '--set', 'off']);
    } else if (!probe.p && target) {
      log('toggle on -> injecting RTL layer');
      run(process.execPath, [INJECT, '--set', 'on']);
    }
  } else if (enabled && Date.now() - lastRestart > RESTART_COOLDOWN_MS && zcodeProcessExists()) {
    // Toggle is ON but this ZCode instance has no debug port (e.g. first run
    // after a reboot without the always-on shortcut): restart it once with
    // the port. Never fires when the user simply quit the app.
    // Goes through wscript (GUI subsystem) — guaranteed zero windows.
    log('toggle on but no debug port — restarting ZCode with the port (once, invisibly)');
    lastRestart = Date.now();
    run('wscript.exe', [join(HERE, 'rtl-bg.vbs'), 'restart']);
  }

  lastEnabled = enabled;
}

daemonize();
if (!(await mutex())) process.exit(0); // an instance is already watching
log(`watching ${CONFIG} (port ${MUTEX_PORT} mutex)`);
for (;;) {
  try { await tick(); } catch (e) { log('tick error:', e.message || e); }
  await sleep(TICK_MS);
}
