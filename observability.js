/*
 * Whole Life Hub — error tracking starter (observability.js)
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *   Until now, a bug in a tester's browser was invisible unless the tester
 *   reported it. This file closes that gap: uncaught errors and rejected
 *   promises are captured, de-duplicated, and sent to one place you own —
 *   a table in your own Supabase project. No third-party tracker, no new
 *   account, and it fits the site's Content-Security-Policy as-is
 *   (connect-src already allows your Supabase project; a hosted tracker
 *   like Sentry would need its domain added to vercel.json first).
 *
 * PRIVACY RULES (kept on purpose — this is a health app)
 *   - Only the error message, stack, page path and browser string are sent, with URLs cut down to their path
 *     and token-looking values removed.
 *   - URLs are stripped to their path: query strings can carry tokens.
 *   - No form values, no logged health data, no user id are ever attached.
 *   - The destination table is INSERT-only for the app (see the SQL in
 *     docs/APP_READINESS.md): the app can report, it can never read back.
 *
 * WHERE IT GOES (switched on in 8.3.28)
 *   Reports are posted to this project's own `error_reports` table, created by
 *   supabase/migrations/20261024120000_wlh_8_3_28_error_reports.sql. That migration has to be applied
 *   to the live project before reports are accepted; until it is, each one is rejected (one console
 *   warning, nothing else) and the app behaves exactly as before. With ENDPOINT cleared it runs in
 *   console-only mode again: errors are captured and visible in devtools, nothing leaves the device.
 *
 * MANUAL USE
 *   WLHLog.error('checkout', err)  — report a caught failure with a label.
 *   WLHLog.event('app_ready')      — leave a simple breadcrumb event.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------ CONFIG
  const CONFIG = {
    // Supabase REST endpoint for the error_reports table. Same project as SB_URL in index.html; keep both in step.
    ENDPOINT: 'https://zemxqbinpehkrkyvzlue.supabase.co/rest/v1/error_reports',
    // The project's publishable (anon) key, the same one the app itself uses (SB_KEY in index.html).
    // Safe to ship in client code ONLY because the table is insert-only: reports can be written, never read back.
    ANON_KEY: 'sb_publishable_sWli_uOByy_C9rg8CE_8vQ_VNglQf0l',
    MAX_PER_SESSION: 20,   // hard cap: a crash loop must not flood the table
    QUEUE_LIMIT: 10,       // offline queue size (oldest dropped first)
    DEDUPE_MS: 60 * 1000   // identical error inside this window counts once
  };

  // ------------------------------------------------------------------- STATE
  let sentThisSession = 0;
  const seen = new Map();  // message+stack fingerprint -> last sent time
  const queue = [];        // payloads waiting for connectivity
  const enabled = Boolean(CONFIG.ENDPOINT && CONFIG.ANON_KEY);

  // ---------------------------------------------------------------- HELPERS
  // Keep the path, plus the route this app keeps in the hash (#/coach): without it a report cannot say which
  // screen failed. The query is always dropped, and a fragment is kept only when it is a bare route — no query,
  // no values. Supabase's sign-in callback puts access_token and refresh_token in the hash, and those must not
  // be sent anywhere, so anything with an "=" or "?" in the fragment is dropped whole. Capped to fit the column.
  function safePath(url) {
    try {
      const u = new URL(url, location.origin);
      const route = /^#\/[\w\-/]*$/.test(u.hash) ? u.hash : '';
      return (u.pathname + route).slice(0, 300);
    } catch (e) { return '(unknown page)'; }
  }

  // Error text and stack frames carry full URLs, and an auth callback's URL carries its tokens in the query or hash.
  // Keep each URL down to its path, and blank any token-looking name=value left in free text.
  function scrub(text) {
    return String(text || '')
      .replace(/(https?:\/\/[^\s?#)'"]*)[?#][^\s)'"]*/g, '$1')
      .replace(/\b(access_token|refresh_token|id_token|token|code|key|apikey|password|secret)=[^\s&)'"]+/gi, '$1=[removed]');
  }

  // Stacks can be huge; the useful part is the top. Cap the length so one report stays small.
  function trimStack(stack) {
    return typeof stack === 'string' ? scrub(stack).slice(0, 4000) : '';
  }

  function fingerprint(payload) {
    return payload.message + '|' + (payload.stack || '').split('\n')[1];
  }

  function shouldSend(payload) {
    if (sentThisSession >= CONFIG.MAX_PER_SESSION) return false;
    const now = Date.now();
    const last = seen.get(fingerprint(payload)) || 0;
    if (now - last < CONFIG.DEDUPE_MS) return false; // crash loop / repeat
    seen.set(fingerprint(payload), now);
    return true;
  }

  function buildPayload(kind, message, stack, label) {
    return {
      kind: kind,                                   // error | rejection | manual | event
      label: scrub(label).slice(0, 200),
      message: scrub(message).slice(0, 1000) || '(no message)',   // the table refuses an empty message
      stack: trimStack(stack),
      page: safePath(location.href),
      user_agent: navigator.userAgent.slice(0, 300)
      // created_at is left to the table's default: a phone with a wrong clock must not decide when a bug happened.
    };
  }

  // ---------------------------------------------------------------- DELIVERY
  // A report is retried only when the failure can pass: no connection, 429 or a 5xx. Any other answer (a 4xx
  // such as a wrong key or a missing table) will not change on a retry, so the report is dropped.
  const MAX_TRIES = 3;
  const RETRY_BASE_MS = 2000;

  function retry(item) {
    item.tries += 1;
    if (item.tries >= MAX_TRIES) return;               // give up: reporting must never become the problem
    enqueue(item);
    setTimeout(flushQueue, RETRY_BASE_MS * Math.pow(2, item.tries - 1));
  }

  function deliver(item) {
    const payload = item.payload;
    if (!enabled) {
      // Console-only mode: still useful while developing.
      console.warn('[WLHLog]', payload.kind, payload.message);
      return;
    }
    // fetch with keepalive survives the page closing, and (unlike sendBeacon, which can only send text/plain and
    // which the REST API rejects) it can send the JSON content type and the key headers.
    fetch(CONFIG.ENDPOINT, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.ANON_KEY,
        'Authorization': 'Bearer ' + CONFIG.ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify([payload])
    }).then(function (res) {
      if (res.ok) return;
      if (res.status === 429 || res.status >= 500) retry(item);
      else console.warn('[WLHLog] report rejected', res.status);   // status only, never the report
    }).catch(function () { retry(item); });             // offline: try again when the connection is back
  }

  function enqueue(item) {
    if (queue.length >= CONFIG.QUEUE_LIMIT) queue.shift();
    queue.push(item);
  }

  function flushQueue() {
    while (queue.length && navigator.onLine) deliver(queue.shift());
  }
  window.addEventListener('online', flushQueue);

  function report(kind, message, stack, label) {
    const payload = buildPayload(kind, message, stack, label);
    if (!shouldSend(payload)) return;
    sentThisSession += 1;
    const item = { payload: payload, tries: 0 };
    if (navigator.onLine === false) { enqueue(item); return; }
    deliver(item);
  }

  // ------------------------------------------------------------- AUTO-CAPTURE
  // Uncaught exceptions (including errors in the app's inline scripts).
  window.addEventListener('error', function (event) {
    report('error', event.message, event.error && event.error.stack, event.filename || '');
  });

  // Promises rejected with no .catch — the most common silent failure in
  // async Supabase code, and previously completely invisible.
  window.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason || {};
    report('rejection', reason.message || String(reason), reason.stack, '');
  });

  // ----------------------------------------------------------------- PUBLIC
  window.WLHLog = {
    error: function (label, err) {
      const e = err || {};
      report('manual', e.message || String(err), e.stack, label);
    },
    event: function (label) {
      report('event', label, '', label);
    }
  };
})();
