// Review-Benachrichtigung per SMTP (nodemailer). Fehler werden geloggt, nie
// geworfen — eine kaputte Mail darf den Kommentar-Flow nicht abbrechen.
import nodemailer from 'nodemailer';
import { env } from '../env.js';

let transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (!env.SMTP_HOST || !env.NOTIFY_TO) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return transport;
}

export async function notifyReview(c: {
  id: string; post_slug: string; author_name: string; content: string; claude_reason: string | null;
}): Promise<void> {
  const t = getTransport();
  if (!t) { console.warn('mailer: SMTP/NOTIFY_TO nicht konfiguriert — Review-Mail übersprungen'); return; }
  try {
    await t.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: env.NOTIFY_TO,
      subject: `Blog-Kommentar wartet auf Freigabe (${c.post_slug})`,
      text: [
        `Post:      https://heimvio.de/blog/${c.post_slug}`,
        `Von:       ${c.author_name}`,
        `Begründung: ${c.claude_reason ?? '—'}`,
        '',
        c.content,
        '',
        `Freigeben/Ablehnen: https://heimvio.de/admin/`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('mailer: Review-Mail fehlgeschlagen:', (err as Error).message);
  }
}
