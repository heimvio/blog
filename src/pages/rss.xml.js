// RSS-Feed: https://heimvio.de/blog/rss.xml
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
  return rss({
    title: 'Heimvio Blog',
    description: 'Nebenkostenabrechnung, Heizkosten und Anlage V — praxisnah für Kleinvermieter.',
    site: context.site,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: `/blog/${p.data.slug ?? p.id}`,
    })),
    customData: '<language>de-DE</language>',
  });
}
