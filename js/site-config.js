/* Northbound Studio — site configuration.
 *
 * Everything an operator changes without touching index.html lives here.
 * Loaded from <head> before the inline component script; read via window.NB_CONFIG.
 */
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

  /* Floor 02 case studies. `demo` keys into DEMOS above; `direction` matches the
   * Floor 06 card name so the two floors cross-link.
   * Copy and metrics are placeholders until the Pass 2 builds land. */
  CASES: [
    {
      direction: 'Atlas',
      business: 'Ridgeline Roofing',
      result: 'Booked 34 jobs in the first month.',
      tech: 'Astro · Sanity · 0.4s LCP',
      demo: 'atlas'
    },
    {
      direction: 'Vector',
      business: 'Marrow Coffee',
      result: 'Online orders tripled after launch.',
      tech: 'Astro · Stripe · 0.6s LCP',
      demo: 'vector'
    },
    {
      direction: 'Halo',
      business: 'Lumen Interiors',
      result: 'Average session time went from 22s to 1m48s.',
      tech: 'Next.js · R3F · 1.1s LCP',
      demo: 'halo'
    }
  ]
};
