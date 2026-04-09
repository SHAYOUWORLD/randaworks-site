import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const entries = await getCollection('journal', ({ data }) => !data.draft);

  const sorted = entries.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );

  return rss({
    title: 'RandaWorks 制作ノート',
    description:
      '日本史因果クロニクルの開発ログ、ゲーム設計、AI活用、リサーチなど',
    site: context.site!,
    items: sorted.map((entry) => {
      const parts = entry.id.split('/');
      const category = parts[0];
      const slug = parts.slice(1).join('/');
      return {
        title: entry.data.title,
        description: entry.data.description,
        pubDate: entry.data.pubDate,
        link: `/journal/${category}/${slug}/`,
      };
    }),
    customData: '<language>ja</language>',
  });
}
