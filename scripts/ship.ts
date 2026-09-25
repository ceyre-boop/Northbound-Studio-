#!/usr/bin/env bun
/**
 * scripts/ship.ts — the only way to deploy production from now on.
 *
 *   bun run ship
 *   bun run ship --remeasure   # force the re-measure in step 4 even if the
 *                              # published artifact already covers this commit
 *
 * A plain `vercel --prod` is refused at build time: vercel.json's buildCommand
 * fails any production build that arrives without data/release.json, and
 * this script deletes that stamp when it finishes, so the only way to have
 * one is to be inside a ship. That is what keeps the re-measure part of the
 * deploy rather than a command someone has to remember. And if a stale stamp
 * ever did get through, js/proof.js still refuses to show the section unless
 * data/perf-budget.json's codeCommit matches data/release.json's exactly —
 * the failure mode is no section, never a stale one.
 *
 * The seven steps, in order:
 *
 *   1. Preflight — must be on `main`, working tree clean, in sync with
 *      origin/main.
 *   2. Write data/release.json ({ codeCommit, deployedAt }) and deploy to
 *      production. The section is hidden from the moment this deploy goes
 *      live until step 6, because the artifact on disk still describes the
 *      previous deploy. That gap (~5 min) is the truth, not a bug.
 *   3. Poll https://northbound-dev.com/data/release.json until it serves
 *      the codeCommit just deployed.
 *   4. Re-measure production: `bun scripts/perf.mjs --emit
 *      https://northbound-dev.com/`. This writes a fresh
 *      data/perf-budget.json stamped with the same codeCommit. Skipped when
 *      the published artifact's codeCommit already equals this ship's
 *      codeCommit — nothing under index.html, js/, css/ or studio.html changed since the
 *      last measurement, so it still describes this deploy. `--remeasure`
 *      forces it anyway.
 *   5. Commit ONLY data/perf-budget.json ("Re-measure from production") and
 *      push the current branch. Also skipped when step 4 was skipped —
 *      there is nothing new to commit.
 *   6. Deploy again. Nothing but the artifact changed, so this is the same
 *      codeCommit shipped a second time — now the two stamps agree and the
 *      section shows.
 *   7. Fetch both JSONs from production, assert the codeCommits match, and
 *      print the gate table. Exits nonzero if anything failed — including a
 *      perf gate failure, which is reported loudly but does not block the
 *      publish, because the measurement it is reporting is real.
 */

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_PATH = join(ROOT, 'data', 'release.json');
const ARTIFACT_PATH = join(ROOT, 'data', 'perf-budget.json');
const PROD_URL = 'https://northbound-dev.com/';
// The frame-budget/proof section lives on the WebGL page, which now sits at
// /studio.html rather than the site root — the measurement has to describe
// the page it's published on. release.json's poll and the artifact fetch in
// verify() stay at the site root; only the re-measure step below targets it.
const PERF_URL = `${PROD_URL}studio.html`;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

function log(step: string, msg: string) {
  console.log(`\n[ship ${step}] ${msg}`);
}

/* The stamp exists only for the length of a ship. Leaving it on disk would let
   a later bare `vercel --prod` past the build guard in vercel.json. */
function clearRelease() {
  rmSync(RELEASE_PATH, { force: true });
}

/* Ctrl-C, a closed terminal or a kill would otherwise skip every cleanup path
   above and leave the stamp on disk, where it would wave a later bare
   `vercel --prod` straight past the build guard with a stale measurement. */
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => {
    clearRelease();
    console.error(`\n[ship] interrupted (${sig}) — stamp cleared, production is whatever the last completed step left.`);
    process.exit(130);
  });
}

function fail(msg: string): never {
  clearRelease();
  console.error(`\n[ship] FAILED — ${msg}`);
  process.exit(1);
}

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/** Run a command with inherited stdio so the caller sees vercel/perf output
 *  live, and throw with a clear message on a nonzero exit. */
function run(cmd: string, args: string[], label: string) {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    fail(`${label} exited with code ${result.status ?? 'unknown'} (signal ${result.signal ?? 'none'})`);
  }
}

// --- step 1: preflight -----------------------------------------------------

function preflight() {
  log('1/7', 'preflight — branch, working tree, sync with origin');

  const branch = git('rev-parse --abbrev-ref HEAD');
  if (branch !== 'main') {
    fail(`must be on main to ship, currently on ${branch}`);
  }

  const status = git('status --porcelain');
  if (status) {
    fail(`working tree is not clean:\n${status}`);
  }

  git('fetch origin main');
  const local = git('rev-parse main');
  const remote = git('rev-parse origin/main');
  if (local !== remote) {
    fail(`main (${local}) is not in sync with origin/main (${remote}) — pull or push first`);
  }

  log('1/7', 'ok — on main, clean, in sync with origin');
}

// --- step 2: write release.json + deploy ------------------------------------

function codeCommit(): string {
  /* --first-parent, because a plain path-limited log skips merge commits:
     the hero scene arrived on a merge and the stamp stayed on the commit
     before it. And index.html, because that is the page this script
     actually measures — leaving it out meant a homepage rendering change
     could publish numbers taken before it. */
  return git('log -1 --first-parent --format=%h -- index.html js css studio.html');
}

function writeRelease(commit: string) {
  const release = { codeCommit: commit, deployedAt: new Date().toISOString() };
  mkdirSync(dirname(RELEASE_PATH), { recursive: true });
  writeFileSync(RELEASE_PATH, JSON.stringify(release, null, 2) + '\n');
  log('2/7', `wrote data/release.json — codeCommit ${commit}`);
  return release;
}

