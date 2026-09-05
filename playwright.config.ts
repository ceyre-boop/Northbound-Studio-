import { defineConfig, devices } from '@playwright/test';

/* The site is static: serve the repo root and drive it. */
export default defineConfig({
  testDir: './tests',
  // Seven floors of canvas animation at 60fps: parallel workers starve each
  // other's rAF and smooth-scroll timing into false failures. Serial is honest.
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8099' },
  webServer: {
    // Threaded: the stdlib one-liner server is single-threaded and serialises
    // every request, which starves parallel workers into false timeouts.
    command: 'python3 -c "from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler; ThreadingHTTPServer((\'\', 8099), SimpleHTTPRequestHandler).serve_forever()"',
    url: 'http://localhost:8099/',
    reuseExistingServer: true,
    timeout: 20_000,
  },
  projects: [
    {
      // CSS scroll-snap is compositor-driven: neither headless Chromium nor a
      // headless channel runs it, so the snap assertions need real headed
      // Chrome. Everything else stays headless and fast.
      name: 'snap-chrome',
      testMatch: /snap\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 },
             channel: 'chrome', headless: false },
    },
    {
      name: 'desktop',
      testIgnore: /snap\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' },
    },
    {
      name: 'mobile',
      testIgnore: /snap\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', hasTouch: true },
    },
    {
      name: 'desktop-reduced',
      testIgnore: /snap\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' },
    },
  ],
});
