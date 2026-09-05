import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// The demo is reached at northbound-dev.com/demos/atlas/, proxied by the
// descent's vercel.json rewrite. `base` makes every internal link and asset
// resolve identically whether it is reached through the proxy or directly.
export default defineConfig({
  base: '/demos/atlas',
  // No trailing slashes anywhere: the descent proxies /demos/atlas/* to this
  // project, and a trailing slash was the one shape the rewrite could not carry
  // across cleanly (it arrived as a double slash and 404'd).
  trailingSlash: 'never',
  output: 'static',
  adapter: vercel({ imageService: true }),
  build: { format: 'file' },
});
