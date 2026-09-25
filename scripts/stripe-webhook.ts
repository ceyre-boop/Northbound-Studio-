#!/usr/bin/env bun
/* scripts/stripe-webhook.ts — register the Stripe webhook and store its
 * signing secret, in one command, without the secret ever being printed.
 *
 * Why this exists: api/checkout.ts only sends anyone to Stripe when BOTH
 * STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set (an unverifiable
 * payment is worse than none), and the signing secret is returned by Stripe
 * exactly once — at the moment the endpoint is created. Doing that by hand
 * means copying a live secret between two browser tabs. This does it in
 * process instead: Stripe's API creates the endpoint, the secret goes
 * straight down a pipe into `vercel env add`, and nothing sensitive reaches
 * the terminal, the scrollback, or a file.
 *
 * The Stripe secret key is read from the STRIPE_SECRET_KEY environment
 * variable, or prompted for with echo off. It is used for the two API calls
 * below and never stored.
 *
 * Usage:
 *   bun scripts/stripe-webhook.ts              # live mode (default)
 *   bun scripts/stripe-webhook.ts --key-file=… # read the key from a file
 *   bun scripts/stripe-webhook.ts --preview    # store on Vercel Preview instead
 *   bun scripts/stripe-webhook.ts --replace    # replace an endpoint already there
 *   bun scripts/stripe-webhook.ts --dry-run    # show what it would do
 *
 * After it succeeds the deployment must be replaced — a Vercel environment
 * variable only reaches deployments created after it was set — so finish with
 * `bun run ship`.
 */

const WEBHOOK_URL = 'https://northbound-dev.com/api/stripe-webhook';
const EVENT = 'checkout.session.completed';
const ENV_NAME = 'STRIPE_WEBHOOK_SECRET';
const STRIPE_API = 'https://api.stripe.com/v1/webhook_endpoints';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const target = args.has('--preview') ? 'preview' : 'production';

function say(line: string) {
  console.log(line);
}

function die(line: string): never {
  console.error(`\n✗ ${line}`);
  process.exit(1);
}

/* Three ways in, and none of them puts the key on screen or in shell
   history. A hidden prompt when there is a terminal to prompt at; the
   clipboard when there is not — which is the case inside an agent shell,
   where stdin is not a TTY and `read` returns instantly on EOF; and a file
   for anyone who would rather not trust either. */
function readKey(): string {
  const fromEnv = process.env.STRIPE_SECRET_KEY;
  if (fromEnv) {
    say('Using STRIPE_SECRET_KEY from the environment.');
    return fromEnv.trim();
  }

  const fileArg = process.argv.find((a) => a.startsWith('--key-file='));
  if (fileArg) {
    const path = fileArg.slice('--key-file='.length);
    const key = Bun.spawnSync(['cat', path], { stdout: 'pipe' }).stdout.toString().trim();
    if (!key) die(`Nothing readable in ${path}.`);
    say(`Read the key from ${path}. Delete that file when this is done.`);
    return key;
  }

  if (process.stdin.isTTY) {
    process.stderr.write('Stripe secret key (sk_live_… — not echoed): ');
    const res = Bun.spawnSync(['sh', '-c', 'read -rs k; printf %s "$k"'], {
      stdin: 'inherit',
      stdout: 'pipe',
      stderr: 'inherit',
    });
    process.stderr.write('\n');
    const key = res.stdout.toString().trim();
    if (!key) die('No key entered.');
    return key;
  }

  /* No terminal: take it from the clipboard. Copy the key in Stripe, run
     this, and it is never typed, echoed, or recorded anywhere. */
  const clip = Bun.spawnSync(['pbpaste'], { stdout: 'pipe' });
  const key = clip.stdout.toString().trim();
  if (!key) {
    die('No terminal to prompt at, and the clipboard is empty.\n' +
        '  Copy your Stripe secret key, then run this again —\n' +
        '  or pass --key-file=/path/to/a/file holding just the key.');
  }
  say('Took the key from the clipboard (not shown, not stored).');
  return key;
}

/* A live secret key sitting in the clipboard is the kind of thing that gets
   pasted into the wrong window an hour later. */
function clearClipboardIfUsed(used: boolean) {
  if (!used) return;
  Bun.spawnSync(['sh', '-c', 'printf "" | pbcopy']);
  say('Cleared the clipboard.');
}

function looksLikeAKey(key: string): boolean {
  return /^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(key);
}

async function stripe(
  key: string,
  path: string,
  init: { method?: string; body?: string } = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: init.body,
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (data.error ?? {}) as { message?: string; type?: string };
    die(`Stripe refused (${res.status}): ${err.message ?? err.type ?? 'no message'}`);
  }
  return data;
}

