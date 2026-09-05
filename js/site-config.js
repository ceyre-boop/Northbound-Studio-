/* Northbound Studio — site configuration.
 *
 * Everything an operator changes without touching index.html lives here.
 * Loaded from <head> before the inline component script; read via window.NB_CONFIG.
 */
/* support.js fetches React from unpkg, which it can only discover after it has
 * parsed — a third-party round trip on the critical path that held LCP above
 * 4.5s. Its own __resources hook redirects those URLs to the copies vendored in
 * /vendor, which are byte-identical (verified against the SRI hashes support.js
 * pins). Same origin, already-warm connection, no extra dependency. */
window.__resources = {
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js': 'vendor/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js': 'vendor/react-dom.production.min.js'
};

window.NB_CONFIG = {

  /* Floor 07 scarcity line. Integer 1-9 renders "Two spots left this month."
   * Set to null to render the evergreen "Taking 2-3 projects a month." instead. */
  SPOTS_LEFT: 2,

  /* Where the live demo builds are served from.
   *
   * PASS 2 — switching to subdomains is a one-line change per entry:
   *   atlas: 'https://atlas.northbound-dev.com/', etc.
   * It needs, per demo: a sibling GitHub repo containing the build plus a CNAME
   * file holding the subdomain, Pages enabled on it, and a CNAME record at
   * Squarespace (account.squarespace.com/domains/managed/northbound-dev.com/dns)
   * pointing <name> at ceyre-boop.github.io. GitHub Pages allows one custom
   * domain per repo, which is why they cannot live in this one. */
  DEMOS: {
    atlas: '/demos/atlas/',
    vector: '/demos/vector/',
    halo: '/demos/halo/'
  },

  /* Floor 02 concept builds. `demo` keys into DEMOS above; `direction` matches
   * the Floor 06 card name so the two floors cross-link.
   *
   * These are CONCEPT BUILDS for invented businesses, and the cards say so.
   * Do not put a result, a metric or a client name here that did not happen —
   * a fabricated "booked 34 jobs" is the one claim that cannot be defended. */
  CASES: [
    {
      direction: 'Atlas',
      business: 'Ridgeline Roofing',
      result: 'A trades site built around one job: booking the call.',
      // Measured, not claimed: median of three Lighthouse mobile runs against
      // the deployed URL. Never write a number here that has not been measured.
      tech: 'Astro · Sanity · 1.2s LCP',
      demo: 'atlas'
    },
    {
      direction: 'Vector',
      business: 'Marrow Coffee',
      result: 'A small storefront with real checkout, no plugin sprawl.',
      tech: 'Astro · Stripe · static',
      demo: 'vector'
    },
    {
      direction: 'Halo',
      business: 'Lumen Interiors',
      result: 'A motion-led showcase for work seen best in motion.',
      tech: 'Next.js · React Three Fiber',
      demo: 'halo'
    }
  ]
};
