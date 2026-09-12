/* Northbound Studio — the content file.
 *
 * Everything the site says lives here, in one place, so that changing what the
 * studio claims is a diff a person can read rather than a search through
 * markup. Replaces the old js/site-config.js.
 *
 * ---------------------------------------------------------------------------
 * THE RULE, inherited from that file and not softened:
 *
 *   Do not put a result, a metric or a client name here that did not happen.
 *   A fabricated "booked 34 jobs" is the one claim that cannot be defended.
 *   There is no panel until there is something behind it.
 *
 * That rule has already been enforced twice in this repo's history. It killed
 * the Halo entry, which advertised "Next.js · React Three Fiber" for a build
 * that was one static placeholder file with no JavaScript in it. It rewrote a
 * support-chat mockup that read "fixed. it was the payment key." because
 * nobody could point to the incident.
 *
 * Three things were cut from the previous site under this rule and must not
 * come back without something real behind them:
 *
 *   - "48 hrs first live build"   an intention adopted 2026-09-03, never performed
 *   - SPOTS_LEFT: 2               a hand-set integer dressed as scarcity
 *   - Halo / Lumen Interiors      a case study with no case behind it
 *
 * Every number on this page is either a price the studio sets, or a figure
 * measured by scripts/perf.mjs and read from proof.json at runtime. There is
 * no third category.
 * ---------------------------------------------------------------------------
 */
window.NB = {

  studio: {
    name: 'Northbound Studio',
    where: 'Grand Ledge, Michigan',
    /* Two people. Saying "team" or "we, a collective of" would be the first
       lie on the page, and the whole site is an argument against telling it. */
    who: 'Two people. Design and engineering, and a brand designer.',
    email: 'hello@northbound-dev.com'
  },

  /* Act I — the horizon. */
  arrival: {
    wordmark: 'Northbound',
    line: 'We build the machine that brings customers in.',
    /* Not "sites that sell while you sleep". That was a promise about the
       visitor's revenue made by people who had never run their business. This
       one is a description of what is actually sold. */
    sub: 'The website is the front of it. The booking, the follow-up, the payments and the dashboard behind it are the part that pays for itself.'
  },

  /* Act II — the market, honestly framed. Forty is the size of the outreach
     list, not a statistic about anyone's industry. */
  drift: {
    head: 'Most of them are dark.',
    body: 'Forty businesses within driving distance of this desk. Almost every one has a page that loads slowly, cannot take a booking, and forgets the customer the moment they leave it. That is the whole opportunity, and it is not a hard one to see.'
  },

  /* Act III — the offer. Prices are floors, published so the conversation
     starts above the tire-kickers rather than below them. */
  packages: [
    {
      name: 'Beacon',
      price: '$3,500',
      tagline: 'For the business that just needs to look real.',
      items: [
        'Custom-built site, up to five pages, no template',
        'Brand identity: logo, type, colour',
        'Copywriting, photography direction, local SEO',
        'Two weeks, 50% up front'
      ]
    },
    {
      name: 'Engine',
      price: '$8,500',
      tagline: 'The site plus the machine behind it.',
      items: [
        'Everything in Beacon',
        'Booking or quote flow, payments, lead capture',
        'Automated follow-up, reminders, review requests',
        'Owner dashboard: where the calls came from and what they were worth',
        'Three to four weeks, 50% up front'
      ]
    },
    {
      name: 'Bearing',
      price: '$600',
      per: 'per month',
      tagline: 'Attached to every project. Never optional in the pitch.',
      items: [
        'Hosting, monitoring, backups, unlimited small edits',
        'Dashboard kept live, automations maintained and expanded',
        'Monthly report on calls, bookings and revenue',
        'Twelve-month term, billed monthly'
      ]
    }
  ],

  pricingNote: 'Published prices are a floor, not a ceiling. What a build is worth follows from what one new customer is worth to you, not from how many hours it takes us.',

  /* Act IV — the only two things that are real.
   *
   * Both are concept builds for invented businesses. Both are fully built and
   * deployed, with working server code behind them — that is why they are here
   * and Halo is not. Every label on the page says "concept build" because that
   * is what they are, and a visitor who discovers the truth later is a visitor
   * who was lied to.
   */
  work: [
    {
      direction: 'Atlas',
      business: 'Ridgeline Roofing',
      kind: 'Concept build — invented business',
      result: 'A trades site built around one job: booking the call.',
      /* Real: src/pages/api/book.ts in demos/atlas. It accepts a booking. */
      tech: 'Astro · real booking endpoint · static',
      href: '/demos/atlas',
      need: 'A new marketing site'
    },
    {
      direction: 'Vector',
      business: 'Marrow Coffee',
      kind: 'Concept build — invented business',
      result: 'A small storefront with real checkout and no plugin sprawl.',
      /* Real: src/pages/api/checkout.ts and api/webhook.ts in demos/vector.
         It creates a Stripe session and handles the webhook. */
      tech: 'Astro · Stripe checkout + webhook · static',
      href: '/demos/vector/',
      need: 'An online store'
    }
  ],

  /* The proof panel. Copy only — every figure is fetched from proof.json,
     which scripts/perf.mjs writes. If the harness has not run, this panel
     renders the labels and no numbers, which is the correct failure: an
     unmeasured claim does not appear. */
  proof: {
    head: 'The numbers on this page measured themselves.',
    body: 'Every figure below came out of scripts/perf.mjs, run against this URL under real DevTools throttling — a simulated 4G connection and a 4x CPU slowdown, on a 390x844 viewport. Not a Lighthouse estimate, and not typed by hand. A test fails the build if what is printed here drifts from what was measured.',
    stale: 'Not measured since the last change to this site.'
  },

  /* How the studio works. These are rules it sets for itself, stated as rules
     and never as a track record. */
  rules: [
    '50% up front, always. No deposit, no work.',
    'Every proposal includes Bearing. It is part of the build, not an upsell.',
    'Concept work is labelled as concept work. Every performance number is one we measured.',
    'Two builds at a time. A third means the price goes up or you go on a list.',
    'The rate only goes up. After every third signed client, the floor moves.'
  ],

  contact: {
    head: "Tell us what the job is.",
    body: 'The useful first question is what one new customer is worth to you, and how many more you want a month. The answer decides the build.',
    needs: ['A new marketing site', 'An online store', 'Booking and follow-up', 'Something else']
  }
};
