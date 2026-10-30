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
 *
 * Page work is delegated to the CURRENT install's scripts (resolved from
 * ~/.zcode/cli/plugins/installed_plugins.json), not to this file's own
 * folder: the mutex makes this daemon un-replaceable by a plugin refresh, so
 * a HERE-pinned injector would keep injecting the pre-update payload.
 */
import { readFileSync, appendFileSync, statSync, existsSync, truncateSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { execSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(homedir(), '.zcode', 'cli', 'config.json');
const PLUGINS_FILE = join(homedir(), '.zcode', 'cli', 'plugins', 'installed_plugins.json');
const CDP = 'http://127.0.0.1:9222';
const MUTEX_PORT = 9223;
const TICK_MS = 3000;
const LOGFILE = join(homedir(), '.zcode', 'rtl-heartbeat.log');

// This daemon is spawned from whichever cache version folder was current when
// the SessionStart hook ran, and it holds the mutex port for its whole life —
// a plugin refresh NEVER replaces it (the new copy loses the mutex race and
// exits silently). Resolving our scripts from HERE therefore pinned an old
// payload forever: after the update to 0.6.6 the stale 0.6.5 daemon kept
// re-injecting the v30 payload on every toggle edge, so RTL looked dead.
// Page work is delegated to the CURRENT install instead — read from
// installed_plugins.json and cached on its mtime, falling back to our own
// folder whenever the file is missing or unreadable.
let scriptsCache = { mtime: 0, dir: HERE };
function scriptsDir() {
  let st;
  try {
    st = statSync(PLUGINS_FILE);
  } catch {
    return scriptsCache.dir; // no install record: stay on our own folder
  }
  if (st.mtimeMs === scriptsCache.mtime) return scriptsCache.dir;
  scriptsCache.mtime = st.mtimeMs;
  try {
    const j = JSON.parse(readFileSync(PLUGINS_FILE, 'utf8'));
    const rec = (j.plugins || []).find(
      (p) => p.name === 'zcode-rtl' || String(p.id || '').startsWith('zcode-rtl@')
    );
    const dir = rec && rec.installPath && join(rec.installPath, 'scripts');
    if (dir && existsSync(join(dir, 'inject-rtl.mjs'))) {
      if (dir !== scriptsCache.dir) log('scripts dir ->', dir);
      scriptsCache.dir = dir;
    }
  } catch { /* keep the last good directory */ }
  return scriptsCache.dir;
}
const scriptPath = (f) => join(scriptsDir(), f);
// The Plugin Management toggle writes to the WORKSPACE scope config when a
// project is open (user-scope only when none) — watch both and AND them,
// matching ZCode's own resolution (any scope saying false wins).
let WORKSPACE = '';

const log = (...a) => {
  const line = `[rtl-heartbeat] ${new Date().toISOString()} ${a.join(' ')}`;
  console.error(line);
  try {
    if (existsSync(LOGFILE) && statSync(LOGFILE).size > 100000) truncateSync(LOGFILE);
    appendFileSync(LOGFILE, line + '\n');
  } catch { /* logging must never break the daemon */ }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => {
  const c = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
  // A spawn 'error' (ENOENT, ...) crashes the daemon if nobody listens.
  c.on('error', (e) => log('spawn failed:', cmd, e.message || e));
  c.unref();
};

function hookStdinPayload() {
  // SessionStart hooks receive a JSON payload on stdin (cwd/workspace).
  // Race with a timer so a missing/interactive stdin can never hang us.
  if (process.stdin.isTTY) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 1500);
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

async function daemonize() {
  if (process.argv.includes('--daemon')) {
    const wi = process.argv.indexOf('--workspace');
    if (wi >= 0 && process.argv[wi + 1]) WORKSPACE = process.argv[wi + 1];
    return;
  }
  // Hook / manual entry: figure out the active workspace, then detach.
  const payload = await hookStdinPayload();
  const ws = process.argv[process.argv.indexOf('--workspace') + 1]
    || payload?.cwd || payload?.workspace || '';
  const args = [fileURLToPath(import.meta.url), '--daemon'];
  if (ws) args.push('--workspace', ws);
  const child = spawn(process.execPath, args, {
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

function readFlag(file) {
  // null = not configured in this scope; else true/false
  try {
    const cfg = JSON.parse(readFileSync(file, 'utf8'));
    const p = (cfg && cfg.plugins) || {};
    if (p.enabled === false) return false; // global kill switch
    const eps = p.enabledPlugins || {};
    const hits = Object.entries(eps).filter(([k]) => k.startsWith('zcode-rtl@'));
    if (!hits.length) return null;
    // A stale second entry (an old marketplace id) may still say true —
    // an explicit false for any zcode-rtl@ plugin id must win.
    return hits.every(([, v]) => v !== false);
  } catch {
    return null;
  }
}

function readEnabled() {
  // Effective state = user scope AND workspace scope (ZCode ANDs scopes;
  // any scope explicitly saying false disables the plugin).
  const u = readFlag(CONFIG);
  if (u === false) return false;
  if (WORKSPACE) {
    const w = readFlag(join(WORKSPACE, '.zcode', 'config.json'));
    if (w === false) return false;
    if (w === true) return u !== false; // true in workspace, user unset/true
  }
  return u !== false; // both unset -> default enabled
}

function zcodeMainProcess() {
  // Delegates to zcode-main-proc.ps1 (shipped next to this file) so the
  // WMI query lives in one testable place with zero quoting surprises.
  try {
    const out = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(HERE, 'zcode-main-proc.ps1')}"`,
      { windowsHide: true, timeout: 5000 }
    ).toString();
    const j = JSON.parse(out);
    if (!j || !j.ProcessId) return null;
    return { pid: j.ProcessId, hasFlag: String(j.CommandLine || '').includes('remote-debugging-port') };
  } catch {
    return null;
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
let restartCount = 0;   // exponential backoff index; resets when healthy
let noPortStreak = 0;   // persistence guard against racing app startup
// v0.6.1: repeated restarts were observed killing the app every ~60 s when
// the app kept coming back without the port (crash/auto-update relaunch).
// Back off hard instead: 1 min, 5 min, 15 min, 60 min...
const BACKOFF_STEPS = [60e3, 5 * 60e3, 15 * 60e3, 60 * 60e3];

let reconciling = false;
async function reconcile() {
  if (reconciling) return;
  reconciling = true;
  try { await tick(); } catch (e) { log('tick error:', e.message || e); }
  reconciling = false;
}

async function tick() {
  const enabled = readEnabled();
  if (enabled === null) return;
  const edge = lastEnabled !== null && enabled !== lastEnabled;

  let probe = null;
  try { probe = await pageProbe(); } catch { probe = null; }
  const portOpen = probe !== null;
  if (portOpen && probe.p) restartCount = 0; // healthy — forget backoff
  noPortStreak = enabled && !portOpen ? noPortStreak + 1 : 0;

  if (portOpen) {
    // Marketplace toggle is the master switch. On an edge the requested
    // state wins IMMEDIATELY (v0.6.5: no separate localStorage sync spawn —
    // it raced the probe and delayed the inject by up to a safety-net
    // period; --set on/off keep the in-page switch in sync themselves).
    const target = enabled && (edge ? true : probe.l !== '0');
    if (edge) log(`toggle ${enabled ? 'on' : 'off'} edge`);
    if (probe.p && !target) {
      log('toggle off -> stripping RTL layer live');
      run(process.execPath, [scriptPath('inject-rtl.mjs'), '--set', 'off']);
    } else if (!probe.p && target) {
      log('toggle on -> injecting RTL layer');
      run(process.execPath, [scriptPath('inject-rtl.mjs'), '--set', 'on']);
    }
  } else if (enabled && (noPortStreak >= 2 || (edge && enabled))) {
    // Toggle is ON but this ZCode instance has no debug port. Restart at
    // most with a hard backoff, and ONLY when:
    //  - a real main app process exists (never launch the app ourselves,
    //    never mistake a lingering app-server child for the app), and
    //  - that process does NOT already carry the port flag (if it does, it
    //    is starting up or broken — wait, do not fight it).
    // An explicit toggle edge skips the persistence guard (the user just
    // asked for it); a no-port boot self-heals on the second reconcile.
    const main = zcodeMainProcess();
    const waitMs = BACKOFF_STEPS[Math.min(restartCount, BACKOFF_STEPS.length - 1)];
    if (main && !main.hasFlag && Date.now() - lastRestart > waitMs) {
      log(`toggle on but no debug port — restarting ZCode with the port (backoff attempt ${restartCount + 1}, next in ${waitMs / 60000} min+)`);
      lastRestart = Date.now();
      restartCount++;
      run('wscript.exe', [scriptPath('rtl-bg.vbs'), 'restart']);
    }
  }

  lastEnabled = enabled;
}

daemonize().then(() => mutex()).then(async (acquired) => {
  if (!acquired) process.exit(0); // an instance is already watching
  process.on('uncaughtException', (e) => {
    log('uncaughtException — exiting:', (e && (e.stack || e.message)) || e);
    process.exit(1);
  });
  process.on('unhandledRejection', (e) => {
    log('unhandledRejection:', (e && (e.stack || e.message)) || String(e));
  });
  log(`watching ${CONFIG}${WORKSPACE ? ' + workspace ' + WORKSPACE : ''} (port ${MUTEX_PORT} mutex)`);

  // v0.6.3 — event-driven instead of a 3 s polling loop (idle cost ~ 0):
  // react to config changes within ~0.15 s, plus one light safety-net
  // reconcile per minute (catches renderer reloads and app restarts).
  // v0.6.5 — watch DIRECTORIES, not the config files themselves: the app
  // replaces config.json atomically (write+rename), which silently kills
  // file watchers. Directory watchers survive; errors are absorbed.
  let pending = null;
  const schedule = () => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; reconcile(); }, 150);
  };
  const watchDir = (dir) => {
    try {
      const w = watch(dir, schedule);
      w.on('error', () => { /* dir replaced/removed — the 60 s net covers us */ });
    } catch (e) { log('watch unavailable:', dir, e.message || e); }
  };
  watchDir(dirname(CONFIG));
  if (WORKSPACE) watchDir(join(WORKSPACE, '.zcode'));
  setInterval(reconcile, 60000);
  await reconcile();
  // Boot self-heal: a no-port session gets a second reconcile ~6 s after
  // start (the 60 s safety net would otherwise be the earliest retry).
  setTimeout(reconcile, 6000);
});
