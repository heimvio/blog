# Heimvio Blog – Architektur

## Überblick

Der Heimvio Blog ist eine eigenständige Astro-basierte Anwendung im Gitea-Repo `heimvio-blog`. Er läuft auf demselben Hetzner CCX13 wie die Heimvio-App, teilt sich PostgreSQL und ZITADEL, hat aber eine vollständig getrennte Deploy-Pipeline.

**Zweck:** SEO-getriebener Content für deutsche Kleinvermieter (1–3 Einheiten) rund um Nebenkostenabrechnung, Heizkostenabrechnung, Anlage V und Messdienstleister.

---

## Stack

| Komponente | Technologie | Begründung |
|---|---|---|
| Static Site Generator | Astro + MDX | Sauberstes HTML-Output, beste Core Web Vitals, MDX für gelegentliche interaktive Elemente |
| Content-Format | MDX (Markdown + JSX) | 99% Markdown, bei Bedarf React-Komponenten inline |
| Backend | Hono (TypeScript) | Bereits im Einsatz für Heimvio |
| Datenbank | PostgreSQL | Bereits im Einsatz, eine zusätzliche Tabelle |
| Auth (Admin) | ZITADEL | Bereits im Einsatz, OIDC-Flow bekannt |
| Moderation | Claude API | Vollautomatisch für Spam/OK, manuell für Grenzfälle |
| Webserver | Nginx | Bereits im Einsatz |
| CI/CD | Gitea Actions + Runner auf Hetzner | Kein externer Dienst, kein SSH-Key extern |

---

## Infrastruktur

```
┌─────────────────────────────────────────────────┐
│                  Hetzner CCX13                  │
│                                                 │
│  ┌─────────────┐    ┌──────────────────────┐   │
│  │    Caddy    │    │ /var/www/heimvio-    │   │
│  │             │    │ content/             │   │
│  │ /blog/*  ───│───▶│   blog/  (Astro-Out) │   │
│  │ /doku/*  ───│───▶│   doku/  (Astro-Out) │   │
│  │ /api/*   ───│───▶┐                      │   │
│  │ /admin/* ───│───▶┤  └──────────────────┘   │
│  └─────────────┘    │                          │
│                     ▼                          │
│              ┌─────────────┐                   │
│              │    Hono     │                   │
│              │  (Backend)  │                   │
│              └──────┬──────┘                   │
│                     │                          │
│         ┌───────────┼───────────┐              │
│         ▼           ▼           ▼              │
│   ┌──────────┐ ┌─────────┐ ┌────────┐         │
│   │PostgreSQL│ │ Claude  │ │ZITADEL │         │
│   │          │ │   API   │ │        │         │
│   └──────────┘ └─────────┘ └────────┘         │
│                                                 │
│  ┌──────────────────────┐                      │
│  │    Gitea Runner      │                      │
│  │  (Systemd-Service)   │                      │
│  │  capacity = 3        │                      │
│  └──────────────────────┘                      │
└─────────────────────────────────────────────────┘

          ┌──────────────────────┐
          │       Gitea          │
          │  Repo: heimvio-blog  │
          │                     │
          │  blog/**/*.mdx      │
          │  src/** (Templates) │
          │                     │
          │  Push → Action →    │
          │  build → deploy     │
          └──────────────────────┘
```

---

## Routing

```
heimvio.de/blog/*           → Caddy → /var/www/heimvio-content/blog/ (statisch, Astro)
heimvio.de/doku/*           → Caddy → /var/www/heimvio-content/doku/ (statisch, Astro)
heimvio.de/api/comments/*   → Caddy → Hono (öffentlich)
heimvio.de/admin/comments   → Caddy → Hono (ZITADEL-geschützt)
```

Beide statischen Sektionen kommen aus **einem** Astro-Build. Es gibt bewusst **kein**
`base` in der astro.config: `base` ist ein globaler Wert pro Build, zwei Prefixe gingen
damit nicht. Stattdessen sind `/blog/` und `/doku/` echte Verzeichnisse im Build — Caddy
serviert `dist/` als Root und darf den Pfad daher **nicht** strippen (`handle`, nicht
`handle_path`). Die Caddy-Konfiguration lebt im green-Repo (`ops/deploy/Caddyfile`).

---

## Kommentar-System

### Kommentar-Flow

```
Nutzer postet Kommentar
→ Honeypot-Check (Hono) – Bot: sofort verwerfen
→ Rate Limit: max. 1 Kommentar / IP / Stunde
→ PostgreSQL: status = "pending"
→ Claude API moderiert

   ├── reject  → status = "rejected", fertig
   │
   ├── review  → status = "review"
   │             E-Mail an Volkmar
   │             Admin-UI (ZITADEL-Login)
   │             → approve oder reject
   │
   └── approve → status = "approved"
                 sofort sichtbar via API
```

### Kommentar-Anzeige

Kommentare sind **dynamisch** – nicht im statischen HTML enthalten:

```
Astro baut statisches HTML (ohne Kommentare)
→ Astro Island (JavaScript) lädt beim Seitenaufruf:
  GET /api/comments/:slug
→ zeigt approved Kommentare
→ SEO-neutral (Google bewertet Artikelinhalt, nicht Kommentare)
```

### Datenbankschema

```sql
CREATE TABLE comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_slug     TEXT NOT NULL,
  author_name   TEXT NOT NULL,
  content       TEXT NOT NULL,
  status        TEXT DEFAULT 'pending',
  -- pending | approved | review | rejected
  claude_reason TEXT,
  -- Begründung bei status = "review"
  created_at    TIMESTAMPTZ DEFAULT now(),
  approved_at   TIMESTAMPTZ
);

CREATE INDEX idx_comments_slug_status
  ON comments (post_slug, status);
```

