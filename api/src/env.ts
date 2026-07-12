// Env-Konfiguration der Blog-API. SMTP-Variablen heißen wie in heimvio
// (.env.prod: HEIMVIO_NOTIFY_SMTP_*), damit die Werte 1:1 kopiert werden können.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env ${name} ist nicht gesetzt`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'production',
  PORT: Number(process.env.PORT ?? 8787),

  /** postgres://blog:…@postgres:5432/blog (eigene DB, eigene Role). */
  DATABASE_URL: required('DATABASE_URL'),

  ZITADEL_ISSUER: process.env.ZITADEL_ISSUER ?? 'https://auth.heimvio.de',
  JWKS_URL: process.env.JWKS_URL ?? 'https://auth.heimvio.de/oauth/v2/keys',

  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',

  SMTP_HOST: process.env.HEIMVIO_NOTIFY_SMTP_HOST ?? '',
  SMTP_PORT: Number(process.env.HEIMVIO_NOTIFY_SMTP_PORT ?? 587),
  SMTP_USER: process.env.HEIMVIO_NOTIFY_SMTP_USER ?? '',
  SMTP_PASSWORD: process.env.HEIMVIO_NOTIFY_SMTP_PASSWORD ?? '',
  SMTP_FROM: process.env.HEIMVIO_NOTIFY_SMTP_FROM ?? '',
  /** Empfänger der Review-Benachrichtigungen. */
  NOTIFY_TO: process.env.BLOG_NOTIFY_TO ?? '',

  /** Zitadel-App „blog-admin" (PKCE, public) für das Admin-UI. */
  ADMIN_CLIENT_ID: process.env.BLOG_ADMIN_CLIENT_ID ?? '',
  /** Komma-getrennte Zitadel-sub-Allowlist für /admin/api/*. */
  ADMIN_SUBJECTS: (process.env.BLOG_ADMIN_SUBJECTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** HMAC-Secret für IP-Hashes (Rate-Limit ohne Klartext-IPs, DSGVO). */
  IP_HASH_SECRET: required('COMMENT_IP_HASH_SECRET'),
};
