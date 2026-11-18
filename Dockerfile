# heimvio-blog — EIN Image fuer heimvio.de (heimvio Plan #160 R2c, Variante A):
#   /site  = statische Astro-Site (dist/: /blog/, /site/v1/site.css, robots.txt,
#            Sitemaps) — heimvio.de kopiert sie per ops/blog/blog-sync.sh in den
#            Content-Ordner von Caddy (ohne /doku/, die liefert das heimvio-Repo)
#   /app   = Kommentar-API blog-api (Hono, Port 8787, Migrationen beim Start)
# Gebaut von .github/workflows/image.yml, Ziel ghcr.io/heimvio/heimvio-blog.
# Der Host baut nichts mehr aus Quellcode; er zieht dieses Image.

# --- statische Site --------------------------------------------------------
FROM node:24-trixie-slim AS site
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY astro.config.mjs tsconfig.json ./
COPY src ./src
COPY public ./public
COPY blog ./blog
RUN npm run build \
 && test -f dist/blog/index.html \
 && test -f dist/site/v1/site.css \
 && test ! -e dist/doku

# --- blog-api ----------------------------------------------------------------
FROM node:24-trixie-slim AS api
WORKDIR /app
COPY api/package.json api/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build && npm prune --omit=dev

# --- Laufzeit ----------------------------------------------------------------
FROM node:24-trixie-slim
LABEL org.opencontainers.image.source="https://github.com/heimvio/heimvio-blog" \
      org.opencontainers.image.description="heimvio Blog: statische Site unter /site, Kommentar-API blog-api" \
      org.opencontainers.image.licenses="UNLICENSED"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api /app/node_modules ./node_modules
COPY --from=api /app/dist ./dist
COPY api/migrations ./migrations
COPY api/admin ./admin
COPY --from=site /src/dist /site
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
