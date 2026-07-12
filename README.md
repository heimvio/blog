# Heimvio Blog

Astro+MDX-Blog unter <https://heimvio.de/blog/> mit Kommentar-API (Hono,
Claude-Moderation) und Admin-Review-UI. Architektur: [blog_ARCHITECTURE.md](blog_ARCHITECTURE.md).

## Struktur

- `blog/*.mdx` — die Posts (Frontmatter: title, description, date, tags, audience)
- `src/` — Astro-Templates (Layout, Kommentar-/Feedback-Islands, Seiten)
- `api/` — Hono-Kommentar-Service (eigenes Docker-Image `heimvio-blog-api:prod`)
- `deploy/` — Compose (hängt im externen Netz `heimvio-prod_default`) + Env-Vorlage
- `.gitea/workflows/deploy.yml` — CI: Push auf `main` → Build → `/var/www/blog` + API-Roll

## Entwickeln

```bash
npm install && npm run dev        # Blog: http://localhost:4321/blog/
cd api && npm install && npm run dev   # API (braucht DATABASE_URL etc., siehe deploy/env.blog.example)
```

## Deploy

`git push origin main` — der Gitea-Runner auf heimvio.de baut und deployt
(statische Site nach `/var/www/blog`, Caddy liefert; API als Container).
Serverseitige Secrets: `/etc/heimvio-blog/.env.blog` (Vorlage in `deploy/`).

Neuer Post: `blog/<slug>.mdx` anlegen → push → live in <2 min.

## Kommentar-Flow

Honeypot → Rate-Limit (1/IP/h) → `pending` → Claude-Moderation
(approve/review/reject) → bei `review` E-Mail + Freigabe unter
<https://heimvio.de/admin/> (Zitadel-Login, sub-Allowlist).
