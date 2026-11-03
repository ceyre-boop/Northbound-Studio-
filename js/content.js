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
    /* Saying "team" or "we, a collective of" would be the first lie on the
       page, and the whole site is an argument against telling it. */
    who: 'Design, engineering and brand under one roof.',
    email: 'hello@northbound-dev.com'
  },

  /* Act I — the horizon. */
  arrival: {
    wordmark: 'Northbound',
    line: 'Finished products, already built. Buy one.',
    sub: "A roofer's site. A shop. A booking and follow-up system with a dashboard. Each one is built and working before you buy it, then set up with your name, your photos and your prices."
  },

  /* Act II — the market, honestly framed. No count, no desk — just what a
     dark local website actually costs its owner. */
  drift: {
    head: 'Most local websites just sit there.',
    body: "They load slowly, can't take a booking, and forget the customer the moment they leave."
  },

  /* Act III — the offer. Three finished products. Prices are "Price on
     request" until Colin sets them: add `price: '$X'` here and in studio.html. */
  packages: [
    {
      name: 'Atlas',
      price: null,
      tagline: 'A website for a roofing company.',
      items: [
        'Built and working, labelled concept work: /demos/atlas',
        'Set up with your name, photos and prices'
      ]
    },
    {
      name: 'Vector',
      price: null,
      tagline: 'An online shop for a small brand.',
      items: [
        'Built and working, labelled concept work: /demos/vector',
        'Set up with your name, products and prices'
      ]
    },
    {
      name: 'Booking kit',
      price: null,
      tagline: 'Booking, follow-up and a dashboard.',
      items: [
        'Booking or quote flow, payments, lead capture',
        'Automated follow-up, reminders, review requests',
        'Owner dashboard: where the calls came from, what they were worth'
      ]
    }
  ],

  pricingNote: 'Prices are stated before you pay. Ask and you get a number, not a sales call.',

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
      tech: 'Online booking · no lost leads',
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
      tech: 'Online store · card checkout',
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
    'You see the finished product working before you buy it.',
    'The price is stated before you pay.',
    'Concept work is labelled as concept work. Every performance number is one we measured.'
  ],

  contact: {
    head: "Tell us what the job is.",
    body: 'The useful first question is what one new customer is worth to you, and how many more you want a month. The answer decides the build.',
    needs: ['A new marketing site', 'An online store', 'Booking and follow-up', 'Something else']
  }
};
