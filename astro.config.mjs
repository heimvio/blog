// Statische Astro-Site für https://heimvio.de/blog/ (Artikel):
//   src/pages/blog/*  ->  dist/blog/*  ->  /blog/
//   public/site/v1/site.css -> /site/v1/site.css (Aussehen der Site, auch für die Doku)
// Die Benutzerdokumentation (/doku/) liegt seit Plan #119 im heimvio-Repo (doku/).
//
// Bewusst KEIN `base`: Astros base ist ein globaler Wert pro Build — zwei Sektionen
// mit unterschiedlichem Prefix gingen damit nicht. Stattdessen sind die Prefixe echte
// Verzeichnisse im Build. Caddy serviert dist/ als Root und darf den Pfad NICHT
// strippen (kein handle_path). Nebeneffekt: die absoluten /blog/-Links im Code und in
// den MDX-Querverweisen sind damit einfach korrekt, statt von `base` abzuhängen.
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://heimvio.de',
  trailingSlash: 'ignore',
  integrations: [mdx(), sitemap()],
});
