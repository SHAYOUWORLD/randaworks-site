import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const journal = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './src/content/journal',
  }),
  schema: z.object({
    title: z.string().max(60),
    description: z.string().max(160),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('RandaWorks'),
    heroImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    category: z.enum(['devlog', 'game-design', 'research', 'ai', 'guides']),
    draft: z.boolean().default(false),
  }),
});

export const collections = { journal };
