// Öffentliche Kommentar-Endpoints (Caddy: handle /api/comments* → blog-api).
// Flow: Honeypot → Rate-Limit (1/IP-Hash/h, DB-Count) → insert pending →
// Claude-Moderation → Status; review → E-Mail. Moderations-Fehler → review.
import { Hono } from 'hono';
import { createHmac } from 'node:crypto';
import { sql } from '../services/db.js';
import { moderateComment } from '../services/claude.js';
import { notifyReview } from '../services/mailer.js';
import { env } from '../env.js';

export const commentRoutes = new Hono();

function ipHash(c: { req: { header: (n: string) => string | undefined } }): string {
  // Nur Caddy erreicht die blog-api (internes Docker-Netz) → erster XFF-Eintrag
  // ist die echte Client-IP. Nie die Socket-Adresse nehmen (wäre immer Caddy).
  const xff = c.req.header('x-forwarded-for') ?? '';
  const ip = xff.split(',')[0]?.trim() || 'unknown';
  return createHmac('sha256', env.IP_HASH_SECRET).update(ip).digest('hex');
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;

commentRoutes.post('/', async (c) => {
  let body: { slug?: string; author_name?: string; content?: string; website?: string };
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad_json' }, 400); }

  const slug = String(body.slug ?? '').trim();
  const author = String(body.author_name ?? '').trim().slice(0, 80);
  const content = String(body.content ?? '').trim().slice(0, 4000);
  if (!SLUG_RE.test(slug) || !author || content.length < 3) return c.json({ error: 'invalid' }, 400);

  // Honeypot: Feld ausgefüllt = Bot → 201 vortäuschen, nichts speichern.
  if (String(body.website ?? '') !== '') return c.json({ status: 'pending' }, 201);

  const db = sql();
  const hash = ipHash(c);

  const [{ n }] = await db`
    SELECT count(*)::int AS n FROM comments
    WHERE ip_hash = ${hash} AND created_at > now() - interval '1 hour'`;
  if (n >= 1) return c.json({ error: 'rate_limited' }, 429);

  const [row] = await db`
    INSERT INTO comments (post_slug, author_name, content, ip_hash)
    VALUES (${slug}, ${author}, ${content}, ${hash})
    RETURNING id, post_slug, author_name, content`;

  let status: string; let reason: string | null;
  try {
    const mod = await moderateComment(author, content);
    status = mod.decision === 'approve' ? 'approved' : mod.decision === 'reject' ? 'rejected' : 'review';
    reason = mod.reason;
  } catch (err) {
    // Nie auto-veröffentlichen: Moderationsfehler → menschliche Prüfung.
    status = 'review';
    reason = `moderation_error: ${(err as Error).message}`;
  }

  await db`
    UPDATE comments SET status = ${status}, claude_reason = ${reason},
      approved_at = ${status === 'approved' ? db`now()` : null}
    WHERE id = ${row.id}`;

  if (status === 'review') {
    void notifyReview({ id: row.id, post_slug: slug, author_name: author, content, claude_reason: reason });
  }
  return c.json({ status }, 201);
});

commentRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!SLUG_RE.test(slug)) return c.json([], 200);
  const rows = await sql()`
    SELECT author_name, content, created_at FROM comments
    WHERE post_slug = ${slug} AND status = 'approved'
    ORDER BY created_at ASC LIMIT 200`;
  return c.json(rows);
});