/* Hand the secret to the Vercel CLI down a pipe. It is never interpolated
   into a command line (that would put it in the process table) and never
   written to disk. */
async function storeInVercel(secret: string): Promise<void> {
  const proc = Bun.spawn(
    ['vercel', 'env', 'add', ENV_NAME, target, '--sensitive', '--force'],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  proc.stdin.write(secret);
  proc.stdin.end();
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    die(`vercel env add failed (exit ${code}):\n${err || out}`);
  }
}

async function alreadyThere(key: string): Promise<{ id: string; events: string[] } | null> {
  const list = await stripe(key, '?limit=100');
  const found = (list.data as Array<Record<string, unknown>> | undefined)?.find(
    (e) => e.url === WEBHOOK_URL,
  );
  if (!found) return null;
  return {
    id: String(found.id),
    events: (found.enabled_events as string[] | undefined) ?? [],
  };
}

function confirm(question: string): boolean {
  if (args.has('--yes') || args.has('--replace')) return true;
  if (!process.stdin.isTTY) {
    /* Nothing to prompt at. Saying "no" is the safe answer, but say why, or
       it looks like the script simply gave up. */
    say(`\n${question}`);
    say('  No terminal to answer at — re-run with --replace to say yes.');
    return false;
  }
  process.stderr.write(`${question} [y/N] `);
  const res = Bun.spawnSync(['sh', '-c', 'read -r a; printf %s "$a"'], {
    stdin: 'inherit',
    stdout: 'pipe',
    stderr: 'inherit',
  });
  process.stderr.write('\n');
  return /^y(es)?$/i.test(res.stdout.toString().trim());
}

say(`\nStripe webhook → ${WEBHOOK_URL}`);
say(`Event:            ${EVENT}`);
say(`Signing secret:   Vercel ${target}, as ${ENV_NAME} (sensitive)\n`);

if (dryRun) {
  say('--dry-run: nothing was contacted or changed.');
  process.exit(0);
}

const usedClipboard = !process.env.STRIPE_SECRET_KEY && !process.stdin.isTTY && !process.argv.some((a) => a.startsWith('--key-file='));
const key = readKey();
if (!looksLikeAKey(key)) {
  clearClipboardIfUsed(usedClipboard);
  die("That doesn't look like a Stripe secret key (expected sk_live_… or sk_test_…).\n" +
      '  Nothing was sent. If it came from the clipboard, copy the key and try again.');
}
if (key.startsWith('sk_test_') && target === 'production') {
  if (!confirm('That is a TEST key but you are writing to Production. Continue?')) {
    die('Stopped. Nothing was changed.');
  }
}

const existing = await alreadyThere(key);
if (existing) {
  say(`An endpoint for this URL already exists (${existing.id}, events: ${existing.events.join(', ') || 'none'}).`);
  say('Stripe only reveals a signing secret when an endpoint is created, so');
  say('getting one means replacing it. Nothing else in the account is touched.');
  if (!confirm('Delete that endpoint and create a fresh one?')) {
    die('Stopped. The existing endpoint is untouched, and no secret was stored.');
  }
  await stripe(key, `/${existing.id}`, { method: 'DELETE' });
  say(`Deleted ${existing.id}.`);
}

const created = await stripe(key, '', {
  method: 'POST',
  body: new URLSearchParams({
    url: WEBHOOK_URL,
    'enabled_events[]': EVENT,
    description: 'Northbound Studio — paid deposits become orders',
    api_version: '2024-06-20',
  }).toString(),
});

const secret = typeof created.secret === 'string' ? created.secret : '';
if (!secret.startsWith('whsec_')) {
  die('Stripe created the endpoint but returned no signing secret. Reveal it in the dashboard and add it by hand.');
}
say(`Created endpoint ${String(created.id)} (status: ${String(created.status)}).`);

await storeInVercel(secret);
say(`Stored the signing secret as ${ENV_NAME} on ${target}. It was never printed.`);

/* Prove it landed, by name only — `vercel env ls` never shows a sensitive
   value, which is the point. */
const check = Bun.spawnSync(['vercel', 'env', 'ls', target], { stdout: 'pipe', stderr: 'pipe' });
const listed = check.stdout.toString().includes(ENV_NAME);
say(listed ? `Confirmed: ${ENV_NAME} is set on ${target}.` : `Warning: ${ENV_NAME} is not showing in \`vercel env ls ${target}\` yet.`);

clearClipboardIfUsed(usedClipboard);

say('\nOne step left — the variable only reaches a new deployment:');
say('  bun run ship\n');
