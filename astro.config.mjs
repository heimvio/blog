// Heimvio Blog — statisches Astro-Site unter https://heimvio.de/blog/.
// base '/blog': Caddy strippt den Prefix beim Ausliefern NICHT aus den URLs,
// nur beim Datei-Lookup (handle_path) — Astro generiert daher alle Links/Assets
// mit /blog/-Prefix, die Dateien landen flach in dist/.
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://heimvio.de',
  base: '/blog',
  trailingSlash: 'ignore',
  integrations: [mdx(), sitemap()],
});
