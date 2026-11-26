#!/usr/bin/env bun
/* scripts/license.ts — license keys from the command line (api/license-admin.ts does the work).
 *
 *   bun scripts/license.ts sell "Booth Plumbing" --apps lead-catcher,invoice-chaser --monthly 250
 *        a payment link for a $250/month plan; when they pay, the key is made and emailed to them
 *   bun scripts/license.ts issue "Booth Plumbing" --apps all [--days 2] [--email owner@…]
 *        a key with no payment (a trial with --days, a comp without); printed here, not emailed
 *   bun scripts/license.ts revoke NB-XXXXX-… [--reason "…"]    switch it off
 *   bun scripts/license.ts restore NB-XXXXX-…                  switch it back on
 *   bun scripts/license.ts extend NB-XXXXX-… --days 30          a trial or comp runs 30 more days
 *   bun scripts/license.ts show NB-XXXXX-…                      what it unlocks right now
 *   bun scripts/license.ts list                                 every automations customer
 *
 *   bun scripts/license.ts setup        once: make the signing key and the admin token, save them to
 *                                       ~/northbound/.env and Vercel Production. No value is ever printed.
 *   bun scripts/license.ts public-key   the public key a client copy of the launcher is built with
 *
 * The admin token is read from NB_LICENSE_ADMIN_TOKEN or ~/northbound/.env. NB_LICENSE_ADMIN_URL points it at
 * another deployment (default https://northbound-dev.com).
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { publicKeyOf } from '../lib/license.ts';

const ENV_FILE = join(homedir(), 'northbound', '.env');
const SITE = join(homedir(), 'Northbound-Studio-'); // the checkout linked to the Vercel project
const BASE = process.env.NB_LICENSE_ADMIN_URL || 'https://northbound-dev.com';

function envFile(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const fromEnv = (name: string) => process.env[name] || envFile()[name] || '';

function die(msg: string): never { console.error(msg); process.exit(1); }

const argv = process.argv.slice(2);
const cmd = argv[0] ?? '';
const flags: Record<string, string> = {};
const words: string[] = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags[k] = v ?? argv[++i] ?? ''; }
  else words.push(a);
}

async function setup() {
  const have = envFile();
  if (have.NB_LICENSE_SIGNING_KEY && !flags.force) die('NB_LICENSE_SIGNING_KEY is already in ~/northbound/.env. Making a new one would lock every client copy built with the old public key. Pass --force only if that is what you want.');
  const seed = randomBytes(32).toString('base64url');
  const token = randomBytes(32).toString('base64url');
  const lines = readFileSync(ENV_FILE, 'utf8').split('\n').filter((l) => !/^(NB_LICENSE_SIGNING_KEY|NB_LICENSE_ADMIN_TOKEN)=/.test(l));
  while (lines.length && lines.at(-1) === '') lines.pop();
  lines.push(`NB_LICENSE_SIGNING_KEY=${seed}`, `NB_LICENSE_ADMIN_TOKEN=${token}`, '');
  writeFileSync(ENV_FILE, lines.join('\n'));
  chmodSync(ENV_FILE, 0o600);
  console.log('Saved NB_LICENSE_SIGNING_KEY and NB_LICENSE_ADMIN_TOKEN to ~/northbound/.env (mode 600).');
  for (const [name, value] of [['NB_LICENSE_SIGNING_KEY', seed], ['NB_LICENSE_ADMIN_TOKEN', token]] as const) {
    const add = Bun.spawnSync(['vercel', 'env', 'add', name, 'production', '--sensitive', '--force', '--yes', '--cwd', SITE], { stdin: new TextEncoder().encode(value), stdout: 'pipe', stderr: 'pipe' });
    if (add.exitCode !== 0) die(`vercel env add ${name} failed: ${add.stderr.toString().split('\n').filter(Boolean).slice(-2).join(' ')}`);
    console.log(`Saved ${name} to Vercel Production.`);
  }
  console.log(`\nPublic key (safe to share; build the client launcher with it):\n${publicKeyOf(seed)}`);
  console.log('\nA Vercel variable only reaches deployments made after it was set: ship the site next.');
}

async function call(body: Record<string, unknown>) {
  const token = fromEnv('NB_LICENSE_ADMIN_TOKEN');
  if (!token) die('No NB_LICENSE_ADMIN_TOKEN (run `bun scripts/license.ts setup` once).');
  const res = await fetch(`${BASE}/api/license-admin`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) die(`${res.status}: ${data.error ?? 'error'}`);
  return data;
}

function print(d: Record<string, any>) {
  if (Array.isArray(d.licenses)) {
    if (!d.licenses.length) return console.log('No automations customers yet.');
    for (const l of d.licenses) console.log(`${l.key}  ${String(l.status).padEnd(8)}  ${l.business}${l.email ? ` <${l.email}>` : ''}  ${l.apps.join(',') || '-'}${l.until ? `  until ${l.until.slice(0, 10)}` : ''}`);
    return;
  }
  for (const [k, v] of Object.entries(d)) console.log(`${k.padEnd(14)} ${typeof v === 'object' ? JSON.stringify(v) : v}`);
}

const key = words[0];
switch (cmd) {
  case 'setup': await setup(); break;
  case 'public-key': { const s = fromEnv('NB_LICENSE_SIGNING_KEY'); if (!s) die('No NB_LICENSE_SIGNING_KEY yet: run setup.'); console.log(publicKeyOf(s)); break; }
  case 'sell': print(await call({ action: 'sell', business: words.join(' '), apps: flags.apps, monthly: Number(flags.monthly), email: flags.email })); break;
  case 'issue': print(await call({ action: 'issue', business: words.join(' '), apps: flags.apps, days: flags.days, email: flags.email })); break;
  case 'revoke': print(await call({ action: 'revoke', key, reason: flags.reason })); break;
  case 'restore': case 'show': print(await call({ action: cmd, key })); break;
  case 'extend': print(await call({ action: 'extend', key, days: Number(flags.days) })); break;
  case 'list': print(await call({ action: 'list' })); break;
  default: die(readFileSync(import.meta.path, 'utf8').split('\n').slice(1, 20).map((l) => l.replace(/^ \*\/?\s?/, '')).join('\n'));
}
