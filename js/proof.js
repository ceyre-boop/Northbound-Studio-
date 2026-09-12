/* Northbound — the proof reader.
 *
 * The one number this site publishes about itself is the frame it renders in,
 * and the entire point is that no human typed it. scripts/perf.mjs measures it
 * under real DevTools throttling and writes data/perf-budget.json; this file
 * reads that artifact and fills every [data-budget] element by dotted path.
 * The page does no arithmetic and no rounding, so it cannot produce a number
 * different from the one that was measured.
 *
 * Three rules that look like details and are not:
 *
 * 1. The placeholder in the markup is an em dash, never a plausible number. If
 *    this fetch fails the page must look visibly unfinished rather than
 *    quietly stale. A hand-typed fallback is exactly the failure this whole
 *    mechanism exists to prevent.
 *
 * 2. The figure in the markup is already wrapped in a link to the artifact
 *    itself. With JavaScript off a visitor sees "—" linking to the raw JSON,
 *    with its timestamp, its commit and the harness conditions. That is
 *    arguably a better proof than the rendered number.
 *
 * 3. Nothing here writes a number that is not in the artifact. If a path is
 *    missing, the em dash stays. tests/budget.spec.ts asserts every rendered
 *    value equals the artifact value exactly, and fails the build if a fresh
 *    measurement drifts more than 15% from what is published. When that test
 *    fails the fix is to re-run the harness and commit the new artifact —
 *    never to edit the claim.
 */
(function () {
  'use strict';

  var ARTIFACT = '/data/perf-budget.json';

  function dig(obj, path) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || typeof cur !== 'object' || !(parts[i] in cur)) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
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
      if (v === undefined || v === null || v === '') continue;

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
        if (cells[k].textContent.trim() !== '—') any = true;
      }
      if (!any) rows[j].setAttribute('data-unmeasured', '');
    }

    var root = document.querySelector('[data-budget-root]');
    if (root) root.setAttribute('data-proof', 'measured');
  }

  function run() {
    if (!document.querySelector('[data-budget]')) return;
    fetch(ARTIFACT, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (data) {
        if (!data || data.schema !== 1) throw new Error('unrecognised artifact schema');
        fill(data);
      })
      .catch(function (e) {
        /* Leave every em dash exactly where it is. The panel reads as
           unmeasured, which is the truth, and the link to the raw artifact
           still works. Warn, never error: the no-WebGL and no-JS perf gates
           count console errors and fail on more than zero. */
        console.warn('[proof] no measurement published: ' + e.message);
        var root = document.querySelector('[data-budget-root]');
        if (root) root.setAttribute('data-proof', 'unmeasured');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
