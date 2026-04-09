import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

export default defineConfig({
  site: 'https://www.randaworks.com',
  outDir: './dist',
  publicDir: './public',
  build: {
    assets: '_astro',
    format: 'directory',
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin/'),
    }),
    mdx(),
  ],
  markdown: {
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: 'wrap' }],
    ],
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
