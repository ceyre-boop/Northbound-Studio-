import { defineConfig, devices } from '@playwright/test';

/* The site is static: serve the repo root and drive it. */
export default defineConfig({
  testDir: './tests',
  // Four hand-written WebGL acts sharing one rAF: parallel workers starve each
  // other's frame timing into false failures. Serial is honest.
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8099' },
  webServer: {
    // Threaded AND gzipping — see the module docstring in scripts/serve.py.
    // The stdlib one-liner this replaces served text assets raw, so every
    // throttled measurement was made against a page about four times heavier
    // than the one production serves, and the slow-4G LCP test was passing on
    // margin rather than on merit.
    command: 'python3 scripts/serve.py 8099',
    url: 'http://localhost:8099/',
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