function deployProd() {
  log('2/7 or 6/7', 'vercel deploy --prod');
  run('vercel', ['deploy', '--prod', '--yes'], 'vercel deploy --prod');
}

// --- step 3: poll release.json on production --------------------------------

async function pollRelease(expectedCommit: string) {
  log('3/7', `polling ${PROD_URL}data/release.json for codeCommit ${expectedCommit}`);
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastSeen = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${PROD_URL}data/release.json?bust=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { codeCommit?: string };
        lastSeen = data.codeCommit ?? '';
        if (lastSeen === expectedCommit) {
          log('3/7', `production is serving codeCommit ${lastSeen}`);
          return;
        }
      }
    } catch {
      // transient — keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  fail(`timed out after ${POLL_TIMEOUT_MS / 1000}s waiting for release.json to carry ${expectedCommit} (last seen: ${lastSeen || 'nothing'})`);
}

// --- step 4: re-measure production ------------------------------------------

function reMeasure() {
  log('4/7', `bun scripts/perf.mjs --emit ${PERF_URL}`);
  // perf.mjs exits 1 on a gate failure. That is a real result, not a script
  // error — it still writes the artifact, so ship keeps going and reports
  // the failure loudly at the end rather than aborting the publish.
  const result = spawnSync('bun', ['scripts/perf.mjs', '--emit', PERF_URL], { cwd: ROOT, stdio: 'inherit' });
  const gatesFailed = result.status !== 0;
  if (gatesFailed) {
    console.warn('\n[ship 4/7] one or more perf gates FAILED — the measurement is still real and will still publish.');
  }
  return { gatesFailed };
}

/** The codeCommit the currently-published artifact describes, or null if
 *  there is no artifact on disk yet (first ship, or a clean checkout). */
function publishedCodeCommit(): string | null {
  if (!existsSync(ARTIFACT_PATH)) return null;
  try {
    const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8'));
    return artifact.codeCommit ?? null;
  } catch {
    return null;
  }
}

// --- step 5: commit + push the artifact -------------------------------------

function commitArtifact() {
  log('5/7', 'committing data/perf-budget.json');
  const status = git('status --porcelain -- data/perf-budget.json');
  if (!status) {
    log('5/7', 'no change to data/perf-budget.json — nothing to commit');
    return;
  }
  execSync('git add data/perf-budget.json', { cwd: ROOT });
  execSync('git commit -m "Re-measure from production"', { cwd: ROOT, stdio: 'inherit' });
  const branch = git('rev-parse --abbrev-ref HEAD');
  execSync(`git push origin ${branch}`, { cwd: ROOT, stdio: 'inherit' });
  log('5/7', `pushed ${branch}`);
}

// --- step 7: verify + report -------------------------------------------------

async function verify(expectedCommit: string) {
  log('7/7', 'fetching both JSONs from production');
  const [artifactRes, releaseRes] = await Promise.all([
    fetch(`${PROD_URL}data/perf-budget.json?bust=${Date.now()}`, { cache: 'no-store' }),
    fetch(`${PROD_URL}data/release.json?bust=${Date.now()}`, { cache: 'no-store' }),
  ]);
  if (!artifactRes.ok || !releaseRes.ok) {
    fail(`could not fetch both JSONs from production (artifact: ${artifactRes.status}, release: ${releaseRes.status})`);
  }
  const artifact = await artifactRes.json();
  const release = await releaseRes.json();

  const match = artifact.codeCommit && artifact.codeCommit === release.codeCommit && artifact.codeCommit === expectedCommit;
  console.log('\n--- gates -------------------------------------------------------------');
  const gates = (artifact.gates || []) as Array<{ key: string; label: string; thresholdLabel?: string; detail: string; pass: boolean }>;
  let anyGateFailed = false;
  for (const g of gates) {
    const status = g.pass ? 'PASS' : 'FAIL';
    if (!g.pass) anyGateFailed = true;
    console.log(`${status.padEnd(6)}  ${g.label}  —  ${g.detail}`);
  }
  console.log('-------------------------------------------------------------------------');

  if (!match) {
    fail(`codeCommit mismatch — artifact: ${artifact.codeCommit}, release: ${release.codeCommit}, expected: ${expectedCommit}`);
  }
  log('7/7', `production codeCommits match (${artifact.codeCommit}) — perf section will render`);

  return anyGateFailed;
}

// --- main --------------------------------------------------------------------

async function main() {
  const forceRemeasure = process.argv.includes('--remeasure');

  preflight();

  const commit = codeCommit();
  writeRelease(commit);
  deployProd();

  await pollRelease(commit);

  let gatesFailed = false;
  const published = publishedCodeCommit();
  if (!forceRemeasure && published === commit) {
    log('4/7', `rendering code unchanged since ${commit} — the published measurement still describes this deploy. Skipping re-measure.`);
    log('5/7', 'skipped — step 4 was skipped, so there is nothing new to commit');
  } else {
    ({ gatesFailed } = reMeasure());
    commitArtifact();
  }

  deployProd();

  const artifactCheck = readFileSync(ARTIFACT_PATH, 'utf8');
  const parsed = JSON.parse(artifactCheck);
  if (parsed.codeCommit !== commit) {
    fail(`local artifact codeCommit (${parsed.codeCommit}) does not match the deploy just shipped (${commit})`);
  }

  const gatesFailedInProd = await verify(commit);
  clearRelease();

  if (gatesFailed || gatesFailedInProd) {
    console.error('\n[ship] published successfully, but one or more perf gates FAILED. See the table above.');
    process.exit(1);
  }

  console.log('\n[ship] done — production is live, measured, and every gate passed.');
  process.exit(0);
}

main().catch((err) => {
  clearRelease();
  console.error('[ship] crashed:', err);
  process.exit(1);
});
