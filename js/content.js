/* Northbound — the words.
 *
 * Single source for every string on the site, so five specialists compose
 * against one file instead of retyping prose out of markup. The voice is
 * carried over verbatim from the previous site; only two things changed, both
 * because they had to:
 *
 *   1. Buddy's lines referenced a cable and an elevator ("ride the cable down",
 *      "I live inside the cable"). That conceit is deleted, so the references
 *      would have pointed at nothing.
 *   2. One Buddy line promised "two weeks" while every other surface on the
 *      site promises 48 hours. That contradiction was live in production.
 */
export const CONTENT = {
  promise: {
    lede: "Design and development for small businesses that want to stand out online. Live in 48 hours. From $1,500. Text us when something breaks.",
    hero: "Sites that sell while you sleep."
  },

  work: {
    heading: "Three concept builds. Open any of them.",
    lede: "Invented businesses, built end to end to show how we work. No borrowed logos, no numbers we cannot stand behind."
  },

  speed: {
    heading: "Live in 48 hours.",
    body: "Most agencies quote six weeks. Your first live build is up within 48 hours of kickoff, and we only take 2–3 projects a month so yours never sits in a queue."
  },

  price: {
    heading: "Most agencies charge $5,000+.",
    body: "From $1,500. Fixed price, quoted before we start, and it does not move. $99 a month keeps it hosted, updated and monitored. Cancel any time. AI intake, auto-responders and CRM hookups from $500."
  },

  support: {
    heading: "We don't disappear after launch.",
    body: "Something breaks? Text us. We fix it.",
    exchange: [
      { from: "you",   text: "our checkout page is down 😳" },
      { from: "buddy", text: "on it. give me nine minutes." },
      { from: "buddy", text: "fixed. it was a Stripe setting." }
    ]
  },

  contact: {
    heading: "Let's build yours.",
    // spotsLine() supplies the leading sentence from js/site-config.js
    body: "Tell us what you sell and we'll get back to you within the day.",
    options: [
      "A new marketing site",
      "An online store",
      "A rebuild of what I have",
      "Something with motion or 3D"
    ],
    submit: "Send project details",
    success: "SENT — BUDDY IS ON IT"
  },

  // Same voice, same jokes, minus a metaphor that no longer exists — and
  // without the "two weeks" line that contradicted the 48-hour promise.
  buddy: [
    "Hello friend! I am BUDDY, unit 04, and I will be building your website today. Stay with me — I will explain everything as we go.",
    "This is what I make. Marketing sites, storefronts, booking flows. I enjoy all of them. Some more than others, but I am not going to say which.",
    "Forty-eight hours. I have run the numbers 4,000 times and forty-eight hours is correct. I do not sleep, which helps a great deal.",
    "Fifteen hundred dollars. My friends at the big agencies charge five thousand. I have no overhead — I am made of maths.",
    "If something breaks, you text me. I fix it. That is the whole support policy and I am very proud of it.",
    "BUDDY, our intake assistant, replies within the hour. A human follows up the same day."
  ],

  studio: { name: "Northbound Studio", place: "Grand Ledge, MI → Worldwide" }
};
