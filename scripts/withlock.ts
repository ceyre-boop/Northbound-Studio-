#!/usr/bin/env bun
/**
 * scripts/withlock.ts — an exclusive run lock for this repo.
 *
 *   bun scripts/withlock.ts <command> [args...]
 *
 * Three Claude Code sessions on this machine were all running
 * `bunx playwright test` against the one hardcoded dev server at once.
 * Concurrent runs starved each other's frame timing into false failures and
 * fake multi-minute timeouts that got re-run as if they were regressions.
 * This wraps a command in a single system-wide lock so only one heavy run
 * (test, perf, ship) happens against this repo at a time.
 *
 * The lock is a directory made with an atomic mkdirSync, kept OUTSIDE the
 * repo (under the OS temp dir, keyed to this repo's absolute path) so a
 * stray lock can never be committed or shipped. Inside it: pid, command and
 * an ISO timestamp, so a second caller can say who holds it and what they're
 * running rather than just "busy".
 *
 * The lock is released on every exit path — normal exit, SIGINT/SIGTERM/
 * SIGHUP, and an uncaught exception — and the child's exit code is this
 * process's exit code.
 *
 * NB_NO_LOCK=1        bypass the lock entirely (a human who knows what they're doing)
 * NB_LOCK_TIMEOUT_MS  how long to wait for a held lock before giving up (default 30 min)
 */

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const REPO_ROOT = process.cwd();
const LOCK_DIR = join(tmpdir(), `nb-lock-${createHash('sha256').update(REPO_ROOT).digest('hex').slice(0, 16)}`);
const HOLDER_FILE = join(LOCK_DIR, 'holder.json');

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

function timeoutMs(): number {
  const raw = process.env.NB_LOCK_TIMEOUT_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

type Holder = { pid: number; command: string; startedAt: string };

function readHolder(): Holder | null {
  try {
    return JSON.parse(readFileSync(HOLDER_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/** true if a process with this pid is alive (signal 0 is a liveness probe, not a kill). */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e.code !== 'ESRCH';
  }
}

function releaseLock() {
  try {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  } catch {
    // best effort — nothing more useful to do on the way out
  }
}

/** Try to atomically create the lock dir. Returns true on success. */
function tryAcquire(command: string): boolean {
  try {
    mkdirSync(LOCK_DIR); // no `recursive: true` — that would make this non-atomic
    writeFileSync(HOLDER_FILE, JSON.stringify(
      { pid: process.pid, command, startedAt: new Date().toISOString() } satisfies Holder,
      null,
      2,
    ) + '\n');
    return true;
  } catch (e: any) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
}

/** Detect a lock whose holder process is dead, and take it over. */
function reclaimIfStale(): boolean {
  const holder = readHolder();
  if (!holder) {
    // Lock dir exists but holder.json doesn't (crashed mid-acquire) — stale.
    console.log(`[withlock] found an empty stale lock at ${LOCK_DIR} — taking it over.`);
    releaseLock();
    return true;
  }
  if (!isAlive(holder.pid)) {
    console.log(
      `[withlock] lock held by pid ${holder.pid} (${holder.command}) since ${holder.startedAt} — ` +
      `that process is no longer running. Stale lock, taking it over.`,
    );
    releaseLock();
    return true;
  }
  return false;
}

async function acquireLock(command: string): Promise<void> {
  if (tryAcquire(command)) return;

  const deadline = Date.now() + timeoutMs();
  let announced = false;

  while (Date.now() < deadline) {
    if (reclaimIfStale() && tryAcquire(command)) return;

    const holder = readHolder();
    if (!announced) {
      if (holder) {
        console.log(
          `[withlock] waiting on lock held by pid ${holder.pid} running "${holder.command}" since ${holder.startedAt}...`,
        );
      } else {
        console.log('[withlock] waiting on lock...');
      }
      announced = true;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    if (tryAcquire(command)) return;
  }

  const holder = readHolder();
  throw new Error(
    `timed out after ${timeoutMs()}ms waiting for the lock` +
    (holder ? ` (still held by pid ${holder.pid}: "${holder.command}")` : ''),
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('usage: bun scripts/withlock.ts <command> [args...]');
    process.exit(2);
  }
  const commandLabel = args.join(' ');

  if (process.env.NB_NO_LOCK === '1') {
    console.log('[withlock] NB_NO_LOCK=1 — bypassing the lock.');
    const code = await runChild(args);
    process.exit(code);
  }

  let acquired = false;
  const cleanup = () => {
    if (acquired) releaseLock();
  };

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => {
      cleanup();
      process.exit(130);
    });
  }
  process.on('uncaughtException', (err) => {
    console.error('[withlock] uncaught exception:', err);
    cleanup();
    process.exit(1);
  });

  try {
    await acquireLock(commandLabel);
    acquired = true;
  } catch (err: any) {
    console.error(`[withlock] ${err.message}`);
    process.exit(1);
  }

  let code = 1;
  try {
    code = await runChild(args);
  } finally {
    cleanup();
  }
  process.exit(code);
}

function runChild(args: string[]): Promise<number> {
  const [cmd, ...rest] = args;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, rest, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        // Mirror the conventional 128+signal exit code.
        const sigNum = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }[signal] ?? 1;
        resolve(128 + sigNum);
      } else {
        resolve(code ?? 1);
      }
    });
  });
}

main();
