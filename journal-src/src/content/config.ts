import { defineCollection, z } from 'astro:content';

const journal = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    category: z.enum(['devlog', 'game-design', 'ai', 'game-study', 'research']),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    related: z.array(z.string()).default([]),
  }),
});

export const collections = { journal };
