import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://www.randaworks.com',
  base: '/journal',
  integrations: [mdx()],
  outDir: '../journal',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    assets: '_astro',
  },
  vite: {
    build: {
      // Don't wipe journal/ on rebuild — preserves static HTML not yet migrated to MDX
      emptyOutDir: false,
    },
  },
});
