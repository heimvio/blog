// Admin-Bereich (Caddy: handle /admin* → blog-api).
//   /admin/            → statisches Review-UI (index.html + app.js, PKCE)
//   /admin/config.js   → clientId/issuer für das UI (aus env)
//   /admin/api/*       → JWT-geschützte Review-Queue + approve/reject
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { adminAuth, type AuthVars } from '../middleware/auth.js';
import { sql } from '../services/db.js';
import { env } from '../env.js';

const ADMIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'admin');

export const adminRoutes = new Hono<{ Variables: AuthVars }>();

// --- JWT-geschützte API (VOR den statischen Routen registriert) --------------
adminRoutes.use('/api/*', adminAuth);

adminRoutes.get('/api/comments', async (c) => {
  const status = c.req.query('status') ?? 'review';
  if (!['pending', 'approved', 'review', 'rejected'].includes(status)) return c.json({ error: 'bad_status' }, 400);
  const rows = await sql()`
    SELECT id, post_slug, author_name, content, status, claude_reason, created_at
    FROM comments WHERE status = ${status} ORDER BY created_at ASC LIMIT 200`;
  return c.json(rows);
});

adminRoutes.post('/api/comments/:id/approve', async (c) => {
  const rows = await sql()`
    UPDATE comments SET status = 'approved', approved_at = now()
    WHERE id = ${c.req.param('id')} RETURNING id`;
  return rows.length ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});

adminRoutes.post('/api/comments/:id/reject', async (c) => {
  const rows = await sql()`
    UPDATE comments SET status = 'rejected' WHERE id = ${c.req.param('id')} RETURNING id`;
  return rows.length ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});

// Artikel-Statistik: Aufrufe (gesamt + 30 Tage), Feedback-Summen, Kommentare.
adminRoutes.get('/api/stats', async (c) => {
  const rows = await sql()`
    WITH v AS (
      SELECT post_slug,
             sum(views)::int AS views_total,
             sum(views) FILTER (WHERE day > current_date - 30)::int AS views_30d
      FROM page_views GROUP BY post_slug
    ), f AS (
      SELECT post_slug,
             count(*) FILTER (WHERE vote = 'up')::int AS up,
             count(*) FILTER (WHERE vote = 'down')::int AS down
      FROM feedback GROUP BY post_slug
    ), k AS (
      SELECT post_slug, count(*) FILTER (WHERE status = 'approved')::int AS comments
      FROM comments GROUP BY post_slug
    )
    SELECT COALESCE(v.post_slug, f.post_slug, k.post_slug) AS post_slug,
           COALESCE(v.views_total, 0) AS views_total,
           COALESCE(v.views_30d, 0)  AS views_30d,
           COALESCE(f.up, 0) AS up, COALESCE(f.down, 0) AS down,
           COALESCE(k.comments, 0) AS comments
    FROM v
    FULL OUTER JOIN f ON f.post_slug = v.post_slug
    FULL OUTER JOIN k ON k.post_slug = COALESCE(v.post_slug, f.post_slug)
    ORDER BY views_total DESC NULLS LAST`;
  return c.json(rows);
});

// --- Statisches UI + Konfiguration -------------------------------------------
adminRoutes.get('/config.js', (c) => {
  const cfg = JSON.stringify({ clientId: env.ADMIN_CLIENT_ID, issuer: env.ZITADEL_ISSUER });
  return c.body(`window.BLOG_ADMIN_CONFIG = ${cfg};`, 200, { 'content-type': 'text/javascript' });
});

async function serveFile(name: string, type: string) {
  const body = await readFile(path.join(ADMIN_DIR, name));
  return { body, type };
}

adminRoutes.get('/app.js', async (c) => {
  const f = await serveFile('app.js', 'text/javascript');
  return c.body(f.body, 200, { 'content-type': f.type });
});

adminRoutes.get('/*', async (c) => {
  const f = await serveFile('index.html', 'text/html; charset=utf-8');
  return c.body(f.body, 200, { 'content-type': f.type, 'cache-control': 'no-store' });
});
