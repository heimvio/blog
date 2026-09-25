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

`git push origin main` — der Gitea-Runner `heimvio-runner-fast` auf ubuntupve
(Label `ubuntu-latest`) baut die Site und liefert sie per ssh aus
(`deploy/upload-to-hetzner.sh`): statische Site nach
`/var/www/heimvio-content` auf heimvio.de, Caddy liefert sie read-only; die
Kommentar-API wird dort als Image gebaut und gerollt.
Serverseitige Secrets: `/etc/heimvio-blog/.env.blog` (Vorlage in `deploy/`).
CI-Secret: `HETZNER_SSH_KEY` (base64-kodierter privater Key
`heimvio-blog-deploy`, öffentlicher Teil in `/root/.ssh/authorized_keys`).

Bis 09/2026 lief der Job auf dem Host-Label `hetzner-host`. Nachdem der dortige
Runner neu registriert wurde, war er nur noch für `heimvio/heimvio` zuständig —
Läufe dieses Repos blieben ohne Fehlermeldung in der Warteschlange und die Doku
war von Juli bis September nicht aktuell. Deshalb ssh statt Host-Runner.

Neuer Post: `blog/<slug>.mdx` anlegen → push → live in <2 min.
Neue Doku-Seite: `doku/<slug>.mdx` mit `section` + `order` → push. Navigation und
Zurück/Weiter bauen sich daraus von selbst.

## Kommentar-Flow

Honeypot → Rate-Limit (1/IP/h) → `pending` → Claude-Moderation
(approve/review/reject) → bei `review` E-Mail + Freigabe unter
<https://heimvio.de/admin/> (Zitadel-Login, sub-Allowlist).

Gilt **nur für Blog-Posts**. Doku-Seiten haben bewusst keine Kommentare: `post_slug` ist in
der API ein globaler Namensraum — Doku- und Blog-Slugs würden sich sonst die Zähler teilen.
