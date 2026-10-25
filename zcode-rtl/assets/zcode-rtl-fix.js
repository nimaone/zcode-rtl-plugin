/*
 * ZCode RTL fix v30 — Persian RTL, English/code/tool blocks LTR.
 *
 * v30 (reload-free OFF): the payload now records every element+property it
 *   touches (TOUCHED map). Disabling via window.__zcodeRtlSetEnabled(false)
 *   removes exactly those inline styles and disconnects the observer — the
 *   page is NOT reloaded any more, so toggling OFF no longer blinks the app.
 *   A stale observer from a previous payload evaluation is disconnected and
 *   replaced at (re)inject time so the newest closure always owns cleanup.
 *
 * v29 (toggle while working, debug port off by default):
 *   - The payload now respects a persistent switch:
 *     localStorage["zcodeRtl:enabled"] ('1' default, '0' = off).
 *   - window.__zcodeRtlSetEnabled(true|false) flips it: enabling runs start()
 *     immediately (no reload), disabling reloads the renderer — a clean page
 *     with no auto re-injection stays off until re-enabled. Both are instant
 *     and need no app restart; the app restart is only needed to OPEN or
 *     CLOSE the debug port itself (Electron reads that flag at process start).
 *   - When disabled at evaluation time, the payload exits without touching
 *     anything — this is what makes "port open but RTL off" a stable state.
 *
 * v28 (user report + screenshot, confirmed live): Persian PROSE inside tool
 *   blocks (the expanded Thinking body) rendered broken-LTR because v27
 *   hard-locked the WHOLE collapsible zone. The correct split:
 *   - zone root stays LTR/left (block pinned left, layout never mirrors);
 *   - chrome rows (.tool-summary / .reasoning markers) stay LTR always;
 *   - text leaves INSIDE the zone body go through the normal ratio rule,
 *     so Persian paragraphs become RTL/right while commands stay LTR.
 *
 * v27: sidebar wrapper repair resets direction+text-align+unicode-bidi;
 *   tool zones introduced ([data-slot=collapsible] with tool-summary or
 *   reasoning marker), sidebar header drift fixed.
 *
 * v27 (two user reports on 3.16.3):
 *   - SIDEBAR HEADER LEANED RIGHT: the very first v24 pass had put
 *     RTL_FORCE (direction+text-align+embed) on the layout wrappers above
 *     the sidebar; the v25/v26 repair reset only `direction`, so a stale
 *     inline `text-align: right` kept inheriting into the excluded sidebar
 *     ("Task list" header + search icon drifted right). The repair now also
 *     resets text-align and unicode-bidi.
 *   - TOOL BLOCKS MUST NEVER BE RTL: terminal/thinking/edit sections are
 *     shadcn collapsibles ([data-slot=collapsible]) marked by a
 *     .tool-summary or .reasoning row. They now get a hard LTR lock:
 *     the zone, everything already styled inside it, and any node the
 *     observer later adds inside it (isToolZone guard).
 *
 * v26 (chat never became RTL after the 3.16.3 update — root cause found):
 *   The generic exclusion [class*="sidebar"] matched the flex ROW container
 *   that holds [sidebar | chat], because 3.16.3 gives it the arbitrary
 *   Tailwind class `[anchor-scope:--sidebar-task-list-divider…]`. The whole
 *   chat transcript sat inside that "sidebar" and was excluded from every
 *   rule — hence "the code stopped working after the update". The exclusion
 *   is now structural: the real workspace sidebar is the ASIDE panel with
 *   the workspace-sidebar-* classes; arbitrary classes that merely CONTAIN
 *   the substring "sidebar" no longer swallow the chat.
 *
 * v25 (sidebar jumped to the RIGHT on app 3.16.3):
 *   The MutationObserver passed EVERY added node to processEl(); during
 *   session restore the added nodes were high-level layout wrappers
 *   (DIV.h-full, DIV.relative.flex-1...) whose textContent holds the whole
 *   Persian chat, so they scored "Persian-dominant" and received inline
 *   direction:rtl. An rtl ancestor reverses flex order, which moved the
 *   app sidebar to the right edge. Three guards now prevent and REPAIR it:
 *   - the observer only processes nodes inside the chat scope (MSG_SEL);
 *   - no element that CONTAINS an excluded (sidebar) node may receive rtl;
 *   - every pass resets rtl on layout wrappers that contain the sidebar
 *     but sit outside the chat scope (cleans damage from older passes).
 *   Everything else is identical to v24.
 *
 * v24 (plugin edition): identical logic to the battle-tested v23 snippet,
 * plus a bootstrap wrapper so the payload also works when injected at
 * document-start (CDP Page.addScriptToEvaluateOnNewDocument): if <body>
 * does not exist yet, everything defers to DOMContentLoaded instead of
 * crashing. Idempotent — safe to inject repeatedly (watcher + hook).
 *
 * v23:
 *   - THINKING BLOCK FLIPS ON CLICK: streamed thinking is mostly English
 *     with the occasional quoted Persian phrase; the old "any Persian char
 *     => whole block RTL" rule flipped the entire block the moment one
 *     Persian word appeared. Direction is now decided by RATIO:
 *     >=20% Persian letters => RTL, mostly-Latin => explicit LTR,
 *     otherwise neutral. Genuinely Persian paragraphs are far above the
 *     threshold; mostly-English thinking text stays LTR.
 *   - EDIT-MODE BOX JUMPS LEFT: entering edit on a user message swaps the
 *     bubble for an editor box that the max-w-* heuristic never matched,
 *     so it lost the right-side pinning. fixBubbleSides() now climbs from
 *     the row's textarea/contenteditable to the row's direct child and
 *     pins that box physically right as well.
 *
 * v22: tables FIT their pane width (width:100% overriding the w-max class)
 *   with white-space:normal + overflow-wrap:anywhere on cells, so long
 *   values WRAP instead of overflowing. Zero horizontal scroll -> nothing
 *   to fight ZCode's overlay scrollbar over. The FULLY RTL column order
 *   (first column right) is untouched.
 *
 * v18: everything inside #sidebar / any "*sidebar*" class/id is skipped by
 *   EVERY rule — the RTL fix only touches the chat transcript, never the
 *   sidebar chrome. Flex/toolbars inside user rows get direction:ltr so
 *   justify-end is reliably the PHYSICAL right.
 *
 * Behavior summary:
 *   - Persian text            -> forced RTL (rtl + embed, right-aligned)
 *   - English/pure-Latin text -> explicit LTR
 *   - code blocks             -> LTR, untouched
 *   - tables                  -> FULLY RTL: first column at the RIGHT, every
 *                                cell right-aligned; Latin tokens stay intact
 *                                as embedded LTR runs; cells wrap long values
 *   - user bubble + its edit/copy toolbar pinned RIGHT, assistant bubble LEFT
 *   - sidebar (#sidebar, *sidebar*) -> COMPLETELY UNTOUCHED
 *   - debounced 200 ms rescan after streaming mutations
 */
