# Heimvio Content-Site

Astro+MDX-Site mit **zwei Sektionen aus einem Build**:

- **Blog** unter <https://heimvio.de/blog/> — Artikel, mit Kommentar-API (Hono,
  Claude-Moderation) und Admin-Review-UI
- **Doku** unter <https://heimvio.de/doku/> — Benutzerdokumentation, ohne Kommentare

Architektur: [blog_ARCHITECTURE.md](blog_ARCHITECTURE.md).

## Struktur

- `blog/*.mdx` — die Posts (Frontmatter: title, description, date, tags, audience)
- `doku/*.mdx` — die Doku-Seiten (Frontmatter: title, description, section, order)
- `src/` — Astro-Templates (Layouts, Kommentar-/Feedback-Islands, Seiten)
- `api/` — Hono-Kommentar-Service (eigenes Docker-Image `heimvio-blog-api:prod`)
- `deploy/` — Compose (hängt im externen Netz `heimvio-prod_default`) + Env-Vorlage
- `.gitea/workflows/deploy.yml` — CI: Push auf `main` → Build → `/var/www/heimvio-content` + API-Roll

## Warum kein `base`

Astros `base` ist ein **globaler Wert pro Build** — mit `base: '/blog'` liesse sich keine
zweite Sektion unter `/doku/` ausliefern. Stattdessen sind die Prefixe echte Verzeichnisse
(`src/pages/blog/`, `src/pages/doku/` → `dist/blog/`, `dist/doku/`). Caddy serviert `dist/`
als Root und darf den Pfad **nicht** strippen (`handle`, nicht `handle_path`).

Nebeneffekt: absolute `/blog/…`-Links im Code und in den MDX-Querverweisen sind damit
schlicht korrekt, statt von `base` abzuhängen.

## Entwickeln

```bash
npm install && npm run dev        # Blog: http://localhost:4321/blog/
                                  # Doku: http://localhost:4321/doku/
cd api && npm install && npm run dev   # API (braucht DATABASE_URL etc., siehe deploy/env.blog.example)
```

## Deploy

`git push origin main` — der Gitea-Runner auf heimvio.de baut und deployt
(statische Site nach `/var/www/heimvio-content`, Caddy liefert; API als Container).
Serverseitige Secrets: `/etc/heimvio-blog/.env.blog` (Vorlage in `deploy/`).

Neuer Post: `blog/<slug>.mdx` anlegen → push → live in <2 min.
Neue Doku-Seite: `doku/<slug>.mdx` mit `section` + `order` → push. Navigation und
Zurück/Weiter bauen sich daraus von selbst.

## Kommentar-Flow

Honeypot → Rate-Limit (1/IP/h) → `pending` → Claude-Moderation
(approve/review/reject) → bei `review` E-Mail + Freigabe unter
<https://heimvio.de/admin/> (Zitadel-Login, sub-Allowlist).

Gilt **nur für Blog-Posts**. Doku-Seiten haben bewusst keine Kommentare: `post_slug` ist in
der API ein globaler Namensraum — Doku- und Blog-Slugs würden sich sonst die Zähler teilen.
