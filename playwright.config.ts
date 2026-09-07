import { defineConfig, devices } from '@playwright/test';

/* The site is static: serve the repo root and drive it. */
export default defineConfig({
  testDir: './tests',
  // Seven sections of canvas and spring animation: parallel workers starve
  // each other's rAF timing into false failures. Serial is honest.
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8099' },
  webServer: {
    // Threaded: the stdlib one-liner server serialises every request, which
    // starves workers into false timeouts.
    command: 'python3 -c "from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler; ThreadingHTTPServer((\'\', 8099), SimpleHTTPRequestHandler).serve_forever()"',
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