### Hono Endpoints

```typescript
// Öffentlich
POST /api/comments          // Kommentar einreichen
GET  /api/comments/:slug    // Approved Kommentare abrufen

// ZITADEL-geschützt
GET  /admin/comments        // Review-Queue
POST /admin/comments/:id/approve
POST /admin/comments/:id/reject
```

### Claude Moderations-Prompt

```
Du moderierst Kommentare für einen deutschen Immobilien/Mietrecht-Blog
(Zielgruppe: Kleinvermieter, Mieter). Antworte ausschließlich mit JSON:

{
  "decision": "approve|review|reject",
  "reason": "kurze Begründung auf Deutsch"
}

reject:  Spam, Werbung, Beleidigungen, sinnloser Inhalt, Off-Topic
review:  Rechtlich fragwürdig, unklar, grenzwertig
approve: Sachlich, themenbezogen, konstruktiv
```

---

## CI/CD

### Gitea Runner

- Läuft als Systemd-Service auf Hetzner CCX13
- `capacity = 3` – bis zu 3 parallele Jobs (Blog, Heimvio, ProxVex)
- Registrierung per Token aus Gitea-UI, einmalig

### Gitea Action

```yaml
# .gitea/workflows/deploy.yml
name: Build and Deploy Blog

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: hetzner
    steps:
      - uses: actions/checkout@v3

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Deploy
        run: rsync -a --delete --delay-updates dist/ /var/www/heimvio-content/
```

Runner und Zielverzeichnis liegen auf demselben Server. `--delete` ist korrekt, weil
`dist/` genau der Content-Root ist (`blog/`, `doku/`, `sitemap*`, `robots.txt`) — entfernte
Seiten verschwinden damit auch wirklich. Caddy liest das Verzeichnis read-only über einen
Bind-Mount; ein Reload ist nicht nötig.

---

## SEO-Strategie

### Was statisch bleibt (SEO-relevant)
- Artikeltext, H1–H3-Struktur
- Title, Meta-Description (aus MDX-Frontmatter)
- Kanonische URLs
- Sitemap (`/sitemap.xml`, Astro-Plugin)
- RSS-Feed (`/blog/rss.xml`)
- Open Graph Tags (für Social Sharing)
- Schema.org Markup (`Article`, `FAQPage`)

### MDX Frontmatter pro Post
```mdx
---
title: "Nebenkostenabrechnung Fehler: Die 7 häufigsten Irrtümer"
description: "Laut Deutschem Mieterbund enthält jede zweite Abrechnung Fehler..."
slug: nebenkostenabrechnung-fehler
date: 2026-07-01
tags: [nebenkostenabrechnung, vermieter, fehler]
canonical: https://heimvio.de/blog/nebenkostenabrechnung-fehler
---
```

### Was dynamisch bleibt (SEO-neutral)
- Kommentare (per JavaScript nachgeladen)
- 👍/👎 Feedback-Widget

---

## Content-Workflow

```
1. Forum-Recherche → relevante Fragen identifizieren
2. Claude.ai → Blogartikel als .mdx generieren
3. Review in VS Code (MDX-Extension: unifiedjs.vscode-mdx)
4. Lokale Vorschau: astro dev
5. git push → Gitea Action → automatisch live
```

### Zielgruppen und Heimvio-Erwähnung

| Zielgruppe | Heimvio erwähnen? |
|---|---|
| Kleinvermieter | Ja, dezent als persönliche Erfahrung |
| Mieter | Nein |
| Messdienstleister-Themen | Nein |

---

## Repo-Struktur

```
heimvio-blog/
├── .gitea/
│   └── workflows/
│       └── deploy.yml
├── src/
│   ├── layouts/
│   │   └── BlogPost.astro      # Layout-Template
│   ├── components/
│   │   ├── Comments.astro      # Astro Island
│   │   └── FeedbackWidget.astro
│   └── pages/
│       ├── index.astro         # Blog-Übersicht
│       └── blog/
│           └── [...slug].astro # Dynamisches Routing
├── blog/
│   └── *.mdx                   # Blog-Posts
├── public/
│   └── images/
├── astro.config.mjs
├── package.json
└── ARCHITECTURE.md             # dieses Dokument
```

---

## Gitea Repos Übersicht

```
gitea/
├── heimvio/        # Hono Backend + React Frontend (proprietär)
├── heimvio-blog/   # Astro Blog (dieses Repo)
└── proxvex/        # ProxVex LXC Deployer (Open Source)
```

Gemeinsam genutzte Infrastruktur auf Hetzner CCX13:
- PostgreSQL (je eigene Datenbank/Schema)
- ZITADEL (gemeinsame Auth-Instanz)
- Nginx (virtuelle Hosts)
- Gitea Runner (`capacity = 3`)

---

## Offene Punkte

- [ ] Gitea Runner einrichten (Systemd-Service, Token registrieren)
- [ ] Astro-Projekt initialisieren (`npm create astro@latest`)
- [ ] MDX-Integration (`@astrojs/mdx`)
- [ ] Nginx-Konfiguration für `/blog/*`
- [ ] PostgreSQL `comments`-Tabelle anlegen
- [ ] Hono-Endpoints implementieren
- [ ] Claude Moderations-Endpoint implementieren
- [ ] ZITADEL-Middleware für `/admin/*`
- [ ] Admin-UI (Review-Queue)
- [ ] E-Mail-Benachrichtigung bei `review`-Status (mailbox.org)
- [ ] Ersten Blogpost schreiben und deployen
