// Zitadel-JWT-Validierung (Kopie des heimvio-sidecar-Musters, nur Remote-JWKS)
// + sub-Allowlist: die Blog-Administration ist genau den in BLOG_ADMIN_SUBJECTS
// gelisteten Zitadel-Usern erlaubt.
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { env } from '../env.js';

export type AuthVars = { claims: JWTPayload & { sub: string } };

let jwks: JWTVerifyGetKey | null = null;

function getJwks(): JWTVerifyGetKey {
  if (!jwks) jwks = createRemoteJWKSet(new URL(env.JWKS_URL));
  return jwks;
}

export const adminAuth = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  const header = c.req.header('authorization');
  if (!header?.startsWith('Bearer ')) return c.json({ error: 'no_token' }, 401);

  try {
    const { payload } = await jwtVerify(header.slice(7), getJwks(), {
      algorithms: ['RS256'],
      issuer: env.ZITADEL_ISSUER,
    });
    if (typeof payload.sub !== 'string') return c.json({ error: 'invalid_token' }, 401);
    if (!env.ADMIN_SUBJECTS.includes(payload.sub)) return c.json({ error: 'forbidden' }, 403);
    c.set('claims', payload as AuthVars['claims']);
    await next();
  } catch {
    return c.json({ error: 'invalid_token' }, 401);
  }
});
