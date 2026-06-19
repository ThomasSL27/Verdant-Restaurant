// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://verdant.restaurant',
  integrations: [sitemap()],
  build: {
    // Inline page CSS into the HTML so it isn't a render-blocking request.
    inlineStylesheets: 'always',
  },
});
