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
 *   - Only the error message, stack, page path and browser string are sent.
 *   - URLs are stripped to their path: query strings can carry tokens.
 *   - No form values, no logged health data, no user id are ever attached.
 *   - The destination table is INSERT-only for the app (see the SQL in
 *     docs/APP_READINESS.md): the app can report, it can never read back.
 *
 * HOW TO TURN IT ON
 *   1. Run the SQL in docs/APP_READINESS.md to create `error_reports`.
 *   2. Fill in CONFIG.ENDPOINT and CONFIG.ANON_KEY below.
 *   3. Load this file from <head> (before the app's main script) so errors
 *      during startup are caught too — exact lines are in the same doc.
 *   Until step 2 is done it runs in console-only mode: errors are still
 *   captured and visible in devtools, nothing leaves the device.
 *
 * MANUAL USE
 *   WLHLog.error('checkout', err)  — report a caught failure with a label.
 *   WLHLog.event('app_ready')      — leave a simple breadcrumb event.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------ CONFIG
  const CONFIG = {
    // Supabase REST endpoint for the error_reports table, e.g.
    // 'https://<project-ref>.supabase.co/rest/v1/error_reports'
    ENDPOINT: '',
    // The project's anon (public) key. Safe to ship in client code ONLY
    // because the table's RLS policy is insert-only (see the readiness doc).
    ANON_KEY: '',
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
  // Keep only the path of a URL — query strings may contain tokens or ids.
  function safePath(url) {
    try { return new URL(url, location.origin).pathname; }
    catch (e) { return '(unknown page)'; }
  }

  // Stacks can be huge; the useful part is the top. Cap the length so one
  // report stays small enough for sendBeacon's ~64 KB practical limit.
  function trimStack(stack) {
    return typeof stack === 'string' ? stack.slice(0, 4000) : '';
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
      label: label || '',
      message: String(message || '').slice(0, 1000),
      stack: trimStack(stack),
      page: safePath(location.href),
      user_agent: navigator.userAgent.slice(0, 300),
      created_at: new Date().toISOString()
    };
  }

  // ---------------------------------------------------------------- DELIVERY
  function deliver(payload) {
    if (!enabled) {
      // Console-only mode: still useful while developing.
      console.warn('[WLHLog]', payload.kind, payload.message);
      return;
    }
    const body = JSON.stringify([payload]);
    // sendBeacon survives page close (exactly when crashes happen); fetch
    // with keepalive is the fallback for browsers without it.
    const beaconOk = navigator.sendBeacon &&
      navigator.sendBeacon(CONFIG.ENDPOINT + '?apikey=' + CONFIG.ANON_KEY, body);
    if (!beaconOk) {
      fetch(CONFIG.ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.ANON_KEY,
          'Authorization': 'Bearer ' + CONFIG.ANON_KEY,
          'Prefer': 'return=minimal'
        },
        body: body
      }).catch(function () { enqueue(payload); }); // offline: retry later
    }
  }

  function enqueue(payload) {
    if (queue.length >= CONFIG.QUEUE_LIMIT) queue.shift();
    queue.push(payload);
  }

  function flushQueue() {
    while (queue.length && navigator.onLine) deliver(queue.shift());
  }
  window.addEventListener('online', flushQueue);

  function report(kind, message, stack, label) {
    const payload = buildPayload(kind, message, stack, label);
    if (!shouldSend(payload)) return;
    sentThisSession += 1;
    if (navigator.onLine === false) { enqueue(payload); return; }
    deliver(payload);
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
