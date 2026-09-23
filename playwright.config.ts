import { defineConfig, devices } from '@playwright/test';

// One port per session, not one hardcoded port for the whole machine. Several
// Claude Code sessions run this suite against this repo at once; without
// NB_PORT they all fight over :8099 and each other's dev server.
const PORT = Number(process.env.NB_PORT ?? 8099);

/* The site is static: serve the repo root and drive it. */
export default defineConfig({
  testDir: './tests',
  // Four hand-written WebGL acts sharing one rAF: parallel workers starve each
  // other's frame timing into false failures. Serial is honest.
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    // Threaded AND gzipping — see the module docstring in scripts/serve.py.
    // The stdlib one-liner this replaces served text assets raw, so every
    // throttled measurement was made against a page about four times heavier
    // than the one production serves, and the slow-4G LCP test was passing on
    // margin rather than on merit.
    command: `python3 scripts/serve.py ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
    timeout: 20_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', hasTouch: true },
    },
    {
      name: 'desktop-reduced',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' },
    },
  ],
});
