// Statische Astro-Site für https://heimvio.de — zwei Sektionen aus EINEM Build:
//   src/pages/blog/*  ->  dist/blog/*  ->  /blog/   (Artikel)
//   src/pages/doku/*  ->  dist/doku/*  ->  /doku/   (Benutzerdokumentation)
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