(function zcodeRtlFixV30() {
  // Every element+property we set, so disable() can strip them without a
  // page reload (v30).
  const TOUCHED = new Map();
  function force(el, props) {
    if (!el || el.nodeType !== 1) return;
    let rec = TOUCHED.get(el);
    if (!rec) { rec = new Set(); TOUCHED.set(el, rec); }
    for (const k in props) {
      rec.add(k);
      el.style.setProperty(k, props[k], 'important');
    }
  }

  // Persian/Arabic detection: Arabic block + supplements + presentation forms.
  const PERSIAN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

  // Forced RTL: `embed` (NOT `plaintext`) so the browser cannot re-resolve
  // the direction from content and override our explicit rtl.
  const RTL_FORCE = { 'direction': 'rtl', 'text-align': 'right', 'unicode-bidi': 'embed' };
  const RTL_LIST  = { 'direction': 'rtl', 'text-align': 'right', 'unicode-bidi': 'embed',
                      'padding-left': '0', 'padding-right': '1.5em',
                      'margin-left': '0', 'margin-right': '0' };
  const LTR_TEXT  = { 'direction': 'ltr', 'text-align': 'left',  'unicode-bidi': 'embed' };
  // Tables go FULLY RTL (v16 decision, kept): first column at the RIGHT,
  // everything right-aligned; Latin tokens stay intact as embedded LTR runs.
  const RTL_TABLE = { 'direction': 'rtl', 'text-align': 'right', 'unicode-bidi': 'embed',
                      'overflow-wrap': 'break-word' };
  const NEUTRAL   = { 'direction': 'auto', 'text-align': 'start', 'unicode-bidi': 'plaintext' };
  const RTL_INPUT = { 'direction': 'auto', 'text-align': 'start', 'unicode-bidi': 'plaintext' };

  const MSG_SEL = '[class*="message" i],[class*="Message" i],[class*="chat" i],[class*="Chat" i],' +
                  '[class*="bubble" i],[class*="Bubble" i],[class*="msg" i],[class*="Msg" i],' +
                  '[class*="conversation" i],[class*="Conversation" i],' +
                  '[class*="markdown" i],[class*="prose" i],[class*="content" i]';

  // Sidebar and other app chrome stay COMPLETELY untouched (v18; refined
  // v26): the RTL rules apply to the chat transcript only. The real
  // workspace sidebar on 3.16.3 is the ASIDE panel with the
  // workspace-sidebar-* width classes. The old generic [class*="sidebar"]
  // had to be dropped: arbitrary classes like
  // `[anchor-scope:--sidebar-task-list-divider…]` on the chat-bearing row
  // container made it exclude the whole transcript.
  const EXCLUDE_SEL = '#sidebar,[id*="sidebar" i],aside,[class*="workspace-sidebar" i]';
  function isExcluded(el) {
    return !!(el.closest && el.closest(EXCLUDE_SEL));
  }

  // v25: true when the element CONTAINS an excluded (sidebar) node — such
  // wrappers sit ABOVE the sidebar and must never receive rtl: an rtl
  // ancestor reverses flex order and moves the app sidebar to the right.
  function containsExcluded(el) {
    return !!(el.querySelector && el.querySelector(EXCLUDE_SEL));
  }

  function isCode(el) {
    const t = (el.tagName || '').toLowerCase();
    return t === 'pre' || t === 'code' || /code/i.test(el.className || '');
  }

  // Tool blocks (terminal / thinking / edit): the block CHROME (summary
  // rows, icons, command previews) is always left-to-right, but Persian
  // prose inside the expanded body must still be RTL (v28: v27 over-locked
  // the whole zone and scrambled streamed Persian thinking text).
  const TOOL_MARK = '[class*="tool-summary"],[class*="reasoning"]';
  const TOOL_ZONE = '[data-slot="collapsible"]:has(' + TOOL_MARK + ')';
  function isToolZone(el) {
    if (!el.closest) return false;
    return !!el.closest(TOOL_MARK) || !!el.closest(TOOL_ZONE);
  }
  // One pass per process(): pin zone roots LTR/left and chrome rows hard
  // LTR. Text leaves inside the body are NOT touched here — the normal
  // ratio rule decides their direction (Persian prose -> RTL).
  function fixToolBlocks(root) {
    root = root || document;
    root.querySelectorAll(TOOL_ZONE).forEach((zone) => {
      force(zone, { 'direction': 'ltr', 'text-align': 'left' });
    });
    root.querySelectorAll(TOOL_MARK).forEach((m) => force(m, LTR_TEXT));
  }

  // True when the text has no Persian/Arabic and is mostly Latin letters.
  function isPureLatin(str) {
    str = (str || '').trim();
    if (!str) return false;
    if (PERSIAN.test(str)) return false;
    const letters = str.replace(/\s/g, '');
    if (!letters) return false;
    const latin = (str.match(/[A-Za-z]/g) || []).length;
    return latin / letters.length > 0.7;
  }

  // Ratio-based direction decision (v23). "Any Persian char => RTL" flipped
  // whole streamed thinking blocks the moment one quoted Persian phrase
  // appeared. Real Persian paragraphs are >=20% Persian letters; mostly-
  // English thinking with an odd Persian token stays far below it.
  function persianRatio(str) {
    const letters = (str || '').replace(/\s/g, '');
    if (!letters) return 0;
    return (str.match(new RegExp(PERSIAN.source, 'g')) || []).length / letters.length;
  }
  function isPersianDominant(str) {
    return PERSIAN.test(str) && persianRatio(str) >= 0.2;
  }

  // THE MISSING FUNCTION (v16 crashed calling this): true when any child is
  // block-level, i.e. the element is a layout container, not a text leaf —
  // containers must not get leaf-level direction overrides.
  function hasBlockChild(el) {
    const kids = el.children;
    for (let i = 0; i < kids.length; i++) {
      const d = getComputedStyle(kids[i]).display;
      if (d !== 'inline' && d !== 'contents' && d.indexOf('inline') !== 0) return true;
    }
    return false;
  }

  // Tables: FIT the pane width instead of overflowing (v22).
  function markPaneChain(pane, table) {
    // Start ABOVE the table: the table and its cells keep going through the
    // normal branches (FULLY RTL); only the wrappers between the table and
    // the scroll pane (inclusive) are pinned LTR.
    let n = table.parentElement;
    while (n) {
      n.__zcodeRtlPaneChain = true;
      if (n === pane) break;
      n = n.parentElement;
    }
  }
  function fixTableScroll(root) {
    root = root || document;
    root.querySelectorAll('table').forEach((t) => {
      if (isExcluded(t)) return;
      force(t, {
        'width': '100%',
        'min-width': '0',
        'table-layout': 'auto',
        'white-space': 'normal',
      });
      t.querySelectorAll('td,th').forEach((c) => {
        force(c, {
          'white-space': 'normal',
          'overflow-wrap': 'anywhere',
          'word-break': 'normal',
        });
      });
      // The wrappers around the table keep native LTR so nothing re-flips.
      let anc = t.parentElement, depth = 0;
      while (anc && depth < 6) {
        const s = getComputedStyle(anc);
        if (s.overflowX.indexOf('auto') >= 0 || s.overflowX.indexOf('scroll') >= 0) {
          markPaneChain(anc, t);
          force(anc, { 'direction': 'ltr' });
          anc.scrollLeft = 0; // fitted table: nothing off-pane to scroll to
          break;
        }
        anc = anc.parentElement; depth++;
      }
    });
  }

  function processEl(el) {
    // One poisoned element must never abort a whole pass again (the v16
    // crash aborted everything downstream of the first bad table cell).
    try { processElInner(el); } catch (e) { /* skip broken subtree */ }
  }

  function processElInner(el) {
    if (!el || el.nodeType !== 1) return;
    if (isExcluded(el)) return; // sidebar/chrome: never touched
    // Table->scroll-pane chain: stays native LTR (v21). The generic Persian
    // rule used to rtl these wrappers on every pass (their textContent holds
    // the table's Persian), re-breaking pane scroll coordinates.
    if (el.__zcodeRtlPaneChain) {
      force(el, { 'direction': 'ltr' });
      const kids = el.children;
      for (let i = 0; i < kids.length; i++) processEl(kids[i]);
      return;
    }
    if (isCode(el)) { force(el, LTR_TEXT); return; }
    // Tool blocks (v28): the ZONE ROOT is pinned LTR/left so the block
    // never mirrors; chrome marker rows are hard LTR. Everything else
    // inside the body falls through to the normal ratio rule, so Persian
    // thinking prose becomes RTL while commands stay LTR.
    if (el.matches && el.matches(TOOL_ZONE)) {
      force(el, { 'direction': 'ltr', 'text-align': 'left' });
      const kids = el.children;
      for (let i = 0; i < kids.length; i++) processEl(kids[i]);
      return;
    }
    if (el.closest && el.closest(TOOL_MARK)) {
      force(el, LTR_TEXT);
      return;
    }

    const tag = (el.tagName || '').toLowerCase();

    // Tables: FULL RTL — structure AND cells. Column order mirrors
    // (first column at the right), which is the correct order for Persian.
    // MUST run before the isPureLatin early-return: pure-Latin cells
    // ("0.752", file names) otherwise end up direction:ltr / left-aligned
    // inside an otherwise right-aligned table.
    if (tag === 'table' || tag === 'thead' || tag === 'tbody' ||
        tag === 'tr' || tag === 'td' || tag === 'th') {
      force(el, RTL_TABLE);
      const kids = el.children;
      for (let i = 0; i < kids.length; i++) processEl(kids[i]);
      return;
    }

    const text = el.textContent || '';
    const disp = getComputedStyle(el).display;
    const isLayout = disp.indexOf('flex') >= 0 || disp.indexOf('grid') >= 0;

    // Div-based tables: ZCode may render markdown tables as div grids, so
    // the <td> branch never fires. Apply the same per-cell rule to any
    // near-leaf element inside a table scope — again BEFORE the pure-Latin
    // check, so Latin-valued pseudo-cells stay right-aligned like real ones.
    const inTable = !isLayout && el.closest && el.closest('table,[class*="table" i]');
    if (inTable && !hasBlockChild(el)) {
      force(el, RTL_TABLE);
    } else {
      if (isPureLatin(text)) { force(el, LTR_TEXT); return; }
      if (tag === 'ul' || tag === 'ol') {
        // Reached only when NOT pure-Latin -> Persian/mixed list goes RTL so
        // CSS-generated markers/numbers land on the right.
        force(el, RTL_LIST);
      } else if (tag === 'li') {
        force(el, RTL_FORCE);
      } else if (!isLayout) {
        // Core rule, v25 edition: RTL by RATIO (>=20% Persian letters) —
        // but NEVER on an element that contains the sidebar (layout wrapper):
        // flipping those reorders the whole app layout.
        force(el, (isPersianDominant(text) && !containsExcluded(el)) ? RTL_FORCE : NEUTRAL);
      }
    }

    const kids = el.children;
    for (let i = 0; i < kids.length; i++) processEl(kids[i]);
  }

  // Locate the actual chat bubble inside a row: follow the chain of
  // full-width wrappers down to the first clearly-narrower box — that is the
  // bubble. Full-width bubbles return null (nothing to pin).
  function bubbleOf(row) {
    const known = row.querySelector('[class*="max-w-"]');
    if (known && known.getBoundingClientRect().width > 20) return known;
    const rw = row.getBoundingClientRect().width;
    if (!rw) return null;
    let b = row;
    while (b.firstElementChild) {
      const c = b.firstElementChild;
      const w = c.getBoundingClientRect().width;
      if (w > 20 && w < rw * 0.985) return c;
      b = c;
    }
    return null;
  }

  // Pin the user's message bubble to the RIGHT and the assistant's to the LEFT
  // using physical properties (direction-independent) so it never flips sides.
  const USER_ROW = '[class*="user-row" i]';
  const ASST_ROW = '[class*="assistant-row" i],[class*="ai-row" i],[class*="bot-row" i]';
  function fixBubbleSides(root) {
    root = root || document;
    root.querySelectorAll(USER_ROW).forEach((row) => {
      if (isExcluded(row)) return;
      if (row.getBoundingClientRect().width < 100) return; // avatar chips etc., not chat rows
      const disp = getComputedStyle(row).display;
      if ((disp.indexOf('flex') >= 0 || disp.indexOf('grid') >= 0) &&
          getComputedStyle(row).flexDirection !== 'column' &&
          getComputedStyle(row).flexDirection !== 'column-reverse') {
        // Pin direction ltr too: rows inherit rtl from the Persian message,
        // and in an rtl flex container flex-end is the PHYSICAL LEFT.
        force(row, { 'justify-content': 'flex-end', 'direction': 'ltr' });
      }
      const b = bubbleOf(row);
      if (b) {
        b.style.setProperty('margin-left', 'auto', 'important');
        b.style.setProperty('margin-right', '0', 'important');
      }
      // EDIT MODE (v23): while a user message is being edited the bubble is
      // replaced by an editor box that bubbleOf() cannot identify. Climb
      // from the row's textarea/contenteditable up to the row's direct
      // child and pin every box on that path physically right.
      const field = row.querySelector('textarea,[contenteditable="true"],[contenteditable=""]');
      if (field && !field.__zcodeRtlInputPinned) {
        let n = field;
        while (n && n !== row) {
          if (n.parentElement === row) {
            n.style.setProperty('margin-left', 'auto', 'important');
            n.style.setProperty('margin-right', '0', 'important');
          }
          force(n, { 'direction': 'ltr' }); // editor chrome stays LTR; text dir is per-field
          n = n.parentElement;
        }
        force(field, { 'direction': 'auto', 'text-align': 'start', 'unicode-bidi': 'plaintext' });
        field.__zcodeRtlInputPinned = true;
      }
    });
    root.querySelectorAll(ASST_ROW).forEach((row) => {
      if (isExcluded(row)) return;
      const disp = getComputedStyle(row).display;
      if ((disp.indexOf('flex') >= 0 || disp.indexOf('grid') >= 0) &&
          getComputedStyle(row).flexDirection !== 'column' &&
          getComputedStyle(row).flexDirection !== 'column-reverse') {
        force(row, { 'justify-content': 'flex-start', 'direction': 'ltr' });
      }
      const b = bubbleOf(row);
      if (b) {
        b.style.setProperty('margin-right', 'auto', 'important');
        b.style.setProperty('margin-left', '0', 'important');
      }
    });
  }

  // The edit/copy action toolbar under the user bubble: it is a flex-row
  // container, and in an LTR document its content starts at the LEFT edge.
  // Pin every button-bearing flex-row inside the user row to the right edge.
  function fixUserActions(root) {
    root = root || document;
    root.querySelectorAll(USER_ROW).forEach((row) => {
      if (isExcluded(row)) return;
      row.querySelectorAll('div').forEach((d) => {
        if (!d.querySelector('button')) return;
        const cs = getComputedStyle(d);
        if (cs.display.indexOf('flex') < 0 || cs.flexDirection !== 'row') return;
        // direction ltr is essential: these toolbars inherit rtl from the
        // Persian message, and in an rtl flex-row flex-end = physical LEFT.
        d.style.setProperty('direction', 'ltr', 'important');
        d.style.setProperty('justify-content', 'flex-end', 'important');
        d.style.setProperty('margin-left', 'auto', 'important');
        d.style.setProperty('margin-right', '0', 'important');
        d.style.setProperty('align-self', 'flex-end', 'important');
      });
    });
  }

  function processMessages(root) {
    root = root || document;
    root.querySelectorAll(MSG_SEL).forEach((el) => {
      // Only process outermost matches (recursion covers the rest) and never
      // descend into code blocks or the sidebar from outside.
      if (isExcluded(el)) return;
      if (el.parentElement && el.parentElement.closest(MSG_SEL)) return;
      if (el.closest && el.closest('pre,code')) return;
      processEl(el);
    });
    root.querySelectorAll('textarea,input,[contenteditable="true"],[contenteditable=""]')
         .forEach((e) => { if (!isExcluded(e)) force(e, RTL_INPUT); });
    root.querySelectorAll('pre,code,[class*="code" i]')
         .forEach((e) => { if (!isExcluded(e)) force(e, LTR_TEXT); });
  }

  function process(root) {
    root = root || document;
    force(root.documentElement || document.documentElement, { 'direction': 'ltr' });
    force(root.body || document.body, { 'direction': 'ltr' });
    processMessages(root);
    fixBubbleSides(root);
    fixUserActions(root);
    fixTableScroll(root);
    fixToolBlocks(root);
    // v27 REPAIR: an earlier pass (or an older payload version) may have put
    // inline rtl/right on layout wrappers that CONTAIN the sidebar while
    // sitting outside the chat scope — that reorders the app layout AND its
    // text-align:right keeps inheriting into the excluded sidebar ("Task
    // list" header drifting right). Reset direction+text-align+unicode-bidi
    // on those; chat-scoped rtl is legit and untouched.
    root.querySelectorAll('[style*="direction: rtl"],[style*="direction:rtl"],[style*="text-align: right"],[style*="text-align:right"]').forEach((el) => {
      if (isExcluded(el)) return;
      if (el.closest && el.closest(MSG_SEL)) return;
      if (containsExcluded(el)) force(el, { 'direction': 'ltr', 'text-align': 'left', 'unicode-bidi': 'normal' });
    });
  }

  // Diagnostic: any Persian block still rendering LTR after our pass?
  // inlineDir shows what WE set; computedDir shows what actually won.
  function diag() {
    const scope = '[class*="markdown" i],[class*="prose" i],[class*="message" i],[class*="content" i]';
    let checked = 0, suspect = 0;
    document.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th').forEach((el) => {
      if (!el.closest(scope) || (el.closest && el.closest('pre,code')) || isExcluded(el)) return;
      const t = (el.textContent || '').trim();
      if (!t) return;
      checked++;
      if (PERSIAN.test(t) && getComputedStyle(el).direction === 'ltr') {
        if (suspect < 5) {
          console.warn('[RTL-DIAG] Persian but LTR: <' + el.tagName.toLowerCase() +
            '> cls="' + String(el.className || '').slice(0, 60) +
            '" inlineDir=' + (el.style.direction || '(none)') +
            ' computedDir=' + getComputedStyle(el).direction +
            ' align=' + getComputedStyle(el).textAlign +
            ' text="' + t.slice(0, 50) + '"');
        }
        suspect++;
      }
    });
    console.log('[RTL-DIAG] blocks checked: ' + checked + ', Persian-but-LTR suspects: ' + suspect);
  }

  // v24: everything that touches document.body now lives in start(), which
  // waits for DOMContentLoaded when injected at document-start via CDP.
  // Repeated injections are safe: process() is idempotent and the observer
  // is guarded by window.__zcodeRtlObserver.
  function start() {
    process(document);
    diag();

    // Always re-check after streaming mutations: decisions made on partial
    // content (React node reuse mid-stream) get corrected within 200 ms.
    window.__zcodeRtlProcess = process;
    if (!window.__zcodeRtlObserver) {
      const obs = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (n.nodeType !== 1) continue;
            if (n.closest && (n.closest('pre,code') || isExcluded(n))) continue;
            // v25: only style nodes INSIDE the chat transcript scope. The
            // observer used to process every added node, so session-restore
            // mutations on high-level layout wrappers (which merely CONTAIN
            // the messages) scored Persian-dominant and flipped the whole
            // app layout rtl — sidebar jumped to the right edge.
            const inChatScope = (n.matches && n.matches(MSG_SEL)) ||
                                (n.closest && n.closest(MSG_SEL));
            if (inChatScope) processEl(n);
            if ((n.matches && (n.matches(USER_ROW) || n.matches(ASST_ROW))) ||
                (n.querySelector && (n.querySelector(USER_ROW) || n.querySelector(ASST_ROW)))) {
              fixBubbleSides(n);
              fixUserActions(n);
            }
          }
        }
        if (window.__zcodeRtlTimer == null) {
          window.__zcodeRtlTimer = setTimeout(() => {
            window.__zcodeRtlTimer = null;
            if (window.__zcodeRtlProcess) window.__zcodeRtlProcess(document);
          }, 200);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      window.__zcodeRtlObserver = obs;
    }

    console.log('[ZCode RTL v30] applied. Persian RTL; tool-block chrome LTR with Persian prose RTL inside; sidebar untouched. Toggle is reload-free both ways.');
  }

  // v29: persistent on/off switch. '0' in localStorage disables the layer.
  // v30: disabling strips exactly the styles we set — no page reload.
  const LS_KEY = 'zcodeRtl:enabled';
  function rtlEnabled() {
    try { return localStorage.getItem(LS_KEY) !== '0'; } catch (e) { return true; }
  }
  function stripAll() {
    for (const [el, props] of TOUCHED) {
      try {
        for (const k of props) el.style.removeProperty(k);
        if (el.style && el.style.length === 0) el.removeAttribute('style');
      } catch (e) { /* detached node — ignore */ }
    }
    TOUCHED.clear();
  }
  function stopObserver() {
    if (window.__zcodeRtlObserver) {
      try { window.__zcodeRtlObserver.disconnect(); } catch (e) { /* noop */ }
      window.__zcodeRtlObserver = null;
    }
  }
  window.__zcodeRtlSetEnabled = function (v) {
    try { localStorage.setItem(LS_KEY, v ? '1' : '0'); } catch (e) { /* storage blocked */ }
    if (v) {
      if (!window.__zcodeRtlObserver) start();
      console.log('[ZCode RTL v30] enabled.');
    } else {
      try { stripAll(); } catch (e) { /* nothing touched */ }
      stopObserver();
      window.__zcodeRtlProcess = null;
      console.log('[ZCode RTL v30] disabled — styles stripped, no reload.');
    }
  };

  if (!rtlEnabled()) {
    console.log('[ZCode RTL v29] disabled (localStorage zcodeRtl:enabled=0). Enable with window.__zcodeRtlSetEnabled(true) or /rtl-fix on.');
    return;
  }

  if (document.body) {
    stopObserver(); // a previous evaluation's closure must not survive (v30)
    start();
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(start, 0);
    });
  }
})();
