/* Northbound — the proof reader.
 *
 * The rule: no section beats a blank section. The perf panel ships `hidden`
 * in the markup and stays that way unless every one of the following is true
 * of the deploy currently being viewed:
 *
 *   1. data/perf-budget.json loads and parses.
 *   2. data/release.json loads and parses. It is written fresh by
 *      scripts/ship.ts on every deploy and carries the short commit hash of
 *      the code that was actually shipped.
 *   3. The artifact's schema is 1.
 *   4. artifact.codeCommit is a string and equals release.codeCommit — i.e.
 *      the number on the page was measured against the exact js/css/HTML
 *      that is currently being served, not against some earlier deploy.
 *   5. Every headline [data-budget] path the page needs (frame, budget,
 *      headroom, caption, measuredAt) resolves to a real, non-empty value.
 *
 * If any of that fails, the panel stays hidden and the page says nothing —
 * not an em dash, not a stale number, nothing. Crawlers, link unfurlers,
 * reader mode, no-JS and screen readers all see the same absence. A
 * console.warn records why, never console.error: the no-WebGL and no-JS
 * perf gates count console errors and fail on more than zero.
 *
 * The per-act table rows are looser: a row whose act never reported a cost
 * on the measuring machine is marked data-unmeasured rather than hiding the
 * whole panel, because that is a fact about one row, not about whether the
 * measurement as a whole is current.
 */
(function () {
  'use strict';

  var ARTIFACT_URL = '/data/perf-budget.json';
  var RELEASE_URL = '/data/release.json';
  var HEADLINE_PATHS = [
    'published.frameMs',
    'published.budgetMs',
    'published.headroomPct',
    'published.caption',
    'measuredAt'
  ];

  function dig(obj, path) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || typeof cur !== 'object' || !(parts[i] in cur)) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function hasValue(v) {
    return v !== undefined && v !== null && v !== '';
  }

  function stamp(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return null;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function fill(data) {
    var nodes = document.querySelectorAll('[data-budget]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var path = el.getAttribute('data-budget');
      var v = dig(data, path);
      if (!hasValue(v)) continue;

      if (el.tagName === 'TIME') {
        var human = stamp(v);
        if (!human) continue;
        el.setAttribute('datetime', v);
        el.textContent = 'Measured ' + human;
        continue;
      }
      el.textContent = String(v);
    }

    /* A row whose act never reported a cost is a row about something that did
       not run on the measuring machine. Saying nothing is correct; printing a
       zero would be a claim. */
    var rows = document.querySelectorAll('[data-budget-rows] tr');
    for (var j = 0; j < rows.length; j++) {
      var cells = rows[j].querySelectorAll('[data-budget]');
      var any = false;
      for (var k = 0; k < cells.length; k++) {
        if (cells[k].textContent.trim() !== '') any = true;
      }
      if (!any) rows[j].setAttribute('data-unmeasured', '');
    }
  }

  function fresh(artifact, release) {
    if (!artifact || artifact.schema !== 1) return false;
    if (typeof artifact.codeCommit !== 'string' || !artifact.codeCommit) return false;
    if (!release || typeof release.codeCommit !== 'string') return false;
    if (artifact.codeCommit !== release.codeCommit) return false;
    for (var i = 0; i < HEADLINE_PATHS.length; i++) {
      if (!hasValue(dig(artifact, HEADLINE_PATHS[i]))) return false;
    }
    return true;
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(url + ': HTTP ' + r.status)); });
  }

  function show(artifact) {
    fill(artifact);
    var root = document.querySelector('[data-budget-root]');
    if (root) {
      root.hidden = false;
      root.setAttribute('data-proof', 'measured');
    }
  }

  function stayHidden(reason) {
    /* Leave the markup exactly as shipped: hidden, empty. Warn, never error —
       the no-WebGL and no-JS perf gates count console errors and fail on more
       than zero. */
    console.warn('[proof] no fresh measurement to show: ' + reason);
  }

  function run() {
    if (!document.querySelector('[data-budget-root]')) return;
    /* Fetch the artifact first, and only fetch data/release.json if the
       artifact could possibly be fresh. Before this site's first `bun run
       ship`, or on any checkout that has not re-measured, the artifact has
       no codeCommit at all and release.json does not exist yet either — a
       second fetch that is certain to 404 would log a resource-load error
       to the console on every single page view, and the no-WebGL and no-JS
       perf gates fail on more than zero console errors. Checking the
       artifact first means that failure mode never happens: a fetch is only
       made for a file that is expected to exist. */
    fetchJson(ARTIFACT_URL)
      .then(function (artifact) {
        if (!artifact || artifact.schema !== 1 || typeof artifact.codeCommit !== 'string' || !artifact.codeCommit) {
          stayHidden('artifact has no schema-1 codeCommit yet — nothing to compare against a release');
          return;
        }
        return fetchJson(RELEASE_URL).then(function (release) {
          if (!fresh(artifact, release)) {
            stayHidden('artifact is stale, malformed, or does not match the deployed code');
            return;
          }
          show(artifact);
        });
      })
      .catch(function (e) {
        stayHidden(e.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
