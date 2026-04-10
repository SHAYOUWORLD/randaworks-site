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
      filter: (page) =>
        !page.includes('/admin/') &&
        !page.includes('/tools/furigana/'),
      customPages: [
        // Static HTML pages in public/ (not auto-detected by Astro)
        'https://www.randaworks.com/',
        'https://www.randaworks.com/contact/',
        'https://www.randaworks.com/faq/',
        'https://www.randaworks.com/games/',
        'https://www.randaworks.com/games/inga/privacy/',
        'https://www.randaworks.com/games/inga/support/',
        'https://www.randaworks.com/privacy/',
        'https://www.randaworks.com/support/',
        'https://www.randaworks.com/terms/',
        'https://www.randaworks.com/videos/',
        // English variants
        'https://www.randaworks.com/en/',
        'https://www.randaworks.com/en/about/',
        'https://www.randaworks.com/en/contact/',
        'https://www.randaworks.com/en/games/',
        'https://www.randaworks.com/en/games/inga/',
        'https://www.randaworks.com/en/games/inga/privacy/',
        'https://www.randaworks.com/en/games/inga/support/',
        'https://www.randaworks.com/en/privacy/',
        'https://www.randaworks.com/en/support/',
        'https://www.randaworks.com/en/terms/',
        'https://www.randaworks.com/en/videos/',
      ],
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
