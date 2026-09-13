/* The twelve offerings.
 *
 * Everything the procession says lives here, and it obeys the same rule as the
 * rest of the site (see the header of js/content.js): no result, no metric and
 * no price that did not happen.
 *
 * Two consequences of that rule are visible below and both are deliberate:
 *
 *   - Offering 12 carries NO PRICE. The launch plan has no AI tier, and the
 *     previous site's "AI add-ons from $500" was a number adopted one afternoon
 *     and never charged to anyone. It is labelled an add-on and quoted per job.
 *   - Bearing appears as a MAINTENANCE line, on the four offerings it actually
 *     keeps running, rather than as a package that "includes" a feature.
 *     Bearing is a retainer, not a feature list, and saying so where it is true
 *     is the whole retainer argument in four words.
 *
 * `owner` is the sentence that says what this does for the person paying for
 * it, not what it is. "Answers at nine on a Sunday" beats "automated response
 * system" every time, and the difference is the entire pitch.
 *
 * `loop` is the brief for the GLSL loop in js/gl/offering-loops.js. It is
 * here, next to the copy, so the animation and the sentence cannot drift apart.
 */
export const OFFERINGS = [
  {
    id: 'site',
    n: '01',
    name: 'A custom site',
    package: 'Beacon',
    owner: 'A site built for your business rather than adapted from someone else’s, so it says what you do in the first five seconds.',
    loop: 'Scattered rule-lines drifting, then assembling into a grid that holds'
  },
  {
    id: 'brand',
    n: '02',
    name: 'Brand identity',
    package: 'Beacon',
    owner: 'A logo, a typeface and a colour that work on a van, a business card and a phone screen without being redrawn each time.',
    loop: 'Three marks resolving out of noise and settling into one lockup'
  },
  {
    id: 'booking',
    n: '03',
    name: 'Booking flow',
    package: 'Engine',
    owner: 'Customers pick a time themselves, at eleven at night, without anyone answering a phone.',
    loop: 'Time slots locking into a grid, one of them turning solid'
  },
  {
    id: 'quote',
    n: '04',
    name: 'Quote flow',
    package: 'Engine',
    owner: 'People tell you what the job is before you drive out to look at it, so you quote the ones worth quoting.',
    loop: 'A wide range converging inward until it resolves to one figure'
  },
  {
    id: 'payments',
    n: '05',
    name: 'Payments',
    package: 'Engine',
    owner: 'Deposits land before the work starts, which is the rule that prevents most of the ways small projects go wrong.',
    loop: 'A value pulse travelling along a line and resolving at the end'
  },
  {
    id: 'leads',
    n: '06',
    name: 'Lead capture',
    package: 'Engine',
    owner: 'The people who almost called you leave a name instead of leaving.',
    loop: 'Drifting motes caught and held by a soft field'
  },
  {
    id: 'followup',
    n: '07',
    name: 'Automated follow-up',
    package: 'Engine',
    upkeep: 'Bearing',
    owner: 'Every enquiry gets an answer within a minute, including the ones that arrive while you are on a roof.',
    loop: 'A signal chasing a thread until it catches and lands'
  },
  {
    id: 'reminders',
    n: '08',
    name: 'Reminders',
    package: 'Engine',
    upkeep: 'Bearing',
    owner: 'Fewer no-shows, because the appointment reminds them and not you.',
    loop: 'A slow orbit crossing a threshold and flaring as it passes'
  },
  {
    id: 'reviews',
    n: '09',
    name: 'Review requests',
    package: 'Engine',
    upkeep: 'Bearing',
    owner: 'The review gets asked for at the one moment the customer is happiest, every time, without you remembering.',
    loop: 'A star figure completing itself one stroke at a time'
  },
  {
    id: 'dashboard',
    n: '10',
    name: 'Owner dashboard',
    package: 'Engine',
    upkeep: 'Bearing',
    owner: 'One screen that says where the calls came from and what they were worth, so you stop guessing which advert works.',
    loop: 'Metrics settling into bars, then breathing'
  },
  {
    id: 'seo',
    n: '11',
    name: 'Local SEO',
    package: 'Beacon',
    owner: 'You turn up when someone two towns over searches for what you do.',
    loop: 'A pin pulling attention inward from the edges of the frame'
  },
  {
    id: 'intake',
    n: '12',
    name: 'AI intake and auto-responder',
    /* No package and no price. See the header. */
    package: null,
    addOn: 'Add-on — quoted per job',
    owner: 'Enquiries get read, sorted and answered in your voice before you have opened the laptop.',
    loop: 'A question folding into an answer and unfolding again'
  }
];

/** The copy around the procession. */
export const OFFER_COPY = {
  eyebrow: 'What we sell',
  head: 'Twelve things, and what each one does for you.',
  lede: 'The website is the front of it. These are the parts behind it — the ones that answer, quote, book, take the deposit and remember to ask for the review. Scroll through them, or open any one.',
  addLabel: 'Add to my project',
  addedLabel: 'Added',
  cartHead: 'On your project',
  cartEmpty: 'Nothing added yet. Open any offering above and add it here.'
};
