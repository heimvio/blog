// /doku/anchors.json — die Sprungmarken (Ueberschriften-Ids) jeder Doku-Seite, so wie
// sie im ausgelieferten HTML stehen. Keine eigene Slug-Logik:
//   1. render(entry).headings — die Markdown-Ueberschriften, deren Ids Astro selbst
//      vergibt (rehype-heading-ids, intern github-slugger);
//   2. dazu die Ids der Ueberschriften, die eine eingebettete Komponente mitbringt
//      (z. B. <Preise /> mit <h2 id="tarife-und-preise">) — die stehen nicht in
//      `headings`. Dafuer wird der Seiteninhalt einmal mit der Container-API
//      gerendert und nach <hN id="…"> durchsucht.
//
// Leser: der Lint `lint:doc-links` im heimvio-Repo (scripts/lint-doc-links.mjs)
// prueft damit, dass jeder Doku-Link der SPA (core/docs/doc-topics.ts) ein Ziel hat,
// und scripts/check-heimvio-doc-topics.mjs prueft vor dem Ausliefern die Gegenrichtung.
// Format (Vertrag, nicht ohne beide Pruefungen aendern):
//   { "generated": "<ISO>", "pages": { "<slug>": ["<anchor>", …] } }
import type { APIRoute } from 'astro';
import { getContainerRenderer as mdxRenderer } from '@astrojs/mdx';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { getCollection, render } from 'astro:content';

const HEADING_ID = /<h[1-6]\b[^>]*\sid="([^"]+)"/g;

export const GET: APIRoute = async () => {
  const entries = await getCollection('doku', ({ data }) => !data.draft);
  const container = await AstroContainer.create({
    renderers: await loadRenderers([mdxRenderer()]),
  });
  const slugOf = (e: (typeof entries)[number]) => e.data.slug ?? e.id;
  const pages: Record<string, string[]> = {};
  for (const entry of entries.sort((a, b) => slugOf(a).localeCompare(slugOf(b)))) {
    const { Content, headings } = await render(entry);
    const ids = headings.map((h) => h.slug);
    const html = await container.renderToString(Content);
    for (const m of html.matchAll(HEADING_ID)) if (!ids.includes(m[1])) ids.push(m[1]);
    pages[slugOf(entry)] = ids;
  }
  const body = { generated: new Date().toISOString(), pages };
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
