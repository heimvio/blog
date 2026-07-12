// Blog-API: Migrationen → Hono-Server (Port 8787, nur im Docker-Netz erreichbar;
// Caddy proxied /api/comments* und /admin* hierher, MIT vollem Pfad-Prefix).
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { env } from './env.js';
import { runMigrations } from './migrate.js';
import { commentRoutes } from './routes/comments.js';
import { adminRoutes } from './routes/admin.js';
import { closeDb } from './services/db.js';

const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true }));
app.route('/api/comments', commentRoutes);
app.route('/admin', adminRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  console.error('unhandled:', err.message);
  return c.json({ error: 'internal' }, 500);
});

await runMigrations();

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`blog-api bereit auf :${info.port}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(() => { void closeDb().then(() => process.exit(0)); });
  });
}
