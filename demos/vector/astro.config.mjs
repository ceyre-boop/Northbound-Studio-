import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Same shape as Atlas: the descent proxies /demos/vector/* to this project.
// trailingSlash 'never' is not cosmetic — a trailing slash is the one path the
// rewrite cannot carry across, and it arrives as a double slash and 404s.
export default defineConfig({
  base: '/demos/vector',
  trailingSlash: 'never',
  output: 'static',
  adapter: vercel(),
  build: { format: 'file' },
});
